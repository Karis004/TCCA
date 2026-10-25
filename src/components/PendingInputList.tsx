"use client";

import { useState } from "react";
import type { PendingInput } from "@/models/ledger";

type Props = {
  inputs: PendingInput[];
  loading: boolean;
  busy: boolean;
  processing: boolean;
  error: string;
  progress: string;
  onRefresh: () => void;
  onProcess: (ids: string[]) => void;
  onView: (input: PendingInput) => void;
  onEdit: (input: PendingInput) => void;
  onDelete: (input: PendingInput) => Promise<void>;
};

export function PendingInputList({ inputs, loading, busy, processing, error, progress, onRefresh, onProcess, onView, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const waiting = inputs.filter((item) => item.status === "pending");
  return <section className="panel pending-panel" aria-label="待识别文字">
    <div className="pending-head">
      <button type="button" className="pending-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><strong>待识别</strong><span>{loading ? "读取中…" : `${inputs.length} 条`}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
      <button type="button" className="text-button" disabled={busy || !waiting.length} onClick={() => { setExpanded(true); onProcess(waiting.map((item) => item._id)); }}>{processing ? "识别中…" : "批量识别"}</button>
      {inputs.some((item) => item.status === "processing") ? <button type="button" className="text-button" disabled={busy} onClick={onRefresh}>刷新</button> : null}
    </div>
    {progress ? <p className="pending-status" role="status">{progress}</p> : null}
    {error ? <div className="preset-error" role="alert">{error}<button type="button" className="text-button" disabled={busy} onClick={onRefresh}>刷新</button></div> : null}
    {expanded ? <div className="pending-list">
      {!inputs.length && !loading ? <p className="pending-status">暂无暂存文字</p> : null}
      {inputs.map((item) => <article className="pending-card" key={item._id}>
        <p className="pending-text">{item.text}</p>
        <div className="pending-card-foot"><span>{item.referenceDate} · {item.status === "ready" ? `${item.drafts.length} 张待确认` : item.status === "processing" ? "正在识别" : "待识别"}</span>
          <div className="pending-actions">
            {item.status === "ready" ? <button className="text-button" type="button" onClick={() => onView(item)}>查看账单</button> : <><button className="text-button" type="button" disabled={busy || item.status === "processing"} onClick={() => onProcess([item._id])}>识别</button><button className="text-button" type="button" disabled={busy || item.status === "processing"} onClick={() => onEdit(item)}>编辑</button></>}
            <button className="text-button" type="button" disabled={busy || item.status === "processing"} onClick={() => setDeleting(item._id)}>删除</button>
          </div>
        </div>
        {item.lastError ? <details className="pending-failure"><summary>上次识别失败 · 查看原因</summary><p>{item.lastError}</p></details> : null}
        {deleting === item._id ? <div className="preset-delete-confirm"><span>{item.status === "ready" ? "删除原文及尚未录入的账单？" : "删除这条暂存文字？"}</span><div><button type="button" className="text-button" onClick={() => setDeleting(null)}>取消</button><button type="button" className="text-button" disabled={busy} onClick={async () => { await onDelete(item); setDeleting(null); }}>确认删除</button></div></div> : null}
      </article>)}
    </div> : null}
  </section>;
}
