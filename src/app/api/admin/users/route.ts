import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { privateRoute, readJson, requireOwner, HttpError, rateLimit } from "@/lib/privateApi";

export const GET = privateRoute(async (_request, ctx) => {
  requireOwner(ctx.user);
  const users = await ctx.db.collection("user").find({}, { projection: { email: 1, name: 1, role: 1, banned: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(100).toArray();
  const data = await Promise.all(users.map(async user => {
    const userId = user._id.toString(); const counts: Record<string, number> = {};
    for (const name of ["transactions", "transaction_presets", "pending_inputs"]) counts[name] = await ctx.db.collection(name).countDocuments({ userId, deletedAt: { $exists: false } });
    const errors = await ctx.db.collection("request_events").countDocuments({ userId, createdAt: { $gte: new Date(Date.now() - 7 * 86400000) }, status: { $gte: 500 } });
    return { id: userId, email: user.email, name: user.name, role: user.role || "user", banned: !!user.banned, createdAt: user.createdAt, counts, recentErrors: errors };
  }));
  return NextResponse.json({ users: data, registrationsOpen: process.env.ALLOW_NEW_USERS !== "false" });
});
export const POST = privateRoute(async (request, ctx) => {
  requireOwner(ctx.user); await rateLimit(ctx.db, ctx.userId, "admin", 30);
  const { userId, action, confirmation } = await readJson(request, z.object({ userId: z.string().regex(/^[a-f0-9]{24}$/i), action: z.enum(["ban", "unban", "clear", "restore", "purge"]), confirmation: z.string().optional() }));
  const target = await ctx.db.collection("user").findOne({ _id: new ObjectId(userId) });
  if (!target) throw new HttpError(404, "找不到该用户。");
  if (userId === ctx.userId || target.role === "owner") throw new HttpError(400, "不能对站长账号执行此操作。");
  if (action === "ban" || action === "unban") {
    await ctx.db.collection("user").updateOne({ _id: target._id }, { $set: { banned: action === "ban", updatedAt: new Date() } });
    if (action === "ban") await ctx.db.collection("session").deleteMany({ userId: new ObjectId(userId) });
  } else {
    if (!target.banned) throw new HttpError(409, "请先停用该用户，再处理其数据。");
    if (confirmation !== target.email) throw new HttpError(400, "请完整输入目标用户邮箱确认。");
    // Soft deletion allows recovery; no financial content is returned to the administrator.
    for (const name of ["transactions", "transaction_presets", "pending_inputs"]) {
      const col = ctx.db.collection(name);
      if (action === "clear") await col.updateMany({ userId, deletedAt: { $exists: false } }, { $set: { deletedAt: new Date() } });
      else if (action === "restore") await col.updateMany({ userId, deletedAt: { $exists: true } }, { $unset: { deletedAt: "" } });
      else await col.deleteMany({ userId, deletedAt: { $exists: true } });
    }
  }
  await ctx.db.collection("admin_events").insertOne({ actorId: ctx.userId, targetId: userId, action, createdAt: new Date() });
  return NextResponse.json({ ok: true });
});
