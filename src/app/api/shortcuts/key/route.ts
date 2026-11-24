import { NextResponse } from "next/server";
import { privateRoute, rateLimit } from "@/lib/privateApi";
import { createShortcutKey, getShortcutConfiguration, shortcutKeys } from "@/lib/shortcutKey";
import { encryptAiKey } from "@/lib/aiSecurity";

export const dynamic = "force-dynamic";

export const GET = privateRoute(async (_request, { db, userId }) => {
  return NextResponse.json(await getShortcutConfiguration(db, userId));
});

export const POST = privateRoute(async (_request, { db, userId }) => {
  await rateLimit(db, userId, "shortcut-key", 10);
  const { token, digest } = createShortcutKey(userId);
  await shortcutKeys(db).updateOne({ _id: userId }, { $set: { digest, encryptedToken: encryptAiKey(token, userId), createdAt: new Date() } }, { upsert: true });
  return NextResponse.json({ configured: true, token }, { status: 201 });
});

export const DELETE = privateRoute(async (_request, { db, userId }) => {
  await shortcutKeys(db).deleteOne({ _id: userId });
  return NextResponse.json({ configured: false });
});
