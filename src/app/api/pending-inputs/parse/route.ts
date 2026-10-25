import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { parseDrafts } from "@/lib/parseDrafts";
import { serializePending } from "@/lib/pendingInputStore";
import type { PendingDoc } from "@/lib/pendingInputStore";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !ObjectId.isValid(id)) return NextResponse.json({ error: "无效的暂存编号。" }, { status: 400 });
  const options = z.object({ categories: z.array(z.string()).optional(), paymentMethods: z.array(z.string()).optional() }).safeParse(await request.json());
  if (!options.success) return NextResponse.json({ error: "识别参数无效。" }, { status: 400 });
  const db = await getDb();
  const collection = db.collection<PendingDoc>("pending_inputs");
  const _id = new ObjectId(id);
  const attemptId = randomUUID();
  const claimed = await collection.findOneAndUpdate({ _id, $or: [{ status: "pending" }, { status: "processing", leaseUntil: { $lt: new Date() } }] }, { $set: { status: "processing", attemptId, leaseUntil: new Date(Date.now() + 180000), updatedAt: new Date() } }, { returnDocument: "after" });
  if (!claimed) {
    const existing = await collection.findOne({ _id });
    if (existing?.status === "ready") return NextResponse.json(serializePending(existing));
    return NextResponse.json({ error: "该文字正在识别或已处理，请刷新列表。" }, { status: 409 });
  }
  try {
    const parsed = await parseDrafts(claimed.text, { ...options.data, referenceDate: claimed.referenceDate });
    const drafts = parsed.map((draft) => ({ ...draft, pendingInputId: id, pendingDraftId: randomUUID() }));
    const doc = await collection.findOneAndUpdate({ _id, attemptId, status: "processing" }, { $set: { status: "ready", drafts, lastError: null, updatedAt: new Date() }, $unset: { leaseUntil: "", attemptId: "" } }, { returnDocument: "after" });
    if (!doc) return NextResponse.json({ error: "识别状态已变更，请刷新列表。" }, { status: 409 });
    return NextResponse.json(serializePending(doc));
  } catch (error) {
    const message = error instanceof Error ? error.message : "识别失败，请稍后重试。";
    await collection.updateOne({ _id, attemptId, status: "processing" }, { $set: { status: "pending", lastError: message, updatedAt: new Date() }, $unset: { leaseUntil: "", attemptId: "" } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
