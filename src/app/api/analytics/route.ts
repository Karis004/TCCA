import { NextResponse } from "next/server";
import { buildAnalytics, isAnalyticsPeriod } from "@/lib/analytics";
import type { AnalyticsTransaction } from "@/lib/analytics";
import { getDb } from "@/lib/mongodb";
import { getRateToCny } from "@/lib/fx";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const month = params.get("month");
  const currency = params.get("currency") || "HKD";
  const excludedCategories = [...new Set(params.getAll("excludeCategory").map((name) => name.trim()).filter(Boolean))].sort();
  if (excludedCategories.length > 200 || excludedCategories.some((name) => name.length > 200)) {
    return NextResponse.json({ error: "排除分类过多或名称过长。" }, { status: 400 });
  }
  if (currency !== "HKD" && currency !== "CNY") {
    return NextResponse.json({ error: "查看币种仅支持 HKD 或 CNY。" }, { status: 400 });
  }
  if (month !== null && !isAnalyticsPeriod(month)) {
    return NextResponse.json({ error: "请选择有效月份或全部。" }, { status: 400 });
  }

  const db = await getDb();
  const transactions = await db.collection<AnalyticsTransaction>("transactions").find({}, {
    projection: { _id: 0, type: 1, amount: 1, amountCny: 1, currency: 1, category: 1, paymentMethod: 1, date: 1 }
  }).toArray();

  try {
    const rates: Record<string, number> = {};
    if (currency === "HKD") {
      const included = transactions.filter((item) => !excludedCategories.includes(item.category.trim()));
      const sources = [...new Set(included.map((item) => item.currency.toUpperCase() === "RMB" ? "CNY" : item.currency.toUpperCase()))].filter((code) => code !== "HKD");
      if (sources.length) {
        const hkdToCny = await getRateToCny("HKD");
        await Promise.all(sources.map(async (code) => { rates[code] = await getRateToCny(code) / hkdToCny; }));
      }
    }
    return NextResponse.json(buildAnalytics(transactions, month, new Date(), { currency, rates, excludedCategories }));
  } catch {
    return NextResponse.json({ error: "暂时无法换算港币，请稍后重试或切换人民币视图。" }, { status: 503 });
  }
}
