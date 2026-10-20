export type AnalyticsTransaction = {
  type: string;
  amount: number;
  amountCny: number;
  currency: string;
  category: string;
  paymentMethod: string;
  date: string;
};

type AmountRow = { name: string; value: number };
type DailyRow = { date: string; expense: number; income: number };
export type AnalyticsDisplayCurrency = "CNY" | "HKD";
type DisplayOptions = { currency: AnalyticsDisplayCurrency; rates: Record<string, number> };

export type Analytics = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  displayCurrency: AnalyticsDisplayCurrency;
  transactionCount: number;
  byCategory: AmountRow[];
  byPayment: AmountRow[];
  byCurrency: AmountRow[];
  byMonth: AmountRow[];
  selectedMonth: string;
  currentMonth: string;
  byDay: DailyRow[];
};

export function getCurrentMonth(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit"
  }).format(now);
}

export function isAnalyticsPeriod(value: string) {
  return value === "all" || /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) || 0) + Math.round(value * 100));
}

function rows(map: Map<string, number>): AmountRow[] {
  return Array.from(map, ([name, cents]) => ({ name, value: cents / 100 }));
}

function rankedRows(map: Map<string, number>) {
  return rows(map).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function makeDailyRows(start: string, end: string) {
  const result = new Map<string, DailyRow>();
  const cursor = new Date(`${start}T00:00:00Z`);
  const lastDay = new Date(`${end}T00:00:00Z`);
  while (cursor <= lastDay) {
    const date = cursor.toISOString().slice(0, 10);
    result.set(date, { date, expense: 0, income: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function buildAnalytics(
  transactions: AnalyticsTransaction[], requestedMonth?: string | null, now = new Date(),
  display: DisplayOptions = { currency: "CNY", rates: {} }
): Analytics {
  const currentMonth = getCurrentMonth(now);
  const selectedMonth = requestedMonth && isAnalyticsPeriod(requestedMonth) ? requestedMonth : currentMonth;
  const valid = transactions.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date)).map((item) => {
    const code = item.currency.toUpperCase() === "RMB" ? "CNY" : item.currency.toUpperCase();
    let displayAmount = item.amountCny;
    if (display.currency === "HKD") {
      const rate = code === "HKD" ? 1 : display.rates[code];
      if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Missing exchange rate for ${code} to HKD`);
      displayAmount = Number((item.amount * rate).toFixed(2));
    }
    return { ...item, displayAmount };
  });
  const filtered = selectedMonth === "all" ? valid : valid.filter((item) => item.date.startsWith(`${selectedMonth}-`));
  const byCategory = new Map<string, number>();
  const byPayment = new Map<string, number>();
  const byCurrency = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const dates = valid.map((item) => item.date).sort();

  // Fill gaps with zeroes, independently of the selected period.
  if (dates.length) {
    const firstMonth = dates[0].slice(0, 7);
    const lastMonth = [currentMonth, dates[dates.length - 1].slice(0, 7)].sort().pop()!;
    const cursor = new Date(`${firstMonth}-01T00:00:00Z`);
    while (cursor.toISOString().slice(0, 7) <= lastMonth) {
      byMonth.set(cursor.toISOString().slice(0, 7), 0);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  for (const item of valid) {
    if (item.type === "expense") add(byMonth, item.date.slice(0, 7), -item.displayAmount);
    if (item.type === "income" || item.type === "refund") add(byMonth, item.date.slice(0, 7), item.displayAmount);
  }

  let byDay = new Map<string, DailyRow>();
  if (selectedMonth !== "all") {
    const [year, month] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    byDay = makeDailyRows(`${selectedMonth}-01`, `${selectedMonth}-${lastDay}`);
  } else if (dates.length) {
    byDay = makeDailyRows(dates[0], dates[dates.length - 1]);
  }

  let incomeCents = 0;
  let expenseCents = 0;
  for (const item of filtered) {
    add(byCurrency, item.currency, item.amount);
    const day = byDay.get(item.date);
    const cents = Math.round(item.displayAmount * 100);
    if (item.type === "expense") {
      expenseCents += cents;
      add(byCategory, item.category, item.displayAmount);
      add(byPayment, item.paymentMethod, item.displayAmount);
      if (day) day.expense += cents;
    }
    if (item.type === "income" || item.type === "refund") {
      incomeCents += cents;
      if (day) day.income += cents;
    }
  }

  return {
    totalIncome: incomeCents / 100,
    totalExpense: expenseCents / 100,
    balance: (incomeCents - expenseCents) / 100,
    displayCurrency: display.currency,
    transactionCount: filtered.length,
    byCategory: rankedRows(byCategory), byPayment: rankedRows(byPayment), byCurrency: rankedRows(byCurrency),
    byMonth: rows(byMonth), selectedMonth, currentMonth,
    byDay: Array.from(byDay.values(), (day) => ({ ...day, expense: day.expense / 100, income: day.income / 100 }))
  };
}
