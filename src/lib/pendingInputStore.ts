import { ObjectId } from "mongodb";
import type { Db, WithId } from "mongodb";
import type { PendingInput, TransactionDraft } from "@/models/ledger";
import { getDb } from "@/lib/mongodb";
import { ownedCollection } from "@/lib/ownership";
import { HttpError, rateLimit } from "@/lib/privateApi";

export type PendingDoc = {
  userId: string;
  text: string;
  referenceDate: string;
  source?: PendingInput["source"];
  status: PendingInput["status"];
  drafts: TransactionDraft[];
  lastError: string | null;
  leaseUntil?: Date;
  attemptId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export function serializePending(doc: WithId<PendingDoc>): PendingInput {
  return { _id: doc._id.toHexString(), text: doc.text, referenceDate: doc.referenceDate, ...(doc.source ? { source: doc.source } : {}), status: doc.status, drafts: doc.drafts, lastError: doc.lastError, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() };
}

export async function createPendingInput(db: Db, userId: string, input: Pick<PendingDoc, "text" | "referenceDate" | "source">) {
  const collection = ownedCollection<PendingDoc>(db, userId, "pending_inputs");
  const [, count] = await Promise.all([
    rateLimit(db, userId, "pending-create", 60),
    collection.countDocuments({ status: { $ne: "completed" } })
  ]);
  if (count >= 500) throw new HttpError(413, "暂存文字已达到500条，请先处理现有记录。");
  const now = new Date();
  const doc: PendingDoc = { ...input, userId, status: "pending", drafts: [], lastError: null, createdAt: now, updatedAt: now };
  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function finishPendingDraft(inputId: string, draftId: string, userId: string) {
  const db = await getDb();
  const collection = ownedCollection<PendingDoc>(db, userId, "pending_inputs");
  const _id = new ObjectId(inputId);
  await collection.updateOne({ _id, status: "ready" }, { $pull: { drafts: { pendingDraftId: draftId } }, $set: { updatedAt: new Date() } });
  await collection.updateOne({ _id, status: "ready", drafts: { $size: 0 } }, { $set: { status: "completed", updatedAt: new Date() } });
}
