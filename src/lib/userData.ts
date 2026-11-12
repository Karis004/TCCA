import { ObjectId } from "mongodb";
import type { ApiContext } from "./privateApi";
import { HttpError } from "./privateApi";
import { ownedCollection } from "./ownership";
import { defaultSettings, settingsSchema } from "./userSettings";
import { decryptAiKey } from "./aiSecurity";
import type { AiCredentials } from "./aiSecurity";

export async function getUserSettings({ db, userId }: Pick<ApiContext, "db" | "userId">) {
  const doc = await ownedCollection(db, userId, "user_settings").findOne();
  if (!doc) return defaultSettings();
  return { ...settingsSchema.parse(doc), version: Number(doc.version), saved: true };
}
export function ownerLegacyOrigin(role: string) {
  if (role !== "owner" || !process.env.AI_API_BASE_URL) return undefined;
  try { return new URL(process.env.AI_API_BASE_URL).origin; } catch { return undefined; }
}
export async function getUserAi(context: Pick<ApiContext, "db" | "userId" | "user">): Promise<AiCredentials> {
  const doc = await ownedCollection(context.db, context.userId, "user_ai_configs").findOne();
  if (!doc) throw new HttpError(422, "请先在设置中填写自己的 AI 配置；也可以手动录入或暂存文字。");
  return { baseUrl: doc.baseUrl, model: doc.model, apiKey: decryptAiKey(doc.encryptedKey, context.userId), ownerLegacyOrigin: ownerLegacyOrigin(context.user.role) };
}
export function serializeDoc(doc: any) {
  const { userId: _owner, ...rest } = doc;
  return { ...rest, _id: doc._id instanceof ObjectId ? doc._id.toHexString() : doc._id, createdAt: doc.createdAt?.toISOString(), updatedAt: doc.updatedAt?.toISOString() };
}
