import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { pendingInputSchema } from "@/lib/pendingInputs";
import { finishPendingDraft, serializePending } from "@/lib/pendingInputStore";
import type { PendingDoc } from "@/lib/pendingInputStore";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0].message : "操作暂存文字失败，请稍后重试。" }, { status: error instanceof z.ZodError ? 400 : 500 });
}
function idFrom(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}
export async function GET() {
  try {
    const db = await getDb();
    const collection = db.collection<PendingDoc>("pending_inputs");
    await collection.updateMany({ status: "processing", leaseUntil: { $lt: new Date() } }, { $set: { status: "pending", lastError: "上次识别中断，可重新识别。", updatedAt: new Date() } });
    const docs = await collection.find({ status: { $ne: "completed" } }).sort({ createdAt: 1, _id: 1 }).toArray();
    return NextResponse.json(docs.map(serializePending));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const payload = pendingInputSchema.parse(await request.json());
    const now = new Date();
    const doc: PendingDoc = { ...payload, status: "pending", drafts: [], lastError: null, createdAt: now, updatedAt: now };
    const db = await getDb();
    const result = await db.collection<PendingDoc>("pending_inputs").insertOne(doc);
    return NextResponse.json(serializePending({ ...doc, _id: result.insertedId }), { status: 201 });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  const _id = idFrom(request);
  if (!_id) return NextResponse.json({ error: "无效的暂存编号。" }, { status: 400 });
  try {
    const payload = pendingInputSchema.parse(await request.json());
    const db = await getDb();
    const doc = await db.collection<PendingDoc>("pending_inputs").findOneAndUpdate({ _id, status: "pending" }, { $set: { ...payload, lastError: null, updatedAt: new Date() } }, { returnDocument: "after" });
    if (!doc) return NextResponse.json({ error: "仅待识别的文字可以编辑，请刷新列表。" }, { status: 409 });
    return NextResponse.json(serializePending(doc));
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  const _id = idFrom(request);
  if (!_id) return NextResponse.json({ error: "无效的暂存编号。" }, { status: 400 });
  try {
    const draftId = new URL(request.url).searchParams.get("draftId");
    if (draftId) await finishPendingDraft(_id.toHexString(), draftId);
    else {
      const db = await getDb();
      const result = await db.collection<PendingDoc>("pending_inputs").deleteOne({ _id, status: { $ne: "processing" } });
      if (!result.deletedCount) return NextResponse.json({ error: "文字正在识别或已移除，请刷新列表。" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
