import { randomUUID, createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "./mongodb";
import { getAuth, authOrigin } from "./auth";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export type AppUser = { id: string; email: string; name: string; role: string };
export type ApiContext = { db: Db; user: AppUser; userId: string; requestId: string };
export function privateRoute(handler: (request: Request, context: ApiContext) => Promise<Response>) {
  return async (request: Request) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    let resolvedContext: ApiContext | undefined;
    const recordFailure = async (status: number) => {
      if (status < 500) return;
      const event = { requestId, route: new URL(request.url).pathname, status, durationMs: Date.now() - startedAt, createdAt: new Date() };
      console.error(JSON.stringify(event));
      if (resolvedContext) await resolvedContext.db.collection("request_events").insertOne({ ...event, userId: resolvedContext.userId }).catch(() => {});
    };
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("origin") !== authOrigin()) throw new HttpError(403, "请求来源无效，请重新打开网站。");
      const auth = await getAuth();
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user || !ObjectId.isValid(session.user.id)) throw new HttpError(401, "请先登录。");
      const db = await getDb();
      // Check the authoritative user on every request; a stale cookie cannot bypass a ban.
      const stored = await db.collection("user").findOne({ _id: new ObjectId(session.user.id) });
      if (!stored || stored.banned) throw new HttpError(403, "账号已停用。");
      const user: AppUser = { id: session.user.id, email: stored.email, name: stored.name || "", role: stored.role || "user" };
      resolvedContext = { db, user, userId: user.id, requestId };
      const response = await handler(request, resolvedContext);
      await recordFailure(response.status);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 500;
      const message = error instanceof HttpError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message || "输入无效。" : "操作失败，请稍后重试。";
      await recordFailure(status);
      return NextResponse.json({ error: message, requestId }, { status, headers: { "Cache-Control": "private, no-store" } });
    }
  };
}
export async function readJson<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, "缺少请求内容。");
  const parts: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 65536) { await reader.cancel(); throw new HttpError(413, "请求内容过长。"); } parts.push(value); }
  let body: unknown; try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new HttpError(400, "请求内容不是有效 JSON。"); }
  return schema.parse(body);
}
export async function rateLimit(db: Db, userId: string, action: string, max: number, seconds = 60) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const _id = createHash("sha256").update(`${userId}:${action}:${bucket}`).digest("hex");
  const result = await db.collection<{ _id: string; count: number; expiresAt: Date }>("usage_limits").findOneAndUpdate({ _id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * seconds * 1000) } }, { upsert: true, returnDocument: "after" });
  if (!result || result.count > max) throw new HttpError(429, "操作较频繁，请稍后重试。");
}
export function objectId(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !ObjectId.isValid(id)) throw new HttpError(400, "无效的记录编号。");
  return new ObjectId(id);
}
export function requireOwner(user: AppUser) { if (user.role !== "owner") throw new HttpError(403, "仅站长可使用此功能。"); }
