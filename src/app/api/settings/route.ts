import { NextResponse } from "next/server";
import { z } from "zod";
import { privateRoute, readJson, rateLimit, HttpError } from "@/lib/privateApi";
import { getUserSettings } from "@/lib/userData";
import { settingsSchema } from "@/lib/userSettings";
import { ownedCollection } from "@/lib/ownership";

export const GET = privateRoute(async (_request, ctx) => NextResponse.json(await getUserSettings(ctx)));
export const PUT = privateRoute(async (request, ctx) => {
  await rateLimit(ctx.db, ctx.userId, "settings", 60);
  const { settings, version } = await readJson(request, z.object({ settings: settingsSchema, version: z.number().int().min(0) }));
  const collection = ownedCollection(ctx.db, ctx.userId, "user_settings");
  if (version === 0) {
    try { await collection.insertOne({ ...settings, version: 1, createdAt: new Date(), updatedAt: new Date() }); }
    catch (error: any) { if (error.code === 11000) throw new HttpError(409, "另一台设备已经更新设置，请重新载入后保存。"); throw error; }
  } else {
    const result = await collection.updateOne({ version }, { $set: { ...settings, updatedAt: new Date() }, $inc: { version: 1 } });
    if (!result.matchedCount) throw new HttpError(409, "另一台设备已经更新设置，请重新载入后保存。");
  }
  return NextResponse.json(await getUserSettings(ctx));
});
