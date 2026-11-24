import { ObjectId } from "mongodb";
import type { ApiContext } from "./privateApi";
import { HttpError } from "./privateApi";
import { ownedCollection } from "./ownership";
import { defaultSettings, settingsSchema } from "./userSettings";
import { configuredAiOrigin, decryptAiKey } from "./aiSecurity";
import type { AiCredentials } from "./aiSecurity";
import type { UserSettings } from "./userSettings";

export function validateLedgerChoices(settings: UserSettings, proposed: { category: string; paymentMethod: string }, existing?: { category?: string; paymentMethod?: string }) {
  if (proposed.category !== existing?.category && !settings.categories.some(item => item.name === proposed.category)) {
    throw new HttpError(400, "请从已有分类中选择。");
  }
  if (proposed.paymentMethod !== existing?.paymentMethod && !settings.paymentMethods.some(item => item.name === proposed.paymentMethod)) {
    throw new HttpError(400, "请从已有支付方式中选择。");
  }
}

export async function getUserSettings({ db, userId }: Pick<ApiContext, "db" | "userId">) {
  const doc = await ownedCollection(db, userId, "user_settings").findOne();
  if (!doc) return defaultSettings();
  return { ...settingsSchema.parse(doc), version: Number(doc.version), saved: true };
}
export async function getUserAi(context: Pick<ApiContext, "db" | "userId">): Promise<AiCredentials> {
  const doc = await ownedCollection(context.db, context.userId, "user_ai_configs").findOne();
  if (!doc) throw new HttpError(422, "请先在设置中填写自己的 AI 配置；也可以手动录入或暂存文字。");
  return { baseUrl: doc.baseUrl, model: doc.model, apiKey: decryptAiKey(doc.encryptedKey, context.userId), trustedOrigin: configuredAiOrigin() };
}
export function serializeDoc(doc: any) {
  const { userId: _owner, ...rest } = doc;
  return { ...rest, _id: doc._id instanceof ObjectId ? doc._id.toHexString() : doc._id, createdAt: doc.createdAt?.toISOString(), updatedAt: doc.updatedAt?.toISOString() };
}
