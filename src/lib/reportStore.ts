import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { getUserAi, getUserSettings } from "@/lib/userData";
import { canRetryAi } from "@/lib/aiClient";
import { ownedCollection } from "@/lib/ownership";
import { nextReportBoundary, periodsClosingOn, reportCalendarDay } from "@/lib/reportPeriods";
import type { ReportPeriod } from "@/lib/reportPeriods";
import type { ReportReview, ReportStatus, ReportStory, ReportSummary } from "@/lib/reportTypes";
import { reportExpenseFilter, writeLifeReport } from "@/lib/reportWriting";

export type ReportDoc = {
  _id: string;
  userId: string;
  period: ReportPeriod;
  status: ReportStatus;
  story?: ReportStory;
  review?: ReportReview;
  publishedAt?: Date;
  readAt?: Date;
  queuedAt: Date;
  nextAttemptAt?: Date;
  attempts: number;
  token?: string;
  leaseUntil?: Date;
  deletedAt?: Date;
};

const maxAttempts = 2;
const leaseMs = 3 * 60_000;

class ReportSkipped extends Error {}

export function reportId(userId: string, periodKey: string) {
  return userId + ":" + periodKey;
}

export function reportDocuments(db: Db) {
  return db.collection<ReportDoc>("life_reports");
}

export function summarizeReport(doc: ReportDoc): ReportSummary {
  return { period: doc.period, status: doc.status, title: doc.story?.title, unread: doc.status === "ready" && !doc.readAt };
}

export async function queueReport(db: Db, userId: string, period: ReportPeriod, now = new Date()) {
  try {
    await reportDocuments(db).updateOne({ _id: reportId(userId, period.key) }, {
      $setOnInsert: { userId, period, status: "queued", queuedAt: now, nextAttemptAt: now, attempts: 0 }
    }, { upsert: true });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
  }
}

export async function hasReportExpenses(db: Db, userId: string, period: ReportPeriod, settings: Awaited<ReturnType<typeof getUserSettings>>) {
  return ownedCollection(db, userId, "transactions").find(reportExpenseFilter(period, settings), { projection: { _id: 1 } }).limit(1).hasNext();
}

async function activeAccount(db: Db, userId: string) {
  if (!ObjectId.isValid(userId)) return null;
  return db.collection("user").findOne({ _id: new ObjectId(userId), banned: { $ne: true } }, { projection: { _id: 1, role: 1 } });
}

export async function scheduleClosedReports(db: Db, now = new Date()) {
  const today = reportCalendarDay(now);
  const boundary = today.slice(0, 7) + "-01";
  const scheduler = db.collection<{ _id: string; through: string }>("report_scheduler");
  const schedule = await scheduler.findOneAndUpdate({ _id: "calendar" }, {
    $setOnInsert: { through: today === boundary ? periodsClosingOn(boundary)[0].start : boundary }
  }, { upsert: true, returnDocument: "after" });
  if (!schedule || schedule.through >= boundary) return;

  // Catch up after downtime without revisiting periods before feature launch.
  for (let due = nextReportBoundary(schedule.through); due <= boundary; due = nextReportBoundary(due)) {
    const periods = periodsClosingOn(due);
    const accounts = db.collection<{ userId: string }>("user_ai_configs")
      .find({ deletedAt: { $exists: false } }, { projection: { userId: 1 } });
    for await (const { userId } of accounts) {
      if (!await activeAccount(db, userId)) continue;
      const settings = await getUserSettings({ db, userId });
      for (const period of periods) {
        if (settings.reports[period.kind] && await hasReportExpenses(db, userId, period, settings)) {
          await queueReport(db, userId, period, now);
        }
      }
    }
    await scheduler.updateOne({ _id: "calendar" }, { $max: { through: due } });
  }
}

export async function runNextReport(db: Db, now = new Date()) {
  const collection = reportDocuments(db);
  await collection.updateMany({ status: "running", deletedAt: { $exists: false }, leaseUntil: { $lte: now }, attempts: { $gte: maxAttempts } }, {
    $set: { status: "failed" }, $unset: { token: "", leaseUntil: "", nextAttemptAt: "" }
  });
  const token = randomUUID();
  const job = await collection.findOneAndUpdate({
    deletedAt: { $exists: false },
    attempts: { $lt: maxAttempts },
    $or: [{ status: "queued", nextAttemptAt: { $lte: now } }, { status: "running", leaseUntil: { $lte: now } }]
  }, {
    $set: { status: "running", token, leaseUntil: new Date(Date.now() + leaseMs) },
    $inc: { attempts: 1 }
  }, { sort: { queuedAt: 1 }, returnDocument: "after" });
  if (!job) return false;

  const claim = { _id: job._id, token, status: "running" as const, deletedAt: { $exists: false } };
  const { userId, period } = job;
  const context = { db, userId };
  async function readPermittedSettings() {
    const [active, settings, config] = await Promise.all([
      activeAccount(db, userId),
      getUserSettings(context),
      ownedCollection(db, userId, "user_ai_configs").findOne()
    ]);
    if (!active || !settings.reports[period.kind] || !config) throw new ReportSkipped();
    const version = config.updatedAt ?? config.createdAt ?? config._id;
    return { settings, ownerReview: active.role === "owner" && period.kind === "month", configVersion: version instanceof Date ? version.toISOString() : String(version) };
  }

  try {
    const { settings, ownerReview, configVersion } = await readPermittedSettings();
    const credentials = await getUserAi(context);
    const keepClaim = async () => {
      const current = await readPermittedSettings();
      if (current.settings.reports.includeOriginalText !== settings.reports.includeOriginalText || current.ownerReview !== ownerReview || current.configVersion !== configVersion) {
        throw new ReportSkipped();
      }
      const kept = await collection.updateOne(claim, { $set: { leaseUntil: new Date(Date.now() + leaseMs) } });
      if (!kept.matchedCount) throw new ReportSkipped();
    };
    const generated = await writeLifeReport(db, userId, period, settings, credentials, keepClaim, { review: ownerReview });
    await keepClaim();
    await collection.updateOne(claim, {
      $set: generated ? { status: "ready", ...generated, publishedAt: new Date() } : { status: "sparse" },
      $unset: { token: "", leaseUntil: "", nextAttemptAt: "" }
    });
  } catch (error) {
    const retry = job.attempts < maxAttempts && canRetryAi(error);
    await collection.updateOne(claim, {
      $set: retry ? { status: "queued", nextAttemptAt: new Date(Date.now() + 10 * 60_000) } : {
        status: error instanceof ReportSkipped ? "skipped" : "failed"
      },
      $unset: { token: "", leaseUntil: "", ...(retry ? {} : { nextAttemptAt: "" }) }
    });
  }
  return true;
}
