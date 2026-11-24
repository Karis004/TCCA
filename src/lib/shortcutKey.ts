import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { decryptAiKey } from "./aiSecurity";

export function shortcutKeys(db: Db) {
  return db.collection<{ _id: string; digest: string; encryptedToken?: string; createdAt: Date }>("shortcut_keys");
}

export async function getShortcutConfiguration(db: Db, userId: string) {
  const key = await shortcutKeys(db).findOne({ _id: userId });
  return { configured: Boolean(key), token: key?.encryptedToken ? decryptAiKey(key.encryptedToken, userId) : "" };
}

export function shortcutDigest(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function createShortcutKey(userId: string) {
  const secret = randomBytes(32).toString("base64url");
  return { token: `tcca_sc_${userId}.${secret}`, digest: shortcutDigest(secret) };
}

export function readShortcutKey(header: string | null) {
  const match = /^Bearer tcca_sc_([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/i.exec(header ?? "");
  return match ? { userId: match[1].toLowerCase(), digest: shortcutDigest(match[2]) } : null;
}
