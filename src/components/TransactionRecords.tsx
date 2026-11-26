"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, PaymentMethod, Transaction } from "@/models/ledger";

type Props = {
  active: boolean;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  revision: number;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
};
const ranges = { year: "近一年", half: "近半年", all: "全部时间" };

export function TransactionRecords({ active, categories, paymentMethods, revision, onEdit, onDelete }: Props) {
  const [text, setText] = useState("");
  const [queryText, setQueryText] = useState("");
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [range, setRange] = useState<keyof typeof ranges>("year");
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState<{ query: string; records: Transaction[]; cursor: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [historicalOptions, setHistoricalOptions] = useState<{categories: string[]; paymentMethods: string[]}>({categories: [], paymentMethods: []});
  const generation = useRef(0);
  const lastRequestAt = useRef(0);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    fetch(`/api/transactions?options=1&range=${range}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const options = await response.json();
      if (!controller.signal.aborted) setHistoricalOptions(options);
    }).catch(() => {});
    return () => controller.abort();
  }, [expanded, range, revision]);
  useEffect(() => { const timer = setTimeout(() => setQueryText(text.trim()), 250); return () => clearTimeout(timer); }, [text]);
  const query = useMemo(() => {
    const params = new URLSearchParams({ range });
    if (category) params.set("category", category);
    if (paymentMethod) params.set("paymentMethod", paymentMethod);
    if (queryText) params.set("q", queryText);
    return params.toString();
  }, [range, category, paymentMethod, queryText]);
  const visiblePage = page?.query === query ? page : null;
  const records = visiblePage?.records ?? [];
  const cursor = visiblePage?.cursor ?? "";
  useEffect(() => {
    const controller = new AbortController(); const current = ++generation.current;
    lastRequestAt.current = Date.now();
    setLoading(true); setMoreLoading(false); setError("");
    fetch(`/api/transactions?${query}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "搜索失败，请重试。");
      if (generation.current !== current || controller.signal.aborted) return;
      setPage({ query, records: data, cursor: response.headers.get("X-Next-Cursor") || "" });
    }).catch(e => { if (!controller.signal.aborted && generation.current === current) setError(e.message || "搜索失败。"); })
      .finally(() => { if (!controller.signal.aborted && generation.current === current) setLoading(false); });
    return () => { controller.abort(); generation.current = current + 1; };
  }, [query, revision, retry]);
  useEffect(() => {
    if (!active) return;
    const revalidate = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRequestAt.current >= 60_000) {
        lastRequestAt.current = Date.now();
        setRetry(value => value + 1);
      }
    };
    revalidate();
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [active]);
  async function loadMore() {
    if (!cursor || loading || moreLoading) return;
    const current = generation.current; setMoreLoading(true); setError("");
    try {
      const response = await fetch(`/api/transactions?${query}&cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "读取失败。");
      if (generation.current !== current) return;
      setPage(previous => {
        if (previous?.query !== query) return previous;
        const ids = new Set(previous.records.map(item => item._id));
        return { query, records: [...previous.records, ...data.filter((item: Transaction) => !ids.has(item._id))], cursor: response.headers.get("X-Next-Cursor") || "" };
      });
    } catch (e) { if (generation.current === current) setError(e instanceof Error ? e.message : "读取失败。"); }
    finally { if (generation.current === current) setMoreLoading(false); }
  }
  if (!active) return null;
  const activeFilters = Number(!!category) + Number(!!paymentMethod) + Number(range !== "year");
  return <section className="panel records-panel" aria-label="流水">
    <div className="mp-section-head"><h2>流水</h2><span>{ranges[range]} · {loading && !visiblePage ? "搜索中…" : `${records.length}${cursor ? "+" : ""} 条`}</span></div>
    <div className="records-search-bar">
      <input className="input" type="search" aria-label="搜索备注或商户" placeholder="搜索备注或商户" maxLength={100} value={text} onChange={event => setText(event.target.value)} />
      <button className="text-button" type="button" aria-expanded={expanded} aria-controls="record-filters" onClick={() => setExpanded(!expanded)}>筛选{activeFilters ? ` · ${activeFilters}` : ""}</button>
    </div>
    {expanded ? <div className="records-filter-grid" id="record-filters">
      <select className="select" aria-label="流水分类" value={category} onChange={event => setCategory(event.target.value)}><option value="">全部分类</option>{[...new Set([...categories.map(item => item.name), ...historicalOptions.categories, category].filter(Boolean))].map(name => <option key={name} value={name}>{name}</option>)}</select>
      <select className="select" aria-label="流水支付方式" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}><option value="">全部支付方式</option>{[...new Set([...paymentMethods.map(item => item.name), ...historicalOptions.paymentMethods, paymentMethod].filter(Boolean))].map(name => <option key={name} value={name}>{name}</option>)}</select>
      <select className="select" aria-label="流水搜索时间" value={range} onChange={event => setRange(event.target.value as keyof typeof ranges)}>{Object.entries(ranges).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button className="text-button" type="button" onClick={() => { setText(""); setQueryText(""); setCategory(""); setPaymentMethod(""); setRange("year"); }}>重置</button>
    </div> : null}
    {error ? <div className="notice error" role="alert">{error}<button className="text-button" onClick={() => setRetry(value => value + 1)}>重试</button></div> : null}
    <div className="record-list" aria-busy={loading}>
      {records.map(item => <article className="record-card" key={item._id}>
        <div className="record-main"><div className="record-title-row"><h3>{item.category}</h3>{item.merchant ? <span>{item.merchant}</span> : null}</div>
          <p>{item.date} · {item.paymentMethod} · {item.currency} {item.amount}</p>{item.note ? <p>{item.note}</p> : null}
        </div>
        <div className="record-side"><div className="record-actions"><button className="text-button" onClick={() => onEdit(item)}>编辑</button><button className="text-button danger-text" onClick={() => onDelete(item._id)}>删除</button></div>
          <strong className={item.type === "expense" ? "negative" : "positive"}>{item.type === "expense" ? "-" : "+"}¥{item.amountCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
      </article>)}
      {cursor ? <button className="text-button" disabled={loading || moreLoading} onClick={() => { void loadMore(); }}>{moreLoading ? "读取中…" : "加载更多流水"}</button> : null}
      {!records.length && !error ? <p className="empty">{loading ? "搜索中…" : "没有符合条件的流水"}</p> : null}
    </div>
  </section>;
}
