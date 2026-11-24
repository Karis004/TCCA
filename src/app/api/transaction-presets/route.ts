import { NextResponse } from "next/server";
import { privateRoute, readJson, objectId, HttpError, rateLimit } from "@/lib/privateApi";
import { ownedCollection } from "@/lib/ownership";
import { transactionPresetSchema } from "@/lib/transactionPresetSchema";
import { getUserSettings, serializeDoc, validateLedgerChoices } from "@/lib/userData";

export const dynamic = "force-dynamic";
export const GET = privateRoute(async (_request, ctx) => NextResponse.json((await ownedCollection(ctx.db, ctx.userId, "transaction_presets").find().sort({ createdAt: -1, _id: -1 }).toArray()).map(serializeDoc)));

export const POST = privateRoute(async (request, ctx) => {
  const [, settings] = await Promise.all([rateLimit(ctx.db, ctx.userId, "presets", 60), getUserSettings(ctx)]);
  const payload = await readJson(request, transactionPresetSchema);
  validateLedgerChoices(settings, payload);
  const collection = ownedCollection(ctx.db, ctx.userId, "transaction_presets");
  if (await collection.countDocuments() >= 200) throw new HttpError(413, "预设最多200项。");
  const doc = { ...payload, createdAt: new Date(), updatedAt: new Date() };
  const result = await collection.insertOne(doc);
  return NextResponse.json(serializeDoc({ ...doc, _id: result.insertedId }), { status: 201 });
});

export const PUT = privateRoute(async (request, ctx) => {
  const _id = objectId(request);
  const collection = ownedCollection(ctx.db, ctx.userId, "transaction_presets");
  const [, settings, existing] = await Promise.all([rateLimit(ctx.db, ctx.userId, "presets", 60), getUserSettings(ctx), collection.findOne({ _id })]);
  if (!existing) throw new HttpError(404, "找不到这条预设。");
  const payload = await readJson(request, transactionPresetSchema);
  validateLedgerChoices(settings, payload, { category: existing.category, paymentMethod: existing.paymentMethod });
  const doc = await collection.findOneAndUpdate({ _id }, { $set: { ...payload, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "找不到这条预设。");
  return NextResponse.json(serializeDoc(doc));
});

export const DELETE = privateRoute(async (request, ctx) => {
  const result = await ownedCollection(ctx.db, ctx.userId, "transaction_presets").deleteOne({ _id: objectId(request) });
  if (!result.deletedCount) throw new HttpError(404, "找不到这条预设。");
  return NextResponse.json({ ok: true });
});
