import { NextResponse } from "next/server";
import { buildAnalytics, isAnalyticsPeriod } from "@/lib/analytics";
import type { AnalyticsTransaction } from "@/lib/analytics";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month");
  if (month !== null && !isAnalyticsPeriod(month)) {
    return NextResponse.json({ error: "请选择有效月份或全部。" }, { status: 400 });
  }

  const db = await getDb();
  const transactions = await db.collection<AnalyticsTransaction>("transactions").find({}, {
    projection: { _id: 0, type: 1, amount: 1, amountCny: 1, currency: 1, category: 1, paymentMethod: 1, date: 1 }
  }).toArray();

  return NextResponse.json(buildAnalytics(transactions, month));
}
