import { privateRoute, readJson, rateLimit, HttpError } from "@/lib/privateApi";
import type { ApiContext } from "@/lib/privateApi";
import { ownedCollection } from "@/lib/ownership";
import { getUserAi, getUserSettings } from "@/lib/userData";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { pendingInputSchema } from "@/lib/pendingInputs";
import { finishPendingDraft, serializePending } from "@/lib/pendingInputStore";
import type { PendingDoc } from "@/lib/pendingInputStore";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof HttpError) throw error;
  return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0].message : "操作暂存文字失败，请稍后重试。" }, { status: error instanceof z.ZodError ? 400 : 500 });
}
function idFrom(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}
async function handleGET(request: Request, ctx: ApiContext) {
  try {
    const db = await getDb();
    const collection = ownedCollection<PendingDoc>(db, ctx.userId, "pending_inputs");
    await collection.updateMany({ status: "processing", leaseUntil: { $lt: new Date() } }, { $set: { status: "pending", lastError: "上次识别中断，可重新识别。", updatedAt: new Date() } });
    const docs = await collection.find({ status: { $ne: "completed" } }).sort({ createdAt: 1, _id: 1 }).toArray();
    return NextResponse.json(docs.map(serializePending));
  } catch (error) { return failure(error); }
}
async function handlePOST(request: Request, ctx: ApiContext) {
  await rateLimit(ctx.db, ctx.userId, "pending-create", 60);
  if (await ownedCollection(ctx.db, ctx.userId, "pending_inputs").countDocuments({ status: { $ne: "completed" } }) >= 500) throw new HttpError(413, "暂存文字已达到500条，请先处理现有记录。");
  try {
    const payload = await readJson(request, pendingInputSchema);
    const now = new Date();
    const doc: PendingDoc = { userId: ctx.userId, ...payload, status: "pending", drafts: [], lastError: null, createdAt: now, updatedAt: now };
    const db = await getDb();
    const result = await ownedCollection<PendingDoc>(db, ctx.userId, "pending_inputs").insertOne(doc);
    return NextResponse.json(serializePending({ ...doc, _id: result.insertedId }), { status: 201 });
  } catch (error) { return failure(error); }
}
async function handlePUT(request: Request, ctx: ApiContext) {
  const _id = idFrom(request);
  if (!_id) return NextResponse.json({ error: "无效的暂存编号。" }, { status: 400 });
  try {
    const payload = pendingInputSchema.parse(await request.json());
    const db = await getDb();
    const doc = await ownedCollection<PendingDoc>(db, ctx.userId, "pending_inputs").findOneAndUpdate({ _id, status: "pending" }, { $set: { ...payload, lastError: null, updatedAt: new Date() } }, { returnDocument: "after" });
    if (!doc) return NextResponse.json({ error: "仅待识别的文字可以编辑，请刷新列表。" }, { status: 409 });
    return NextResponse.json(serializePending(doc));
  } catch (error) { return failure(error); }
}
async function handleDELETE(request: Request, ctx: ApiContext) {
  const _id = idFrom(request);
  if (!_id) return NextResponse.json({ error: "无效的暂存编号。" }, { status: 400 });
  try {
    const draftId = new URL(request.url).searchParams.get("draftId");
    if (draftId) await finishPendingDraft(_id.toHexString(), draftId, ctx.userId);
    else {
      const db = await getDb();
      const result = await ownedCollection<PendingDoc>(db, ctx.userId, "pending_inputs").deleteOne({ _id, status: { $ne: "processing" } });
      if (!result.deletedCount) return NextResponse.json({ error: "文字正在识别或已移除，请刷新列表。" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}

export const GET = privateRoute(handleGET);
export const POST = privateRoute(handlePOST);
export const PUT = privateRoute(handlePUT);
export const DELETE = privateRoute(handleDELETE);
