import { ObjectId } from "mongodb";
import type { WithId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { transactionPresetSchema } from "@/lib/transactionPresetSchema";
import type { TransactionPresetInput } from "@/models/ledger";

export const dynamic = "force-dynamic";
type PresetDoc = TransactionPresetInput & { createdAt: Date; updatedAt: Date };

function serialize(doc: WithId<PresetDoc>) {
  return { ...doc, _id: doc._id.toString(), createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() };
}

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof z.ZodError ? error.issues[0].message : "操作账单预设失败，请稍后重试。" },
    { status: error instanceof z.ZodError ? 400 : 500 }
  );
}

function getId(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export async function GET() {
  try {
    const db = await getDb();
    const docs = await db.collection<PresetDoc>("transaction_presets").find().sort({ createdAt: -1, _id: -1 }).toArray();
    return NextResponse.json(docs.map(serialize));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const payload = transactionPresetSchema.parse(await request.json());
    const now = new Date();
    const doc = { ...payload, createdAt: now, updatedAt: now };
    const db = await getDb();
    const result = await db.collection<PresetDoc>("transaction_presets").insertOne(doc);
    return NextResponse.json(serialize({ ...doc, _id: result.insertedId }), { status: 201 });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  const _id = getId(request);
  if (!_id) return NextResponse.json({ error: "无效的预设编号。" }, { status: 400 });
  try {
    const payload = transactionPresetSchema.parse(await request.json());
    const db = await getDb();
    const collection = db.collection<PresetDoc>("transaction_presets");
    const result = await collection.updateOne({ _id }, { $set: { ...payload, updatedAt: new Date() } });
    if (!result.matchedCount) return NextResponse.json({ error: "找不到这条预设。" }, { status: 404 });
    const doc = await collection.findOne({ _id });
    if (!doc) return NextResponse.json({ error: "找不到这条预设。" }, { status: 404 });
    return NextResponse.json(serialize(doc));
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  const _id = getId(request);
  if (!_id) return NextResponse.json({ error: "无效的预设编号。" }, { status: 400 });
  try {
    const db = await getDb();
    const result = await db.collection<PresetDoc>("transaction_presets").deleteOne({ _id });
    if (!result.deletedCount) return NextResponse.json({ error: "找不到这条预设。" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
