import { NextResponse } from "next/server";
import { privateRoute, rateLimit } from "@/lib/privateApi";
import { ownedCollection } from "@/lib/ownership";
import { getUserSettings, serializeDoc } from "@/lib/userData";
import { reportDocuments } from "@/lib/reportStore";
export const GET = privateRoute(async (_request, ctx) => {
  await rateLimit(ctx.db, ctx.userId, "export", 5);
  const [transactions, presets, pendingInputs, settings, reports] = await Promise.all([
    ownedCollection(ctx.db, ctx.userId, "transactions").find().sort({ date: -1 }).toArray(),
    ownedCollection(ctx.db, ctx.userId, "transaction_presets").find().toArray(),
    ownedCollection(ctx.db, ctx.userId, "pending_inputs").find({ status: { $ne: "completed" } }).toArray(),
    getUserSettings(ctx),
    reportDocuments(ctx.db).find({ userId: ctx.userId, status: "ready", deletedAt: { $exists: false } }).sort({ "period.start": -1 }).toArray()
  ]);
  return NextResponse.json({ exportedAt: new Date().toISOString(), transactions: transactions.map(serializeDoc), presets: presets.map(serializeDoc), pendingInputs: pendingInputs.map(serializeDoc), settings, reports: reports.map(({ period, story, publishedAt }) => ({ period, story, publishedAt })) }, { headers: { "Content-Disposition": 'attachment; filename="tcca-my-ledger.json"' } });
});
