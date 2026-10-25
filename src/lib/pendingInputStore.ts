import { ObjectId } from "mongodb";
import type { WithId } from "mongodb";
import type { PendingInput, TransactionDraft } from "@/models/ledger";
import { getDb } from "@/lib/mongodb";

export type PendingDoc = {
  text: string;
  referenceDate: string;
  status: PendingInput["status"];
  drafts: TransactionDraft[];
  lastError: string | null;
  leaseUntil?: Date;
  attemptId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export function serializePending(doc: WithId<PendingDoc>): PendingInput {
  return { _id: doc._id.toHexString(), text: doc.text, referenceDate: doc.referenceDate, status: doc.status, drafts: doc.drafts, lastError: doc.lastError, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() };
}

export async function finishPendingDraft(inputId: string, draftId: string) {
  const db = await getDb();
  const collection = db.collection<PendingDoc>("pending_inputs");
  const _id = new ObjectId(inputId);
  await collection.updateOne({ _id, status: "ready" }, { $pull: { drafts: { pendingDraftId: draftId } }, $set: { updatedAt: new Date() } });
  await collection.updateOne({ _id, status: "ready", drafts: { $size: 0 } }, { $set: { status: "completed", updatedAt: new Date() } });
}
