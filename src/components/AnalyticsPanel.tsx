"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getCurrentMonth } from "@/lib/analytics";
import type { Analytics, AnalyticsDisplayCurrency } from "@/lib/analytics";

type Props = { selectedMonth: string; onMonthChange: (month: string) => void; displayCurrency: AnalyticsDisplayCurrency; onCurrencyChange: (currency: AnalyticsDisplayCurrency) => void };
type FlowMode = "expense" | "income" | "all";
const colors = ["var(--chart-blue)", "var(--chart-red)", "var(--muted)", "var(--chart-blue-soft)", "var(--chart-red-soft)", "var(--faint)"];
const incomeColor = "var(--ink)";
const expenseColor = "var(--chart-red)";
const tooltipStyle = { border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 16px #1111110a" };
const axisStyle = { fontSize: 11, fill: "var(--muted)" };

function formatMoney(value: number, currency: AnalyticsDisplayCurrency) {
  return `${currency === "HKD" ? "HK$" : "¥"}${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function compactAmount(value: number) {
  const abs = Math.abs(value);
  if (abs >= 10000) return `${Number((value / 10000).toFixed(1))}万`;
  if (abs >= 1000) return `${Number((value / 1000).toFixed(1))}千`;
  return String(value);
}
function periodName(month: string) {
  if (month === "all") return "全部时间";
  const [year, number] = month.split("-");
  return `${year}年${Number(number)}月`;
}

export function AnalyticsPanel({ selectedMonth, onMonthChange, displayCurrency, onCurrencyChange }: Props) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [flowMode, setFlowMode] = useState<FlowMode>("expense");
  const currentMonth = getCurrentMonth();
  const money = (value: number) => formatMoney(value, displayCurrency);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/analytics?month=${encodeURIComponent(selectedMonth)}&currency=${displayCurrency}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "读取分析数据失败，请稍后重试。");
        }
        const data: Analytics = await response.json();
        if (!controller.signal.aborted) setAnalytics(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "读取分析数据失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedMonth, displayCurrency, retry]);

  const ready = analytics && analytics.selectedMonth === selectedMonth && analytics.displayCurrency === displayCurrency;

  return (
    <div className="analytics-page">
      <section className="panel analytics-filter" aria-label="分析时间范围">
        <div className="analytics-heading">
          <div>
            <p className="eyebrow">收支分析</p>
            <h1>{periodName(selectedMonth)}</h1>
          </div>
          <span className="period-count" role="status" aria-live="polite">
            {loading ? "正在更新…" : ready ? `${analytics.transactionCount} 笔记录` : ""}
          </span>
        </div>
        <div className="analytics-filters-row">
        <div className="period-controls">
          <button type="button" aria-pressed={selectedMonth === currentMonth} className={selectedMonth === currentMonth ? "active" : ""} onClick={() => onMonthChange(currentMonth)}>本月</button>
          <label className="month-picker">
            <span className="sr-only">选择月份</span>
            <input type="month" aria-label="选择月份" min="1000-01" max="9999-12" value={selectedMonth === "all" ? "" : selectedMonth} onChange={(event) => { if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(event.target.value)) onMonthChange(event.target.value); }} />
          </label>
          <button type="button" aria-pressed={selectedMonth === "all"} className={selectedMonth === "all" ? "active" : ""} onClick={() => onMonthChange("all")}>全部</button>
        </div>
        <label className="currency-picker"><span>查看币种</span><select className="compact-select" aria-label="分析查看币种" value={displayCurrency} onChange={(event) => onCurrencyChange(event.target.value as AnalyticsDisplayCurrency)}><option value="HKD">港币 HKD</option><option value="CNY">人民币 CNY</option></select></label>
        </div>
        <p className="period-hint">收支、结余、每日流水与分类支出均按此时间统计。</p>
      </section>

      {error ? <div className="notice error" role="alert">{error} <button className="text-button" onClick={() => setRetry((value) => value + 1)}>重试</button></div> : null}
      {!ready && !error ? <div className="panel analytics-loading" role="status">正在整理这段时间的流水…</div> : null}

      {ready ? (
        <div className={`analytics-results${loading ? " is-loading" : ""}`} aria-busy={loading}>
          <section className="metric-board analytics-metrics" aria-label="所选期间收支">
            <div className="metric-card metric-income"><span>收入</span><strong>{money(analytics.totalIncome)}</strong></div>
            <div className="metric-card metric-expense"><span>支出</span><strong>{money(analytics.totalExpense)}</strong></div>
            <div className="metric-card metric-balance"><span>{selectedMonth === "all" ? "累计结余" : "本期结余"}</span><strong>{money(analytics.balance)}</strong></div>
          </section>
          <p className="accounting-note">结余为所选期间的收入减支出；收入含退款，转账不计入收支。{displayCurrency === "HKD" ? "港币账单保留原额，其他币种按当前汇率换算。" : "人民币金额沿用账单保存时的折算。"}</p>

          <section className="panel analytics-chart-panel" aria-label="每日流水">
            <div className="analytics-panel-head">
              <div><h2>每日流水</h2><span className="chart-subtitle">{selectedMonth === "all" ? "全部记录，按日汇总" : periodName(selectedMonth)} · {displayCurrency}</span></div>
              <div className="segmented-control" aria-label="每日流水显示范围">
                {([['expense', '支出'], ['income', '收入'], ['all', '全部']] as const).map(([value, label]) => (
                  <button key={value} className={flowMode === value ? "active" : ""} type="button" aria-pressed={flowMode === value} onClick={() => setFlowMode(value)}>{label}</button>
                ))}
              </div>
            </div>
            {analytics.transactionCount ? (
              <div className="analytics-chart daily-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={analytics.byDay} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
                    <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                    <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} minTickGap={24} tickMargin={10} tickFormatter={(date: string) => selectedMonth === "all" ? date.slice(5).replace("-", "/") : String(Number(date.slice(-2)))} />
                    <YAxis width={46} tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={compactAmount} tickCount={5} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} labelFormatter={(label) => String(label)} />
                    {flowMode !== "income" ? <Line type="linear" dataKey="expense" name="支出" stroke={expenseColor} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} /> : null}
                    {flowMode !== "expense" ? <Line type="linear" dataKey="income" name="收入" stroke={incomeColor} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} /> : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="chart-empty"><strong>这段时间还没有流水</strong><span>换个月份看看，或从记账页记录第一笔。</span></div>}
            {analytics.transactionCount ? <div className="chart-key">{flowMode !== "income" ? <span><i style={{ background: expenseColor }} />支出</span> : null}{flowMode !== "expense" ? <span><i style={{ background: incomeColor }} />收入（含退款）</span> : null}</div> : null}
          </section>

          <section className="panel analytics-chart-panel" aria-label="分类支出">
            <div className="analytics-panel-head"><div><h2>分类支出</h2><span className="chart-subtitle">{periodName(selectedMonth)} · 支出构成</span></div><span className="chart-unit">{displayCurrency}</span></div>
            {analytics.byCategory.length ? (
              <div className="category-breakdown">
                <div className="category-donut">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie data={analytics.byCategory} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="88%" paddingAngle={analytics.byCategory.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                        {analytics.byCategory.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-caption"><span>支出合计</span><strong>{money(analytics.totalExpense)}</strong></div>
                </div>
                <ul className="category-legend">
                  {analytics.byCategory.map((item, index) => (
                    <li key={item.name}>
                      <span className="category-name"><i style={{ background: colors[index % colors.length] }} />{item.name}</span>
                      <span className="category-amount"><strong>{money(item.value)}</strong><small>{(item.value / analytics.totalExpense * 100).toFixed(1)}%</small></span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <div className="chart-empty"><strong>这段时间没有支出</strong><span>有支出记录后，会在这里显示分类与占比。</span></div>}
          </section>

          <section className="panel analytics-chart-panel monthly-panel" aria-label="月度净流向">
            <div className="analytics-panel-head"><div><h2>月度净流向</h2><span className="chart-subtitle">全部月份 · 不受上方时间筛选影响</span></div><span className="chart-unit">{displayCurrency}</span></div>
            {analytics.byMonth.length ? (
              <>
                <div className="analytics-chart monthly-chart">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={analytics.byMonth} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%" accessibilityLayer>
                      <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                      <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} tickMargin={10} interval="preserveStartEnd" minTickGap={18} tickFormatter={(month: string) => month.slice(2).replace("-", "/")} />
                      <YAxis width={46} tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={compactAmount} tickCount={5} />
                      <ReferenceLine y={0} stroke="var(--line)" />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} formatter={(value) => [money(Number(value)), "净流向"]} />
                      <Bar dataKey="value" name="净流向" maxBarSize={38} radius={[4, 4, 4, 4]} isAnimationActive={false}>
                        {analytics.byMonth.map((item) => <Cell key={item.name} fill={item.value >= 0 ? "var(--chart-blue)" : expenseColor} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-key"><span><i style={{ background: "var(--chart-blue)" }} />净流入</span><span><i style={{ background: expenseColor }} />净流出</span></div>
              </>
            ) : <div className="chart-empty"><strong>还没有月度数据</strong><span>记录收支后，就能查看每个月的变化。</span></div>}
          </section>

          <details className="panel currency-details">
            <summary><span>原币汇总</span><small>{periodName(selectedMonth)}</small></summary>
            <p className="hint">所选期间全部流水的原币金额合计，包含转账。</p>
            {analytics.byCurrency.length ? <div className="stack-list">{analytics.byCurrency.map((item) => <div className="list-row" key={item.name}><span>{item.name}</span><strong>{item.value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>)}</div> : <p className="empty">这段时间没有记录。</p>}
          </details>
        </div>
      ) : null}
    </div>
  );
}
