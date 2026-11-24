import { NextResponse } from "next/server";
import { privateRoute, rateLimit } from "@/lib/privateApi";
import { createShortcutKey, shortcutKeys } from "@/lib/shortcutKey";

export const dynamic = "force-dynamic";

export const GET = privateRoute(async (_request, { db, userId }) => {
  const key = await shortcutKeys(db).findOne({ _id: userId }, { projection: { _id: 1 } });
  return NextResponse.json({ configured: Boolean(key) });
});

export const POST = privateRoute(async (_request, { db, userId }) => {
  await rateLimit(db, userId, "shortcut-key", 10);
  const { token, digest } = createShortcutKey(userId);
  await shortcutKeys(db).updateOne({ _id: userId }, { $set: { digest, createdAt: new Date() } }, { upsert: true });
  return NextResponse.json({ configured: true, token }, { status: 201 });
});

export const DELETE = privateRoute(async (_request, { db, userId }) => {
  await shortcutKeys(db).deleteOne({ _id: userId });
  return NextResponse.json({ configured: false });
});
