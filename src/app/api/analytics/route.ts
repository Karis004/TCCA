import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

type TransactionDoc = {
  type: string;
  amount: number;
  amountCny: number;
  currency: string;
  category: string;
  paymentMethod: string;
  date: string;
};

type DailyRow = {
  name: string;
  expense: number;
  income: number;
};

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, Number(((map.get(key) || 0) + value).toFixed(2)));
}

function mapToRows(map: Map<string, number>) {
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

function daysInMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex, 0).getDate();
}

function makeDailyRows(month: string, transactions: TransactionDoc[]) {
  const rows = new Map<string, DailyRow>();
  const totalDays = daysInMonth(month);

  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    rows.set(date, { name: String(day), expense: 0, income: 0 });
  }

  for (const item of transactions) {
    if (!item.date.startsWith(month)) continue;
    const row = rows.get(item.date);
    if (!row) continue;

    if (item.type === "expense") {
      row.expense = Number((row.expense + item.amountCny).toFixed(2));
    }

    if (item.type === "income" || item.type === "refund") {
      row.income = Number((row.income + item.amountCny).toFixed(2));
    }
  }

  return Array.from(rows.values());
}

export async function GET(request: Request) {
  const db = await getDb();
  const transactions = await db
    .collection<TransactionDoc>("transactions")
    .find()
    .sort({ date: 1 })
    .limit(1000)
    .toArray();

  const byCategory = new Map<string, number>();
  const byPayment = new Map<string, number>();
  const byCurrency = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const monthSet = new Set<string>();
  let income = 0;
  let expense = 0;

  for (const item of transactions) {
    monthSet.add(item.date.slice(0, 7));
    const signed = item.type === "income" || item.type === "refund" ? item.amountCny : -item.amountCny;
    add(byCurrency, item.currency, item.amount);
    add(byMonth, item.date.slice(0, 7), signed);

    if (item.type === "expense") {
      expense += item.amountCny;
      add(byCategory, item.category, item.amountCny);
      add(byPayment, item.paymentMethod, item.amountCny);
    }

    if (item.type === "income" || item.type === "refund") {
      income += item.amountCny;
    }
  }

  const months = Array.from(monthSet).sort().reverse();
  const requestedMonth = new URL(request.url).searchParams.get("month");
  const selectedMonth = requestedMonth && monthSet.has(requestedMonth) ? requestedMonth : months[0] || new Date().toISOString().slice(0, 7);
  const byDay = makeDailyRows(selectedMonth, transactions);

  return NextResponse.json({
    totalIncomeCny: Number(income.toFixed(2)),
    totalExpenseCny: Number(expense.toFixed(2)),
    balanceCny: Number((income - expense).toFixed(2)),
    byCategory: mapToRows(byCategory).sort((a, b) => b.value - a.value),
    byPayment: mapToRows(byPayment).sort((a, b) => b.value - a.value),
    byCurrency: mapToRows(byCurrency).sort((a, b) => b.value - a.value),
    byMonth: mapToRows(byMonth),
    months,
    selectedMonth,
    byDay,
    hasDailyIncome: byDay.some((item) => item.income > 0)
  });
}
