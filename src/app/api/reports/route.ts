import { NextResponse } from "next/server";
import { z } from "zod";
import { privateRoute, readJson, rateLimit, HttpError, requireOwner } from "@/lib/privateApi";
import { getUserSettings } from "@/lib/userData";
import { ownedCollection } from "@/lib/ownership";
import { closedYear } from "@/lib/reportPeriods";
import { hasReportExpenses, queueReport, reportDocuments, reportId, summarizeReport } from "@/lib/reportStore";
import type { ReportDoc } from "@/lib/reportStore";
import { maxReviewedInsights, selectReportInsights } from "@/lib/reportReview";
import type { ReportDetail, ReportShelf } from "@/lib/reportTypes";

export const dynamic = "force-dynamic";

const periodKey = z.string().regex(/^(month:\d{4}-(0[1-9]|1[0-2])|quarter:\d{4}-Q[1-4]|year:\d{4})$/);

function visibleDetail(doc: ReportDoc, role: string): ReportDetail {
  const review = role === "owner" && doc.period.kind === "month" ? doc.review : undefined;
  return {
    ...summarizeReport(doc),
    story: doc.story,
    publishedAt: doc.publishedAt?.toISOString(),
    ...(review ? { review: {
      revision: review.revision, selectedIds: review.selectedIds,
      candidates: review.candidates.map(({ id, body }) => ({ id, body }))
    } } : {})
  };
}

export const GET = privateRoute(async (request, ctx) => {
  const search = new URL(request.url).searchParams;
  const collection = reportDocuments(ctx.db);
  const active = { userId: ctx.userId, deletedAt: { $exists: false } };
  const issue = search.get("issue");
  if (issue) {
    const key = periodKey.parse(issue);
    const doc = await collection.findOne({ ...active, _id: reportId(ctx.userId, key), status: { $ne: "skipped" } });
    if (!doc) throw new HttpError(404, "没有找到这期报告。");
    return NextResponse.json(visibleDetail(doc, ctx.user.role));
  }

  if (search.get("unread") === "1") {
    const unread = await collection.find({ ...active, status: "ready", readAt: { $exists: false } }, { projection: { _id: 1 } }).limit(1).hasNext();
    return NextResponse.json({ unread });
  }

  const annualPeriod = closedYear();
  const [issues, settings, config] = await Promise.all([
    collection.find({ ...active, status: { $ne: "skipped" } }, { projection: { period: 1, status: 1, readAt: 1, "story.title": 1 } }).sort({ "period.end": -1, publishedAt: -1 }).toArray(),
    getUserSettings(ctx),
    ownedCollection(ctx.db, ctx.userId, "user_ai_configs").findOne()
  ]);
  const annualExists = issues.some(issue => issue.period.key === annualPeriod.key)
    || Boolean(await collection.findOne({ _id: reportId(ctx.userId, annualPeriod.key) }, { projection: { _id: 1 } }));
  const annual = settings.reports.year && !annualExists && await hasReportExpenses(ctx.db, ctx.userId, annualPeriod, settings) ? annualPeriod : null;
  const response: ReportShelf = { issues: issues.map(summarizeReport), annual, configured: Boolean(config) };
  return NextResponse.json(response);
});

export const POST = privateRoute(async (request, ctx) => {
  const { period } = await readJson(request, z.object({ period: periodKey, confirmed: z.literal(true) }));
  const available = closedYear();
  if (period !== available.key) throw new HttpError(409, "只能确认刚结束的自然年年报。");
  const [settings, config] = await Promise.all([getUserSettings(ctx), ownedCollection(ctx.db, ctx.userId, "user_ai_configs").findOne()]);
  if (!settings.reports.year) throw new HttpError(409, "请先在设置里开启年报。");
  if (!config) throw new HttpError(422, "请先在设置中配置自己的 AI 服务。");
  if (!await hasReportExpenses(ctx.db, ctx.userId, available, settings)) throw new HttpError(409, "这个年度没有可用于报告的支出记录。");
  await rateLimit(ctx.db, ctx.userId, "report-confirm", 10);
  await queueReport(ctx.db, ctx.userId, available);
  const report = await reportDocuments(ctx.db).findOne({ _id: reportId(ctx.userId, period), userId: ctx.userId, deletedAt: { $exists: false } });
  if (!report) throw new HttpError(409, "这期报告目前无法生成。");
  return NextResponse.json(summarizeReport(report), { status: 202 });
});

export const PATCH = privateRoute(async (request, ctx) => {
  const { period } = await readJson(request, z.object({ period: periodKey }));
  await reportDocuments(ctx.db).updateOne({
    _id: reportId(ctx.userId, period), userId: ctx.userId, status: "ready", deletedAt: { $exists: false }, readAt: { $exists: false }
  }, { $set: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
});

export const PUT = privateRoute(async (request, ctx) => {
  requireOwner(ctx.user);
  const { period, revision, selectedIds } = await readJson(request, z.object({
    period: z.string().regex(/^month:\d{4}-(0[1-9]|1[0-2])$/),
    revision: z.number().int().nonnegative(),
    selectedIds: z.array(z.string().uuid()).min(1).max(maxReviewedInsights)
  }));
  const collection = reportDocuments(ctx.db);
  const filter = {
    _id: reportId(ctx.userId, period), userId: ctx.userId, status: "ready" as const,
    "period.kind": "month", deletedAt: { $exists: false }
  };
  const doc = await collection.findOne(filter);
  if (!doc?.review || !doc.story) throw new HttpError(404, "这期报告没有可调整的内容。");
  if (doc.review.revision !== revision) throw new HttpError(409, "这期报告已在别处更新，请重新打开。");
  const story = selectReportInsights(doc.review, selectedIds, doc.story);
  if (!story) throw new HttpError(422, "请选择这期报告里的不同段落。");
  await rateLimit(ctx.db, ctx.userId, "report-review", 30);
  const updated = await collection.findOneAndUpdate({ ...filter, "review.revision": revision }, {
    $set: { story, "review.selectedIds": selectedIds },
    $inc: { "review.revision": 1 }
  }, { returnDocument: "after" });
  if (!updated) throw new HttpError(409, "这期报告已在别处更新，请重新打开。");
  return NextResponse.json(visibleDetail(updated, ctx.user.role));
});
