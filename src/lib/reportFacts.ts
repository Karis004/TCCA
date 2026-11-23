import type { ReportPeriod } from "./reportPeriods";

export const subcategories = [
  "早餐", "午餐", "晚餐", "咖啡", "茶饮", "零食甜点", "酒饮", "外卖", "聚餐",
  "食材", "清洁耗材", "洗护用品", "家居", "衣物", "数码", "通勤", "运动", "旅行",
  "兴趣娱乐", "礼物", "订阅", "医疗护理", "未细分"
] as const;

export type ReportClue = { group: typeof subcategories[number]; item?: string; scene?: string };
export type ReportRecord = {
  id: string;
  date: string;
  category: string;
  merchant?: string;
  tags: string[];
  note?: string;
  originalText?: string;
  clue?: ReportClue;
  amountInReportCurrency?: number;
};

type Observation = { period: string; records: number; activeDays: number; described: number; interpreted: number };
type FactGroup = { label: string; kind: "商户" | "细分" | "买的东西" | "记录中的情境" | "常见搭配"; rows: ReportRecord[] };
type FactPeriod = { period: string; count: number; activeDays: number; weekdayCount: number; weekendCount: number; months: [string, number][]; spend?: number; examples: { id: string; date: string; merchant?: string; item?: string; scene?: string }[] };

function groupKey(kind: FactGroup["kind"], label: string) {
  return kind + ":" + label.toLowerCase();
}

function contains(period: ReportPeriod, date: string) {
  return date >= period.start && date < period.end;
}

export function hasReportDescription(row: ReportRecord) {
  return Boolean(row.merchant || row.note || row.tags.length || row.originalText);
}

export function observationFor(period: ReportPeriod, rows: ReportRecord[]): Observation {
  return {
    period: period.label,
    records: rows.length,
    activeDays: new Set(rows.map(row => row.date)).size,
    described: rows.filter(hasReportDescription).length,
    interpreted: rows.filter(row => row.clue && row.clue.group !== "未细分").length
  };
}

function collectGroups(rows: ReportRecord[]) {
  const groups = new Map<string, FactGroup>();
  function add(kind: FactGroup["kind"], label: string | undefined, row: ReportRecord) {
    if (!label) return;
    const key = groupKey(kind, label);
    const group = groups.get(key) ?? { kind, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  for (const row of rows) {
    add("商户", row.merchant, row);
    const group = row.clue?.group === "未细分" ? undefined : row.clue?.group;
    add("细分", group, row);
    add("买的东西", row.clue?.item, row);
    add("记录中的情境", row.clue?.scene, row);
    if (row.merchant && (row.clue?.item || group)) {
      add("常见搭配", row.merchant + " · " + (row.clue?.item || group), row);
    }
    if (row.clue?.scene && row.merchant) add("常见搭配", row.clue.scene + " · " + row.merchant, row);
  }
  return [...groups.values()];
}

function examples(rows: ReportRecord[]) {
  const indices = new Set([0, Math.floor(rows.length / 2), rows.length - 1]);
  return [...indices].flatMap(index => {
    const row = rows[index];
    return row ? [{ id: row.id, date: row.date, merchant: row.merchant, item: row.clue?.item, scene: row.clue?.scene }] : [];
  });
}

function groupPeriod(group: FactGroup, period: ReportPeriod): FactPeriod {
  const rows = group.rows.filter(row => contains(period, row.date));
  const months = new Map<string, number>();
  let weekendCount = 0;
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
    const weekday = new Date(row.date + "T00:00:00Z").getUTCDay();
    if (weekday === 0 || weekday === 6) weekendCount++;
  }
  return {
    period: period.label,
    count: rows.length,
    activeDays: new Set(rows.map(row => row.date)).size,
    weekdayCount: rows.length - weekendCount,
    weekendCount,
    months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)),
    spend: rows.length && rows.every(row => row.amountInReportCurrency !== undefined)
      ? rows.reduce((total, row) => total + Math.round(row.amountInReportCurrency! * 100), 0) / 100
      : undefined,
    examples: examples(rows)
  };
}

function monthNumber(date: string) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function continuousMonths(rows: ReportRecord[], end: string) {
  const lastDay = new Date(Date.parse(end + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  const months = new Set(rows.filter(row => row.date < end).map(row => monthNumber(row.date)));
  let count = 0;
  for (let month = monthNumber(lastDay); months.has(month); month--) count++;
  return count >= 6 ? count : undefined;
}

export function reportFacts(period: ReportPeriod, comparisons: ReportPeriod[], rows: ReportRecord[], history: ReportRecord[] = rows) {
  const windows = [period, ...comparisons];
  const coverage = windows.map(window => observationFor(window, rows.filter(row => contains(window, row.date))));
  const habits = new Map(collectGroups(history).map(group => [
    groupKey(group.kind, group.label), continuousMonths(group.rows, period.end)
  ]));
  const ranked = collectGroups(rows).flatMap(group => {
    const values = windows.map(window => groupPeriod(group, window));
    const current = values[0];
    if (!current.count) return [];
    const hasComparison = values.slice(1).some((value, index) => coverage[index + 1].records >= 5 && value.count > 0);
    const detailed = ["买的东西", "记录中的情境", "常见搭配"].includes(group.kind);
    const consecutiveMonths = habits.get(groupKey(group.kind, group.label));
    if (current.count < 2 && (!hasComparison || !detailed) && !consecutiveMonths) return [];
    const score = Math.min(current.count, 8) + current.months.length * 2 + (detailed ? 4 : 0) + (hasComparison ? 3 : 0) + (consecutiveMonths ? 5 : 0);
    return [{ kind: group.kind, label: group.label, values, consecutiveMonths, score }];
  }).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "zh"));

  const perKind = new Map<string, number>();
  const facts = ranked.filter(group => {
    const seen = perKind.get(group.kind) ?? 0;
    perKind.set(group.kind, seen + 1);
    return seen < 7;
  }).slice(0, 26).map(({ score: _score, ...group }, index) => ({ id: index + 1, ...group }));

  return { target: period.label, coverage, facts };
}

export function selectUnclassified(rows: ReportRecord[], limit: number): ReportRecord[] {
  const months = new Map<string, ReportRecord[]>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const group = months.get(month) ?? [];
    group.push(row);
    months.set(month, group);
  }
  const selected: ReportRecord[] = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let added = false;
    for (const group of months.values()) {
      if (!group[round]) continue;
      selected.push(group[round]);
      added = true;
      if (selected.length === limit) return selected;
    }
    if (!added) break;
  }
  return selected;
}
