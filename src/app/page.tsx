"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TransactionEditor } from "@/components/TransactionEditor";
import type { Category, ParsedTransaction, PaymentMethod, Transaction, TransactionInput } from "@/models/ledger";
import { categories as defaultCategories, paymentMethods as defaultPaymentMethods } from "@/presets/ledger";

type Tab = "entry" | "analytics" | "records" | "settings";

type Analytics = {
  totalIncomeCny: number;
  totalExpenseCny: number;
  balanceCny: number;
  byCategory: { name: string; value: number }[];
  byPayment: { name: string; value: number }[];
  byCurrency: { name: string; value: number }[];
  byMonth: { name: string; value: number }[];
  months: string[];
  selectedMonth: string;
  byDay: { name: string; expense: number; income: number }[];
  hasDailyIncome: boolean;
};

type Draft = ParsedTransaction & {
  amountCny?: number;
  fxRateToCny?: number;
  parseDurationMs?: number;
  originalText?: string;
};

const tabs: { key: Tab; label: string }[] = [
  { key: "entry", label: "记账" },
  { key: "analytics", label: "分析" },
  { key: "records", label: "流水" },
  { key: "settings", label: "设置" }
];

function money(value = 0) {
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readStoredLists() {
  const modelLists = localStorage.getItem("ai-ledger-model-lists");
  const customLists = localStorage.getItem("ai-ledger-custom-lists");
  const stored = modelLists || customLists;
  if (!stored) return null;

  try {
    const data = JSON.parse(stored) as Partial<{
      categories: Category[];
      paymentMethods: PaymentMethod[];
    }>;

    if (!modelLists && customLists) {
      return {
        categories: Array.isArray(data.categories) ? [...defaultCategories, ...data.categories] : defaultCategories,
        paymentMethods: Array.isArray(data.paymentMethods) ? [...defaultPaymentMethods, ...data.paymentMethods] : defaultPaymentMethods
      };
    }

    return data;
  } catch {
    localStorage.removeItem("ai-ledger-model-lists");
    localStorage.removeItem("ai-ledger-custom-lists");
    return null;
  }
}

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("entry");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newPaymentMethodName, setNewPaymentMethodName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh(month = selectedMonth) {
    const analyticsUrl = month ? `/api/analytics?month=${encodeURIComponent(month)}` : "/api/analytics";
    const [recordsResponse, analyticsResponse] = await Promise.all([fetch("/api/transactions"), fetch(analyticsUrl)]);
    if (!recordsResponse.ok || !analyticsResponse.ok) {
      throw new Error("读取数据失败，请检查 MongoDB 配置。");
    }
    setTransactions(await recordsResponse.json());
    const nextAnalytics = await analyticsResponse.json();
    setAnalytics(nextAnalytics);
    if (!month && nextAnalytics.selectedMonth) {
      setSelectedMonth(nextAnalytics.selectedMonth);
    }
  }

  useEffect(() => {
    const stored = readStoredLists();
    if (stored) {
      if (Array.isArray(stored.categories)) setCategories(stored.categories);
      if (Array.isArray(stored.paymentMethods)) setPaymentMethods(stored.paymentMethods);
    }

    (async () => {
      try {
        const [recordsResponse, analyticsResponse] = await Promise.all([fetch("/api/transactions"), fetch("/api/analytics")]);
        if (!recordsResponse.ok || !analyticsResponse.ok) {
          throw new Error("读取数据失败，请检查 MongoDB 配置。");
        }
        setTransactions(await recordsResponse.json());
        const nextAnalytics = await analyticsResponse.json();
        setAnalytics(nextAnalytics);
        if (nextAnalytics.selectedMonth) {
          setSelectedMonth(nextAnalytics.selectedMonth);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "读取数据失败。");
      }
    })();
  }, []);

  function persistModelLists(nextCategories = categories, nextPaymentMethods = paymentMethods) {
    localStorage.setItem(
      "ai-ledger-model-lists",
      JSON.stringify({
        categories: nextCategories,
        paymentMethods: nextPaymentMethods
      })
    );
  }

  async function parseText() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          categories: categories.map((item) => item.name),
          paymentMethods: paymentMethods.map((item) => item.name)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "识别失败。");
      setDraft(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "识别失败。");
    } finally {
      setLoading(false);
    }
  }

  async function saveTransaction(payload: Omit<TransactionInput, "amountCny" | "fxRateToCny">) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败。");
      setDraft(null);
      setText("");
      setMessage("账单已录入。");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransaction(id: string) {
    await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  async function changeAnalyticsMonth(month: string) {
    setSelectedMonth(month);
    await refresh(month);
  }

  function updateCategory(id: string, name: string) {
    const next = categories.map((item) => (item.id === id ? { ...item, name } : item));
    setCategories(next);
    persistModelLists(next, paymentMethods);
  }

  function updatePaymentMethod(id: string, name: string) {
    const next = paymentMethods.map((item) => (item.id === id ? { ...item, name } : item));
    setPaymentMethods(next);
    persistModelLists(categories, next);
  }

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const next = [...categories, { id: makeId("category"), name }];
    setCategories(next);
    setNewCategoryName("");
    persistModelLists(next, paymentMethods);
    setMessage("分类已更新，并会参与后续 AI 识别。");
  }

  function addPaymentMethod() {
    const name = newPaymentMethodName.trim();
    if (!name) return;
    const next = [...paymentMethods, { id: makeId("payment"), name }];
    setPaymentMethods(next);
    setNewPaymentMethodName("");
    persistModelLists(categories, next);
    setMessage("支付方式已更新，并会参与后续 AI 识别。");
  }

  function removeCategory(id: string) {
    const next = categories.filter((item) => item.id !== id);
    setCategories(next);
    persistModelLists(next, paymentMethods);
  }

  function removePaymentMethod(id: string) {
    const next = paymentMethods.filter((item) => item.id !== id);
    setPaymentMethods(next);
    persistModelLists(categories, next);
  }

  function resetModelLists() {
    setCategories(defaultCategories);
    setPaymentMethods(defaultPaymentMethods);
    setNewCategoryName("");
    setNewPaymentMethodName("");
    localStorage.removeItem("ai-ledger-model-lists");
    localStorage.removeItem("ai-ledger-custom-lists");
    setMessage("模型列表已恢复为默认值。");
  }

  const visibleTransactions = useMemo(() => transactions.slice(0, 80), [transactions]);
  const merchantSuggestions = useMemo(() => {
    const scores = new Map<string, { count: number; recent: number }>();

    transactions.forEach((item, index) => {
      const merchant = item.merchant?.trim();
      if (!merchant) return;
      const current = scores.get(merchant) || { count: 0, recent: 0 };
      scores.set(merchant, {
        count: current.count + 1,
        recent: Math.max(current.recent, transactions.length - index)
      });
    });

    return Array.from(scores.entries())
      .sort((a, b) => b[1].count - a[1].count || b[1].recent - a[1].recent)
      .slice(0, 8)
      .map(([name]) => name);
  }, [transactions]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">TCCA</div>
          <div className="tagline">一句话记账</div>
        </div>
        <nav className="tabs desktop-tabs" aria-label="页面">
          {tabs.map((item) => (
            <button key={item.key} className={`tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      {tab === "entry" ? (
        <div className="entry-grid">
          <section className="command-panel">
            <div className="panel-head">
              <span>AI 识别</span>
              <span>{text.length} 字</span>
            </div>
            <textarea
              className="command-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder=""
              autoFocus
            />
            <div className="action-row">
              <button className="primary-button" disabled={loading || !text.trim()} onClick={parseText}>
                {loading ? "识别中..." : "识别账单"}
              </button>
              <button className="ghost-button" onClick={() => setText("")}>
                清空
              </button>
            </div>
          </section>

          <TransactionEditor
            draft={draft}
            categories={categories}
            paymentMethods={paymentMethods}
            merchantSuggestions={merchantSuggestions}
            onChange={setDraft}
            onSave={saveTransaction}
            saving={saving}
          />
        </div>
      ) : null}

      {tab === "analytics" && analytics ? (
        <div className="analytics-grid">
          <section className="metric-board">
            <div className="metric-card">
              <span>收入</span>
              <strong>{money(analytics.totalIncomeCny)}</strong>
            </div>
            <div className="metric-card">
              <span>支出</span>
              <strong>{money(analytics.totalExpenseCny)}</strong>
            </div>
            <div className="metric-card dark">
              <span>结余</span>
              <strong>{money(analytics.balanceCny)}</strong>
            </div>
          </section>

          <section className="panel chart-panel wide">
            <div className="panel-head">
              <span>每日流水</span>
              <select className="compact-select" value={analytics.selectedMonth} onChange={(event) => changeAnalyticsMonth(event.target.value)}>
                {analytics.months.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
            <div className="chart">
              <ResponsiveContainer>
                <LineChart data={analytics.byDay}>
                  <CartesianGrid stroke="#e8e8e4" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="expense" name="支出" stroke="#d7422f" strokeWidth={2} dot={false} />
                  {analytics.hasDailyIncome ? <Line type="monotone" dataKey="income" name="收入" stroke="#0b7f49" strokeWidth={2} dot={false} /> : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel chart-panel wide">
            <div className="panel-head">
              <span>月度净流向</span>
              <span>CNY</span>
            </div>
            <div className="chart">
              <ResponsiveContainer>
                <BarChart data={analytics.byMonth}>
                  <CartesianGrid stroke="#e8e8e4" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#121212" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel chart-panel">
            <div className="panel-head">
              <span>分类支出</span>
              <span>Top</span>
            </div>
            <div className="chart">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={analytics.byCategory} dataKey="value" nameKey="name" outerRadius={82} fill="#121212" label />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span>货币对比</span>
              <span>原币</span>
            </div>
            <div className="stack-list">
              {analytics.byCurrency.map((item) => (
                <div className="list-row" key={item.name}>
                  <span>{item.name}</span>
                  <strong>{item.value.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "records" ? (
        <section className="panel">
          <div className="panel-head">
            <span>流水</span>
            <span>{visibleTransactions.length} 条</span>
          </div>
          <div className="record-list">
            {visibleTransactions.map((item) => (
              <article className="record-card" key={item._id}>
                <div>
                  <h3>{item.category}</h3>
                  <p>
                    {item.date} · {item.paymentMethod} · {item.currency} {item.amount}
                  </p>
                  {item.note ? <p>{item.note}</p> : null}
                </div>
                <div className="record-side">
                  <strong className={item.type === "expense" ? "negative" : "positive"}>
                    {item.type === "expense" ? "-" : "+"}
                    {money(item.amountCny)}
                  </strong>
                  <button className="text-button" onClick={() => deleteTransaction(item._id)}>
                    删除
                  </button>
                </div>
              </article>
            ))}
            {!visibleTransactions.length ? <p className="empty">还没有流水。先用一句话录入第一笔。</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="panel settings-panel">
          <div className="panel-head">
            <span>设置</span>
            <button className="text-button" onClick={resetModelLists}>
              恢复默认
            </button>
          </div>

          <details className="setting-group">
            <summary>
              <span>消费分类</span>
              <small>{categories.length} 项</small>
            </summary>
            <div className="model-list">
              {categories.map((item) => (
                <div className="model-row" key={item.id}>
                  <input className="input" value={item.name} onChange={(event) => updateCategory(item.id, event.target.value)} />
                  <button className="text-button" onClick={() => removeCategory(item.id)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
            <div className="model-row add-row">
              <input className="input" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="新增分类" />
              <button className="primary-button" onClick={addCategory}>
                添加
              </button>
            </div>
          </details>

          <details className="setting-group">
            <summary>
              <span>支付方式</span>
              <small>{paymentMethods.length} 项</small>
            </summary>
            <div className="model-list">
              {paymentMethods.map((item) => (
                <div className="model-row" key={item.id}>
                  <input className="input" value={item.name} onChange={(event) => updatePaymentMethod(item.id, event.target.value)} />
                  <button className="text-button" onClick={() => removePaymentMethod(item.id)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
            <div className="model-row add-row">
              <input className="input" value={newPaymentMethodName} onChange={(event) => setNewPaymentMethodName(event.target.value)} placeholder="新增支付方式" />
              <button className="primary-button" onClick={addPaymentMethod}>
                添加
              </button>
            </div>
          </details>
        </section>
      ) : null}

      <footer className="footer">
        Rates by{" "}
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">
          Exchange Rate API
        </a>
      </footer>

      <nav className="mobile-tabs" aria-label="移动端页面">
        {tabs.map((item) => (
          <button key={item.key} className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>
    </main>
  );
}
