export const reportKinds = ["month", "quarter", "year"] as const;
export type ReportKind = typeof reportKinds[number];

export type ReportPeriod = {
  key: string;
  kind: ReportKind;
  label: string;
  start: string;
  end: string;
};

const lengths = { month: 1, quarter: 3, year: 12 };

function monthStart(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}

export function reportPeriod(kind: ReportKind, year: number, month = 1): ReportPeriod {
  const normalized = monthStart(year, month);
  const actualYear = Number(normalized.slice(0, 4));
  const calendarMonth = Number(normalized.slice(5, 7));
  const actualMonth = kind === "year" ? 1 : kind === "quarter" ? Math.floor((calendarMonth - 1) / 3) * 3 + 1 : calendarMonth;
  const start = monthStart(actualYear, actualMonth);
  const quarter = Math.ceil(actualMonth / 3);
  const mark = kind === "month" ? start.slice(0, 7) : kind === "quarter" ? `${actualYear}-Q${quarter}` : String(actualYear);
  const label = kind === "month" ? `${actualYear} 年 ${actualMonth} 月` : kind === "quarter" ? `${actualYear} 年第 ${quarter} 季度` : `${actualYear} 年`;
  return { key: `${kind}:${mark}`, kind, label, start, end: monthStart(actualYear, actualMonth + lengths[kind]) };
}

export function reportCalendarDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function closedYear(now = new Date()) {
  return reportPeriod("year", Number(reportCalendarDay(now).slice(0, 4)) - 1);
}

export function previousPeriods(period: ReportPeriod) {
  const year = Number(period.start.slice(0, 4));
  const month = Number(period.start.slice(5, 7));
  const previous = reportPeriod(period.kind, year, month - lengths[period.kind]);
  return period.kind === "year" ? [previous] : [previous, reportPeriod(period.kind, year - 1, month)];
}

export function periodsClosingOn(boundary: string) {
  const year = Number(boundary.slice(0, 4));
  const month = Number(boundary.slice(5, 7));
  const periods = [reportPeriod("month", year, month - 1)];
  if ((month - 1) % 3 === 0) periods.push(reportPeriod("quarter", year, month - 3));
  return periods;
}

export function nextReportBoundary(boundary: string) {
  return monthStart(Number(boundary.slice(0, 4)), Number(boundary.slice(5, 7)) + 1);
}

export const reportKindLabels: Record<ReportKind, string> = { month: "月报", quarter: "季报", year: "年报" };
