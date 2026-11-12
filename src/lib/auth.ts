import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { passkey } from "@better-auth/passkey";
import { getClientPromise } from "./mongodb";

export const SESSION_SECONDS = 365 * 24 * 60 * 60;
let instance: ReturnType<typeof createAuth> | undefined;
export function authOrigin() {
  return new URL(process.env.BETTER_AUTH_URL || "http://localhost:3184").origin;
}
export function getAuth(): ReturnType<typeof createAuth> {
  if (!instance) instance = createAuth().catch(error => { instance = undefined; throw error; });
  return instance!;
}
async function createAuth() {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error("认证配置尚未完成。");
  const client = await getClientPromise();
  const db = client.db(process.env.MONGODB_DB || "ai_ledger");
  const origin = authOrigin();
  // Build uniqueness guards before accepting the first concurrent registration.
  await Promise.all([
    db.collection("user").createIndex({ email: 1 }, { unique: true, name: "user_email_uidx" }),
    db.collection("session").createIndex({ token: 1 }, { unique: true, name: "session_token_uidx" }),
    db.collection("account").createIndex({ providerId: 1, accountId: 1 }, { unique: true, name: "tcca_provider_subject_unique" }),
    db.collection("passkey").createIndex({ credentialID: 1 }, { unique: true, name: "passkey_credentialID_uidx" })
  ]);
  return betterAuth({
    appName: "TCCA", baseURL: origin, secret: process.env.BETTER_AUTH_SECRET,
    database: mongodbAdapter(db, { client }),
    trustedOrigins: [origin],
    socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    session: { expiresIn: SESSION_SECONDS, updateAge: 24 * 60 * 60, cookieCache: { enabled: false } },
    user: { additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
      banned: { type: "boolean", required: false, defaultValue: false, input: false }
    } },
    databaseHooks: {
      user: { create: { before: async (user) => {
        const owner = user.emailVerified && !!process.env.OWNER_GOOGLE_EMAIL && user.email.toLowerCase() === process.env.OWNER_GOOGLE_EMAIL.toLowerCase();
        if (process.env.ALLOW_NEW_USERS === "false" && !owner) throw new APIError("FORBIDDEN", { message: "暂时未开放新用户注册。" });
        return { data: { ...user, role: owner ? "owner" : "user", banned: false } };
      } } },
      session: { create: { before: async (session) => {
        const { ObjectId } = await import("mongodb");
        const user = await db.collection("user").findOne({ _id: new ObjectId(session.userId) });
        if (!user || user.banned) throw new APIError("FORBIDDEN", { message: "账号已停用。" });
      } } }
    },
    plugins: [passkey({ rpID: new URL(origin).hostname, rpName: "TCCA", origin, authenticatorSelection: { userVerification: "required" } })],
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    advanced: { useSecureCookies: origin.startsWith("https:"), defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:") } },
    logger: { level: "error" }
  });
}
