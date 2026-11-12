import { NextResponse } from "next/server";
import { privateRoute, rateLimit } from "@/lib/privateApi";
import { ownedCollection } from "@/lib/ownership";
import { getUserSettings, serializeDoc } from "@/lib/userData";
export const GET = privateRoute(async (_request, ctx) => {
  await rateLimit(ctx.db, ctx.userId, "export", 5);
  const [transactions, presets, pendingInputs, settings] = await Promise.all([
    ownedCollection(ctx.db, ctx.userId, "transactions").find().sort({ date: -1 }).toArray(),
    ownedCollection(ctx.db, ctx.userId, "transaction_presets").find().toArray(),
    ownedCollection(ctx.db, ctx.userId, "pending_inputs").find({ status: { $ne: "completed" } }).toArray(),
    getUserSettings(ctx)
  ]);
  return NextResponse.json({ exportedAt: new Date().toISOString(), transactions: transactions.map(serializeDoc), presets: presets.map(serializeDoc), pendingInputs: pendingInputs.map(serializeDoc), settings }, { headers: { "Content-Disposition": 'attachment; filename="tcca-my-ledger.json"' } });
});
