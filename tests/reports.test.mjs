import test from "node:test";
import assert from "node:assert/strict";
import { closedYear, periodsClosingOn, previousPeriods, reportCalendarDay, reportPeriod } from "../src/lib/reportPeriods.ts";
import { reportFacts, selectUnclassified } from "../src/lib/reportFacts.ts";
import { isBriefReportInsight } from "../src/lib/reportCopy.ts";
import { selectReportInsights } from "../src/lib/reportReview.ts";

test("the Hong Kong new-year boundary closes exactly the previous month and quarter", () => {
  const before = new Date("2026-12-31T15:59:59Z");
  const after = new Date("2026-12-31T16:00:00Z");
  assert.equal(reportCalendarDay(before), "2026-12-31");
  assert.equal(reportCalendarDay(after), "2027-01-01");
  assert.deepEqual(periodsClosingOn(reportCalendarDay(after)).map(row => row.key), ["month:2026-12", "quarter:2026-Q4"]);
  assert.equal(closedYear(before).key, "year:2025");
  assert.equal(closedYear(after).key, "year:2026");
  assert.deepEqual(periodsClosingOn("2026-12-01").map(row => row.key), ["month:2026-11"]);
});

test("each comparison has the same calendar grain as its report", () => {
  assert.deepEqual(previousPeriods(reportPeriod("month", 2026, 1)).map(row => row.key), ["month:2025-12", "month:2025-01"]);
  assert.deepEqual(previousPeriods(reportPeriod("quarter", 2026, 4)).map(row => row.key), ["quarter:2026-Q1", "quarter:2025-Q2"]);
  assert.deepEqual(previousPeriods(reportPeriod("year", 2026)).map(row => [row.key, row.start, row.end]), [["year:2025", "2025-01-01", "2026-01-01"]]);
});

function row(id, date, merchant, amountInReportCurrency = 12.25) {
  return { id, date, category: "餐饮", merchant, tags: [], amountInReportCurrency, ...(merchant ? { clue: { group: "咖啡", scene: "下班后" } } : {}) };
}

test("merchant facts retain prior-period counts, days, and coverage gaps", () => {
  const period = reportPeriod("month", 2026, 11);
  const data = reportFacts(period, previousPeriods(period), [
    row("1", "2026-11-01", "小店"), row("2", "2026-11-26", "小店"), row("3", "2026-11-26", "小店"),
    row("4", "2026-10-24", "小店"), row("5", "2026-10-31"),
    row("6", "2025-11-04", "小店"), row("7", "2025-11-21", "小店"),
    row("outside", "2026-12-01", "小店")
  ]);
  assert.deepEqual(data.coverage.map(item => [item.records, item.activeDays, item.described]), [[3, 2, 3], [2, 2, 1], [2, 2, 2]]);
  const merchant = data.facts.find(fact => fact.kind === "商户");
  assert.deepEqual(merchant.values.map(value => [value.count, value.spend]), [[3, 36.75], [1, 12.25], [2, 24.5]]);
  assert.deepEqual(merchant.values[2].months, [["2025-11", 2]]);
  assert.ok(!merchant.values.flatMap(value => value.examples).some(example => example.id === "outside"));
  assert.ok(data.facts.some(fact => fact.kind === "常见搭配" && fact.label.includes("下班后")));
});

test("the classification budget keeps examples from multiple calendar months", () => {
  const input = [
    row("recent-1", "2026-11-24", "小店"), row("recent-2", "2026-11-23", "小店"),
    row("previous", "2026-10-01", "小店"), row("year-ago", "2025-11-01", "小店")
  ];
  assert.deepEqual(selectUnclassified(input, 3).map(item => item.id), ["recent-1", "previous", "year-ago"]);
});

test("long habits require six recorded calendar months in a row", () => {
  const period = reportPeriod("month", 2026, 11);
  const current = [row("current", "2026-11-07", "小店")];
  const older = [6, 7, 8, 9, 10].map(month => row(String(month), "2026-" + String(month).padStart(2, "0") + "-21", "小店"));
  const merchant = reportFacts(period, [], current, [...older, ...current]).facts.find(item => item.kind === "商户");
  assert.equal(merchant.consecutiveMonths, 6);
  const withGap = reportFacts(period, [], [...current, row("second", "2026-11-21", "小店")], [
    ...older.filter(item => item.id !== "8"), ...current
  ]).facts.find(item => item.kind === "商户");
  assert.equal(withGap.consecutiveMonths, undefined);
});

test("the reading copy keeps conclusions while removing number lists and stock phrasing", () => {
  assert.equal(isBriefReportInsight("这个月像在慢慢把厨房配齐，连菜刀也添了一把。"), true);
  assert.equal(isBriefReportInsight("这个月买了筷子、菜刀和盘子。"), false);
  assert.equal(isBriefReportInsight("这家店已经连续 6 个月出现在账本里。", { establishedHabit: true }), true);
  assert.equal(isBriefReportInsight("这家店已经连续 6 个月出现在账本里。"), false);
  assert.equal(isBriefReportInsight("月底又添了些餐具，家里开始有了像样的厨房。", { partialPeriod: true }), false);
  assert.equal(isBriefReportInsight("咖啡共 11 笔，分布在 10 天，其中 9 笔是工作日。"), false);
  assert.equal(isBriefReportInsight("不是多买了咖啡，而是更常记下这笔钱。"), false);
  assert.equal(isBriefReportInsight("这说明这家店成了常去的地方，不代表你更喜欢它。"), false);
});

test("monthly paragraphs and private alternatives can keep more detail", () => {
  const comparison = "去年常去的那家小店只记了 2 笔，这个月已经记了 5 笔。";
  assert.equal(isBriefReportInsight(comparison, { depth: "brief" }), false);
  assert.equal(isBriefReportInsight(comparison), true);
  const cooking = "这个月的厨房先从买菜开始用起来。后来添了筷子、菜刀和盘子。";
  assert.equal(isBriefReportInsight(cooking, { depth: "brief" }), false);
  assert.equal(isBriefReportInsight(cooking), true);
  assert.equal(isBriefReportInsight("买过筷子、菜刀和盘子，厨房在一点点用起来。", { depth: "alternative" }), true);
  assert.equal(isBriefReportInsight("这说明厨房在一点点用起来。", { depth: "alternative" }), false);
});

test("report review keeps selection order and rejects IDs outside the current issue", () => {
  const main = { id: "a", title: "原标题候选", body: "原段落", evidenceIds: ["1"] };
  const backup = { id: "b", title: "备选标题", body: "备选段落", evidenceIds: ["2"] };
  const review = { candidates: [main, backup], selectedIds: [main.id], defaultIds: [main.id], revision: 0 };
  const story = { title: "原标题", insights: [{ body: main.body, evidenceIds: main.evidenceIds }] };
  assert.equal(selectReportInsights(review, [main.id, backup.id], story).title, story.title);
  assert.deepEqual(selectReportInsights(review, [backup.id, main.id], story), {
    title: backup.title,
    insights: [{ body: backup.body, evidenceIds: backup.evidenceIds }, story.insights[0]]
  });
  assert.equal(selectReportInsights(review, [main.id, main.id], story), null);
  assert.equal(selectReportInsights(review, ["another-issue"], story), null);
  assert.equal(selectReportInsights(review, [], story), null);
});
