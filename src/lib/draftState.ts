import type { TransactionDraft } from "../models/ledger";

export function identifyDrafts(drafts: TransactionDraft[], makeId = () => `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
  return drafts.map((draft) => draft.localDraftId ? draft : {
    ...draft,
    localDraftId: draft.pendingInputId && draft.pendingDraftId
      ? `pending-${draft.pendingInputId}-${draft.pendingDraftId}` : makeId()
  });
}

// Updates may arrive after a draft was submitted or discarded. They must never recreate it.
export function changeDraft(current: TransactionDraft[], id: string, next: TransactionDraft | null) {
  const existing = current.find((draft) => draft.localDraftId === id);
  if (!existing) return current;
  if (!next) return current.filter((draft) => draft.localDraftId !== id);
  return current.map((draft) => draft.localDraftId === id ? {
    ...next,
    localDraftId: existing.localDraftId,
    pendingInputId: existing.pendingInputId,
    pendingDraftId: existing.pendingDraftId
  } : draft);
}
