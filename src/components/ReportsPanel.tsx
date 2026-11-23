"use client";

import { useCallback, useEffect, useState } from "react";
import { reportKindLabels } from "@/lib/reportPeriods";
import type { ReportDetail, ReportShelf, ReportStatus, ReportSummary } from "@/lib/reportTypes";
import { maxReviewedInsights } from "@/lib/reportReview";

const statusText: Record<ReportStatus, string> = {
  queued: "等待生成",
  running: "正在整理",
  ready: "可阅读",
  sparse: "本期暂无总结",
  failed: "生成失败",
  skipped: "已取消"
};

function pending(status: ReportStatus) {
  return status === "queued" || status === "running";
}

function ReviewEditor({ detail, onSave, onClose }: {
  detail: ReportDetail & { review: NonNullable<ReportDetail["review"]> };
  onSave: (detail: ReportDetail) => void;
  onClose: () => void;
}) {
  const { review } = detail;
  const [selected, setSelected] = useState(review.selectedIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const wasSelected = new Set(review.selectedIds);
  const selectedSet = new Set(selected);
  const changed = selected.length !== review.selectedIds.length || selected.some((id, index) => id !== review.selectedIds[index]);
  const groups = [
    { title: "本期内容", candidates: review.selectedIds.flatMap(id => review.candidates.find(item => item.id === id) ?? []) },
    { title: "备选", candidates: review.candidates.filter(item => !wasSelected.has(item.id)) }
  ];

  function toggle(id: string) {
    setError("");
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  async function save() {
    if (!selected.length || !changed || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: detail.period.key, revision: review.revision, selectedIds: selected })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败。");
      onSave(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  return <div className="report-review">
    {groups.map(group => <section className="report-review-group" key={group.title}>
      <h2>{group.title}</h2>
      {group.candidates.length ? <ul className="report-review-options">
        {group.candidates.map(candidate => {
          const included = selectedSet.has(candidate.id);
          const originallyIncluded = wasSelected.has(candidate.id);
          const action = included ? (originallyIncluded ? "移除" : "撤回加入") : originallyIncluded ? "恢复" : "加入";
          return <li key={candidate.id}>
            <p>{candidate.body}</p>
            <button type="button" className="text-button" disabled={saving || (!included && selected.length >= maxReviewedInsights)} onClick={() => toggle(candidate.id)}>{action}</button>
          </li>;
        })}
      </ul> : <p className="hint">暂无备选</p>}
    </section>)}
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    <div className="report-review-actions">
      <button type="button" className="primary-button" disabled={saving || !changed || !selected.length} onClick={() => void save()}>{saving ? "保存中…" : "保存调整"}</button>
      <button type="button" className="text-button" disabled={saving} onClick={onClose}>取消</button>
      {!selected.length ? <span className="hint">至少留一条</span> : null}
    </div>
  </div>;
}

export function ReportsPanel({ issue, onIssueChange }: { issue: ReportSummary | null; onIssueChange: (issue: ReportSummary) => void }) {
  const [shelf, setShelf] = useState<ReportShelf | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [editingReview, setEditingReview] = useState(false);
  const [confirmAnnual, setConfirmAnnual] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/reports", { signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取报告失败。");
      if (!signal.aborted) { setShelf(data); setError(""); }
    } catch (error) {
      if (!signal.aborted) setError(error instanceof Error ? error.message : "读取报告失败。");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  const generating = shelf?.issues.some(item => pending(item.status)) ?? false;
  useEffect(() => {
    if (!generating || issue) return;
    const controller = new AbortController();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(controller.signal); }, 8_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [generating, issue, load]);

  useEffect(() => {
    setDetail(null);
    setError("");
    setEditingReview(false);
    if (!issue) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ issue: issue.period.key });
    fetch("/api/reports?" + query, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data: ReportDetail & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "读取报告失败。");
      if (controller.signal.aborted) return;
      setDetail(data);
      if (data.unread) {
        const marked = await fetch("/api/reports", {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: issue.period.key })
        });
        if (!marked.ok || controller.signal.aborted) return;
        setShelf(current => current && ({ ...current, issues: current.issues.map(item => item.period.key === issue.period.key ? { ...item, unread: false } : item) }));
      }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message || "读取报告失败。");
    });
    return () => controller.abort();
  }, [issue, retry]);

  async function generateAnnual() {
    if (!shelf?.annual || confirming) return;
    setConfirming(true);
    setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: shelf.annual.key, confirmed: true })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "年报暂时无法生成。");
      setConfirmAnnual(false);
      setShelf(current => current && ({ ...current, annual: null, issues: [data, ...current.issues.filter(item => item.period.key !== data.period.key)] }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "年报暂时无法生成。");
    } finally {
      setConfirming(false);
    }
  }

  function saveReviewedDetail(next: ReportDetail) {
    setDetail(current => current?.period.key === next.period.key ? next : current);
    setShelf(current => current && ({
      ...current,
      issues: current.issues.map(item => item.period.key === next.period.key ? {
        ...item, title: next.title, unread: next.unread
      } : item)
    }));
    setEditingReview(false);
  }

  const errorMessage = error ? <div className="notice error" role="alert">{error}<button type="button" className="text-button" onClick={() => { setError(""); setRetry(value => value + 1); }}>刷新</button></div> : null;
  if (issue) return <div className="reports-page">
    {errorMessage}
    {!detail && !error ? <p className="hint" role="status">正在打开报告…</p> : null}
    {detail?.story ? <article className="panel report-reading">
      <div className="report-reading-meta">
        <p className="report-period">{detail.period.label} · {reportKindLabels[detail.period.kind]}</p>
        {detail.review && !editingReview ? <button type="button" className="text-button" onClick={() => setEditingReview(true)}>调整内容</button> : null}
      </div>
      <h1>{detail.story.title}</h1>
      {editingReview && detail.review
        ? <ReviewEditor detail={{ ...detail, review: detail.review }} onSave={saveReviewedDetail} onClose={() => setEditingReview(false)} />
        : detail.story.insights.map((insight, index) => <p className="report-insight" key={index}>{insight.body}</p>)}
    </article> : null}
  </div>;

  return <section className="reports-page" aria-label="生活报告">
    <h1>生活报告</h1>
    {errorMessage}
    {!shelf && !error ? <p className="hint" role="status">正在读取报告…</p> : null}
    {shelf?.annual ? <section className="panel report-annual">
      <h2>{shelf.annual.label}度报告</h2>
      {shelf.configured ? confirmAnnual ? <div className="report-confirm">
        <p>生成会使用你自己的 AI 额度。</p>
        <button type="button" className="primary-button" disabled={confirming} onClick={() => void generateAnnual()}>{confirming ? "正在提交…" : "确认生成"}</button>
        <button type="button" className="text-button" disabled={confirming} onClick={() => setConfirmAnnual(false)}>取消</button>
      </div> : <button type="button" className="text-button" onClick={() => setConfirmAnnual(true)}>生成选项</button> : <span className="hint">请先配置 AI</span>}
    </section> : null}
    {shelf && shelf.issues.length ? <ul className="report-issues">
      {shelf.issues.map(item => <li className="panel report-issue" key={item.period.key}>
        {item.status === "ready" ? <button type="button" className="report-issue-button" onClick={() => { setError(""); onIssueChange(item); }}>
          <span className="report-issue-copy">
            <span className="report-period">{item.period.label} · {reportKindLabels[item.period.kind]}</span>
            <strong>{item.title || item.period.label}</strong>
          </span>
          {item.unread ? <span className="report-dot" aria-label="未读" /> : null}
          <span aria-hidden="true">›</span>
        </button> : <div className="report-issue-button">
          <span className="report-issue-copy">
            <span className="report-period">{item.period.label} · {reportKindLabels[item.period.kind]}</span>
            <span role={pending(item.status) ? "status" : undefined}>{statusText[item.status]}</span>
          </span>
        </div>}
      </li>)}
    </ul> : null}
    {shelf && !shelf.issues.length && !shelf.annual ? <div className="panel report-empty">
      <p>{shelf.configured ? "暂无报告" : "请先配置 AI"}</p>
    </div> : null}
  </section>;
}
