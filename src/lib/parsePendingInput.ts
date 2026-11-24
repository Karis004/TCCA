import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { ownedCollection } from "@/lib/ownership";
import { HttpError, rateLimit } from "@/lib/privateApi";
import { getUserAi, getUserSettings } from "@/lib/userData";
import { parseDrafts } from "@/lib/parseDrafts";
import type { PendingDoc } from "@/lib/pendingInputStore";

export async function parsePendingInput(db: Db, userId: string, id: string) {
  const context = { db, userId };
  const collection = ownedCollection<PendingDoc>(db, userId, "pending_inputs");
  const _id = new ObjectId(id);
  const existing = await collection.findOne({ _id });
  if (existing?.status === "ready") return existing;
  if (!existing || existing.status === "completed") throw new HttpError(409, "该文字正在识别或已处理，请刷新列表。");
  const limits = rateLimit(db, userId, "ai-minute", 10).then(() => rateLimit(db, userId, "ai-day", 200, 86400));
  const [, settings, credentials] = await Promise.all([limits, getUserSettings(context), getUserAi(context)]);
  const attemptId = randomUUID();
  const claimed = await collection.findOneAndUpdate({
    _id, $or: [{ status: "pending" }, { status: "processing", leaseUntil: { $lt: new Date() } }]
  }, {
    $set: { status: "processing", attemptId, leaseUntil: new Date(Date.now() + 180000), updatedAt: new Date() }
  }, { returnDocument: "after" });
  if (!claimed) {
    const current = await collection.findOne({ _id });
    if (current?.status === "ready") return current;
    throw new HttpError(409, "该文字正在识别或已处理，请刷新列表。");
  }
  try {
    const paymentMethods = settings.paymentMethods.map(method => method.name);
    const parsed = await parseDrafts(claimed.text, {
      credentials, defaultCurrency: settings.defaultCurrency, categories: settings.categories.map(category => category.name),
      paymentMethods, referenceDate: claimed.referenceDate,
      shortcut: claimed.source === "shortcut"
    });
    const drafts = parsed.map(draft => ({ ...draft, pendingInputId: id, pendingDraftId: randomUUID() }));
    const doc = await collection.findOneAndUpdate({ _id, attemptId, status: "processing" }, {
      $set: { status: "ready", drafts, lastError: null, updatedAt: new Date() },
      $unset: { leaseUntil: "", attemptId: "" }
    }, { returnDocument: "after" });
    if (!doc) throw new HttpError(409, "识别状态已变更，请刷新列表。");
    return doc;
  } catch (error) {
    const message = error instanceof Error ? error.message : "识别失败，请稍后重试。";
    await collection.updateOne({ _id, attemptId, status: "processing" }, {
      $set: { status: "pending", lastError: message, updatedAt: new Date() },
      $unset: { leaseUntil: "", attemptId: "" }
    });
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, message);
  }
}
