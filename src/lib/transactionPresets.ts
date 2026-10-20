import type { TransactionDraft, TransactionPresetInput } from "@/models/ledger";

export function ledgerToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}

export function presetToDraft(preset: TransactionPresetInput, now = new Date()): TransactionDraft {
  return {
    type: preset.type,
    amount: preset.amount,
    currency: preset.currency,
    date: ledgerToday(now),
    category: preset.category,
    paymentMethod: preset.paymentMethod,
    merchant: preset.merchant || null,
    tags: [...preset.tags],
    note: preset.note || null,
    confidence: 1,
    needsReview: true,
    ...(preset.currency === "CNY" ? { amountCny: preset.amount, fxRateToCny: 1 } : {})
  };
}

export function suggestPresetName(draft: TransactionDraft) {
  return (draft.note?.trim() || draft.merchant?.trim() || draft.category?.trim() || "常用账单").slice(0, 80);
}
