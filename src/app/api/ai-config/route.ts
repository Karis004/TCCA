import { NextResponse } from "next/server";
import { z } from "zod";
import { privateRoute, rateLimit, readJson, HttpError, requireOwner } from "@/lib/privateApi";
import { ownedCollection } from "@/lib/ownership";
import { normalizeAiUrl, encryptAiKey, decryptAiKey, resolveAiTarget } from "@/lib/aiSecurity";
import { getUserAi, ownerLegacyOrigin } from "@/lib/userData";
import { parseLedgerText } from "@/lib/aiClient";

const schema = z.object({ baseUrl: z.string().trim().url().max(1000), model: z.string().trim().min(1).max(160), apiKey: z.string().trim().min(1).max(8192).optional() });
function summary(doc: any) { return doc ? { configured: true, baseUrl: doc.baseUrl, model: doc.model, maskedKey: "••••••••", updatedAt: doc.updatedAt?.toISOString() } : { configured: false, baseUrl: "", model: "", maskedKey: "" }; }
export const GET = privateRoute(async (_request, ctx) => NextResponse.json(summary(await ownedCollection(ctx.db, ctx.userId, "user_ai_configs").findOne())));
export const PUT = privateRoute(async (request, ctx) => {
  await rateLimit(ctx.db, ctx.userId, "ai-config", 10);
  const body = await readJson(request, schema); const baseUrl = normalizeAiUrl(body.baseUrl);
  try { await resolveAiTarget(baseUrl, ownerLegacyOrigin(ctx.user.role)); } catch { throw new HttpError(400, "API 地址必须可解析到公开 HTTPS 服务；不支持本机、内网或保留地址。"); }
  const collection = ownedCollection(ctx.db, ctx.userId, "user_ai_configs"); const current = await collection.findOne();
  if (!body.apiKey && !current) throw new HttpError(400, "请填写 API Key。");
  // A blank replacement key is valid only when the destination is unchanged.
  if (!body.apiKey && current?.baseUrl !== baseUrl) throw new HttpError(400, "更换 API 地址时请重新填写 API Key。");
  const doc = { baseUrl, model: body.model, encryptedKey: body.apiKey ? encryptAiKey(body.apiKey, ctx.userId) : current!.encryptedKey, updatedAt: new Date() };
  if (current) await collection.updateOne({ _id: current._id }, { $set: doc });
  else await collection.insertOne({ ...doc, createdAt: new Date() });
  return NextResponse.json(summary(await collection.findOne()));
});
export const DELETE = privateRoute(async (_request, ctx) => { await ownedCollection(ctx.db, ctx.userId, "user_ai_configs").deleteOne({}); return NextResponse.json({ ok: true }); });
export const POST = privateRoute(async (request, ctx) => {
  const { action } = await readJson(request, z.object({ action: z.enum(["reveal", "test", "import-legacy"]) }));
  await rateLimit(ctx.db, ctx.userId, "ai-config-action", 10);
  if (action === "reveal") {
    const doc = await ownedCollection(ctx.db, ctx.userId, "user_ai_configs").findOne();
    if (!doc) throw new HttpError(404, "尚未配置 AI。");
    return NextResponse.json({ apiKey: decryptAiKey(doc.encryptedKey, ctx.userId) });
  }
  if (action === "import-legacy") {
    requireOwner(ctx.user);
    const collection = ownedCollection(ctx.db, ctx.userId, "user_ai_configs");
    if (await collection.findOne()) throw new HttpError(409, "已有个人 AI 配置，不会覆盖。");
    const baseUrl = process.env.AI_API_BASE_URL, apiKey = process.env.AI_API_KEY, model = process.env.AI_MODEL;
    if (!baseUrl || !apiKey || !model) throw new HttpError(404, "服务器没有旧 AI 配置。");
    await collection.insertOne({ baseUrl: normalizeAiUrl(baseUrl), model, encryptedKey: encryptAiKey(apiKey, ctx.userId), createdAt: new Date(), updatedAt: new Date() });
    return NextResponse.json({ ok: true });
  }
  try { await parseLedgerText("测试：今天喝水花了1港币", { credentials: await getUserAi(ctx) }); }
  catch (error) { throw new HttpError(502, error instanceof Error ? error.message : "连接测试失败。"); }
  return NextResponse.json({ ok: true });
});
