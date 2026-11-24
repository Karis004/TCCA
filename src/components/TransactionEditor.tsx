"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Category, TransactionDraft as DraftTransaction, PaymentMethod, TransactionInput } from "@/models/ledger";
import { currencies } from "@/presets/ledger";

type Props = {
  draft: DraftTransaction | null;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  merchantSuggestions: string[];
  onChange: (draft: DraftTransaction | null) => void;
  onSave: (payload: Omit<TransactionInput, "amountCny" | "fxRateToCny">) => void;
  saving: boolean;
  idSuffix?: string;
  title?: string;
  meta?: string;
  saveLabel?: string;
  onSavePreset?: (draft: DraftTransaction) => void;
  onDiscard?: () => void;
  showDate?: boolean;
  allowHistoricalChoices?: boolean;
};

const previewRequests = new Map<string, Promise<number>>();

function loadPreviewRate(currency: string) {
  const pending = previewRequests.get(currency);
  if (pending) return pending;

  const request = fetch(`/api/fx?currency=${encodeURIComponent(currency)}`).then(async response => {
    if (!response.ok) throw new Error("FX request failed.");
    const { rate } = await response.json();
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) throw new Error("Invalid FX rate.");
    return rate;
  }).finally(() => previewRequests.delete(currency));
  previewRequests.set(currency, request);
  return request;
}

export function TransactionEditor({
  draft,
  categories,
  paymentMethods,
  merchantSuggestions,
  onChange,
  onSave,
  saving,
  title = "待确认账单",
  meta,
  saveLabel = "确认录入",
  onSavePreset,
  onDiscard,
  showDate = true,
  allowHistoricalChoices = false
}: Props) {
  const [preview, setPreview] = useState<{ currency: string; rate: number | null } | null>(null);
  const currency = draft?.currency?.toUpperCase();

  useEffect(() => {
    if (!currency || currency === "CNY") return;
    let cancelled = false;
    setPreview(null);
    loadPreviewRate(currency).then(rate => {
      if (!cancelled) setPreview({ currency, rate });
    }).catch(() => {
      if (!cancelled) setPreview({ currency, rate: null });
    });
    return () => { cancelled = true; };
  }, [currency]);

  if (!draft) return null;
  const categoryNames = [...new Set(categories.map(item => item.name).filter(Boolean))];
  const paymentNames = [...new Set(paymentMethods.map(item => item.name).filter(Boolean))];
  if (allowHistoricalChoices && draft.category && !categoryNames.includes(draft.category)) categoryNames.push(draft.category);
  if (allowHistoricalChoices && draft.paymentMethod && !paymentNames.includes(draft.paymentMethod)) paymentNames.push(draft.paymentMethod);
  const selectedCategory = categoryNames.includes(draft.category ?? "") ? draft.category! : "";
  const selectedPayment = paymentNames.includes(draft.paymentMethod ?? "") ? draft.paymentMethod! : "";
  const validChoices = Boolean(selectedCategory && selectedPayment);
  const currentPreview = preview?.currency === currency ? preview : null;
  const rate = currency === "CNY" ? 1 : currentPreview?.rate ?? draft.fxRateToCny;

  function update(key: keyof DraftTransaction, value: unknown) {
    if (key === "currency" && draft) {
      onChange({ ...draft, currency: value as string, fxRateToCny: undefined, amountCny: undefined });
      return;
    }
    onChange({ ...draft, [key]: value } as DraftTransaction);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !validChoices) return;

    onSave({
      type: draft.type,
      amount: Number(draft.amount || 0),
      currency: (draft.currency || "HKD").toUpperCase(),
      date: draft.date || new Date().toISOString().slice(0, 10),
      category: selectedCategory,
      paymentMethod: selectedPayment,
      merchant: draft.merchant,
      tags: draft.tags || [],
      note: draft.note,
      originalText: draft.originalText || null
    });
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span>{title}</span>
        <div className="panel-actions">{meta ? <span>{meta}</span> : null}{onDiscard ? <button type="button" className="text-button" disabled={saving} onClick={onDiscard}>删除这张</button> : null}</div>
      </div>
      <div className="draft-total">{rate !== undefined ? `约 ¥${(Number(draft.amount || 0) * rate).toFixed(2)}` : currentPreview ? "暂时无法换算汇率" : "读取汇率中…"}</div>
      <form className="list" onSubmit={submit}>
        <div className="split">
          <div className="field">
            <label>类型</label>
            <select className="select" aria-label="账单类型" value={draft.type} onChange={(event) => update("type", event.target.value)}>
              <option value="expense">支出</option>
              <option value="income">收入</option>
              <option value="transfer">转账</option>
              <option value="refund">退款</option>
            </select>
          </div>
          <div className="field">
            <label>金额</label>
            <input className="input" aria-label="金额" type="number" min="0.01" step="0.01" value={draft.amount || ""} onChange={(event) => update("amount", Number(event.target.value))} />
          </div>
        </div>

        <div className={showDate ? "split" : ""}>
          <div className="field">
            <label>货币</label>
            <select className="select" aria-label="货币" value={draft.currency || "HKD"} onChange={(event) => update("currency", event.target.value)}>
              {currencies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          {showDate ? <div className="field">
            <label>日期</label>
            <input className="input" aria-label="日期" type="date" value={draft.date || ""} onChange={(event) => update("date", event.target.value)} />
          </div> : null}
        </div>

        <div className="split">
          <div className="field">
            <label>分类</label>
            <select className="select" aria-label="分类" required value={selectedCategory} onChange={event => update("category", event.target.value || null)}>
              <option value="" disabled>请选择分类</option>
              {categoryNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>支付方式</label>
            <select className="select" aria-label="支付方式" required value={selectedPayment} onChange={event => update("paymentMethod", event.target.value || null)}>
              <option value="" disabled>请选择支付方式</option>
              {paymentNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>商户</label>
          <input className="input" aria-label="商户" value={draft.merchant || ""} onChange={(event) => update("merchant", event.target.value || null)} />
          {merchantSuggestions.length ? (
            <div className="suggestion-row" aria-label="常用商户">
              {merchantSuggestions.map((merchant) => (
                <button type="button" className="suggestion-chip" key={merchant} onClick={() => update("merchant", merchant)}>
                  {merchant}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="field">
          <label>备注</label>
          <textarea className="textarea" aria-label="备注" value={draft.note || ""} onChange={(event) => update("note", event.target.value || null)} />
        </div>

        <div className="draft-save-actions">
          {onSavePreset ? <button type="button" className="button secondary" disabled={saving || !validChoices || !draft.amount || draft.amount <= 0} onClick={() => onSavePreset(draft)}>存为预设</button> : null}
          <button type="submit" className="button" disabled={saving || !validChoices || !draft.amount || draft.amount <= 0}>
            {saving ? "处理中..." : saveLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
