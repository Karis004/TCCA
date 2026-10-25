import { z } from "zod";
import type { PendingInput, TransactionDraft } from "../models/ledger";

export const pendingInputSchema = z.object({
  text: z.string().trim().min(1, "请先输入要暂存的文字。").max(12000, "每条文字最多 12000 字。"),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择有效日期。").refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "请选择有效日期。")
});

export function pendingKey(draft: TransactionDraft) {
  return draft.pendingInputId && draft.pendingDraftId ? `${draft.pendingInputId}:${draft.pendingDraftId}` : null;
}

export function mergePendingDrafts(current: TransactionDraft[], inputs: PendingInput[]) {
  const ready = inputs.filter((item) => item.status === "ready").flatMap((item) => item.drafts);
  const keys = new Set(ready.map(pendingKey));
  const retained = current.filter((draft) => !pendingKey(draft) || keys.has(pendingKey(draft)));
  const existing = new Set(retained.map(pendingKey));
  return [...retained, ...ready.filter((draft) => !existing.has(pendingKey(draft)))];
}
