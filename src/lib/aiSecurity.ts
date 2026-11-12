import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type AiCredentials = { baseUrl: string; apiKey: string; model: string; ownerLegacyOrigin?: string };
export function isPublicAddress(value: string) {
  try { return ipaddr.process(value).range() === "unicast"; } catch { return false; }
}
export function normalizeAiUrl(value: string) {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash) throw new Error("API URL 不能包含用户名、密码、查询参数或片段。");
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("API URL 协议无效。");
  return url.toString().replace(/\/$/, "");
}
export async function resolveAiTarget(value: string, ownerLegacyOrigin?: string, lookup = dns.lookup) {
  const target = new URL(normalizeAiUrl(value));
  const legacy = !!ownerLegacyOrigin && target.origin === ownerLegacyOrigin;
  if (target.protocol !== "https:" && !legacy) throw new Error("API 地址需要使用 HTTPS。");
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  const addresses = ipaddr.isValid(hostname)
    ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === "ipv4" ? 4 : 6 }]
    : await lookup(hostname, { all: true, verbatim: false });
  if (!addresses.length || (!legacy && addresses.some(item => !isPublicAddress(item.address)))) throw new Error("API 地址不能指向本机、内网或保留网络。");
  // Pin the checked address for this connection; a second DNS lookup cannot rebind it.
  return { target, address: addresses.find(item => item.family === 4) || addresses[0] };
}
function encryptionKey() {
  const key = Buffer.from(process.env.AI_CONFIG_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("AI 配置加密密钥未正确设置。");
  return key;
}
export function encryptAiKey(plain: string, userId: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`tcca-ai-v1:${userId}`));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}
export function decryptAiKey(encoded: string, userId: string) {
  const [version, iv, tag, ciphertext] = encoded.split("."); if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("AI 配置无效。");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(`tcca-ai-v1:${userId}`)); decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}
export function redactAiError(message: string, credentials: AiCredentials) {
  return message.split(credentials.apiKey).join("[已隐藏]").replace(/Bearer\s+\S+/gi, "Bearer [已隐藏]").slice(0, 500);
}
