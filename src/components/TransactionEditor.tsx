"use client";

import { FormEvent } from "react";
import { useEffect, useRef } from "react";
import type { Category, ParsedTransaction, PaymentMethod, TransactionInput } from "@/models/ledger";
import { currencies } from "@/presets/ledger";

type DraftTransaction = ParsedTransaction & {
  amountCny?: number;
  fxRateToCny?: number;
  parseDurationMs?: number;
  originalText?: string;
};

type Props = {
  draft: DraftTransaction | null;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  merchantSuggestions: string[];
  onChange: (draft: DraftTransaction | null) => void;
  onSave: (payload: Omit<TransactionInput, "amountCny" | "fxRateToCny">) => void;
  saving: boolean;
};

export function TransactionEditor({ draft, categories, paymentMethods, merchantSuggestions, onChange, onSave, saving }: Props) {
  const latestDraftRef = useRef({ draft, onChange });

  useEffect(() => {
    latestDraftRef.current = { draft, onChange };
  });

  useEffect(() => {
    if (!draft?.currency) return;

    let cancelled = false;
    const currency = draft.currency.toUpperCase();
    const amount = Number(draft.amount || 0);

    fetch(`/api/fx?currency=${encodeURIComponent(currency)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { rate?: number } | null) => {
        if (cancelled || !data?.rate) return;
        const current = latestDraftRef.current.draft;
        if (!current || current.currency?.toUpperCase() !== currency || Number(current.amount || 0) !== amount) return;

        latestDraftRef.current.onChange({
          ...current,
          currency,
          fxRateToCny: data.rate,
          amountCny: Number((amount * data.rate).toFixed(2))
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [draft?.currency, draft?.amount]);

  if (!draft) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span>待确认账单</span>
          <span>Draft</span>
        </div>
        <p className="hint">AI 识别后，这里会出现一张可编辑账单。</p>
      </section>
    );
  }

  function update(key: keyof DraftTransaction, value: unknown) {
    onChange({ ...draft, [key]: value } as DraftTransaction);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;

    onSave({
      type: draft.type,
      amount: Number(draft.amount || 0),
      currency: (draft.currency || "CNY").toUpperCase(),
      date: draft.date || new Date().toISOString().slice(0, 10),
      category: draft.category?.trim() || "未分类",
      paymentMethod: draft.paymentMethod?.trim() || "未指定",
      merchant: draft.merchant,
      tags: draft.tags || [],
      note: draft.note,
      originalText: draft.originalText || null
    });
  }

  return (
    <section className="panel">
        <div className="panel-head">
          <span>待确认账单</span>
          <span>{draft.parseDurationMs ? `${(draft.parseDurationMs / 1000).toFixed(1)}s` : "Draft"}</span>
        </div>
        <div className="draft-total">约 ¥{draft.amountCny?.toFixed(2) || "0.00"}</div>
      <form className="list" onSubmit={submit}>
        <div className="split">
          <div className="field">
            <label>类型</label>
            <select className="select" value={draft.type} onChange={(event) => update("type", event.target.value)}>
              <option value="expense">支出</option>
              <option value="income">收入</option>
              <option value="transfer">转账</option>
              <option value="refund">退款</option>
            </select>
          </div>
          <div className="field">
            <label>金额</label>
            <input className="input" type="number" step="0.01" value={draft.amount || ""} onChange={(event) => update("amount", Number(event.target.value))} />
          </div>
        </div>

        <div className="split">
          <div className="field">
            <label>货币</label>
            <select className="select" value={draft.currency || "CNY"} onChange={(event) => update("currency", event.target.value)}>
              {currencies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>日期</label>
            <input className="input" type="date" value={draft.date || ""} onChange={(event) => update("date", event.target.value)} />
          </div>
        </div>

        <div className="split">
          <div className="field">
            <label>分类</label>
            <input className="input" list="category-options" value={draft.category || ""} onChange={(event) => update("category", event.target.value || null)} />
            <datalist id="category-options">
              {categories.map((item) => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>支付方式</label>
            <input className="input" list="payment-method-options" value={draft.paymentMethod || ""} onChange={(event) => update("paymentMethod", event.target.value || null)} />
            <datalist id="payment-method-options">
              {paymentMethods.map((item) => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="field">
          <label>商户</label>
          <input className="input" value={draft.merchant || ""} onChange={(event) => update("merchant", event.target.value || null)} />
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
          <textarea className="textarea" value={draft.note || ""} onChange={(event) => update("note", event.target.value || null)} />
        </div>

        <p className="hint">按实时汇率折算人民币，当前汇率 {draft.fxRateToCny || 1}</p>
        <button className="button" disabled={saving || !draft.amount}>
          {saving ? "录入中..." : "确认录入"}
        </button>
      </form>
    </section>
  );
}
