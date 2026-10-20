"use client";

import { useState } from "react";
import type { TransactionPreset } from "@/models/ledger";

type Props = {
  presets: TransactionPreset[];
  loading: boolean;
  error: string;
  disabled: boolean;
  deletingId: string | null;
  onRetry: () => void;
  onUse: (preset: TransactionPreset) => void;
  onEdit: (preset: TransactionPreset) => void;
  onDelete: (preset: TransactionPreset) => Promise<boolean>;
};

export function TransactionPresetList({ presets, loading, error, disabled, deletingId, onRetry, onUse, onEdit, onDelete }: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <section className="panel preset-panel" aria-label="账单预设">
      <div className="preset-panel-head"><h2>账单预设</h2><span>{loading ? "读取中…" : `${presets.length} 条`}</span></div>
      {error ? <div className="preset-error" role="alert">{error}<button type="button" className="text-button" onClick={onRetry}>重试</button></div> : null}
      <div className="preset-list">
        {presets.map((preset) => (
          <article className="preset-card" key={preset._id}>
            <button type="button" className="preset-use" title={`${preset.category} · ${preset.paymentMethod}${preset.merchant ? ` · ${preset.merchant}` : ""}`} aria-label={`使用预设：${preset.name}`} disabled={disabled || deletingId === preset._id} onClick={() => onUse(preset)}>
              <strong>{preset.name}</strong>
              <span className="preset-amount">{preset.currency} {preset.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </button>
            <div className="preset-card-actions">
              <button type="button" className="text-button" disabled={disabled || !!deletingId} onClick={() => { setConfirmDeleteId(null); onEdit(preset); }} aria-label={`编辑预设：${preset.name}`}>编辑</button>
              <button type="button" className="text-button" disabled={disabled || !!deletingId} onClick={() => setConfirmDeleteId(preset._id)} aria-label={`删除预设：${preset.name}`}>删除</button>
            </div>
            {confirmDeleteId === preset._id ? (
              <div className="preset-delete-confirm">
                <span>删除这条预设？已录入的流水不受影响。</span>
                <div>
                  <button type="button" className="text-button" disabled={!!deletingId} onClick={() => setConfirmDeleteId(null)}>取消</button>
                  <button type="button" className="text-button" disabled={!!deletingId} onClick={async () => { if (await onDelete(preset)) setConfirmDeleteId(null); }}>{deletingId === preset._id ? "删除中…" : "确认删除"}</button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {!presets.length && !loading && !error ? <p className="empty preset-empty">暂无预设</p> : null}
    </section>
  );
}
