import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authOrigin } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { createPendingInput } from "@/lib/pendingInputStore";
import { parsePendingInput } from "@/lib/parsePendingInput";
import { HttpError, readJson } from "@/lib/privateApi";
import { shortcutInputSchema } from "@/lib/pendingInputs";
import { readShortcutKey, shortcutKeys } from "@/lib/shortcutKey";
import { ledgerToday } from "@/lib/transactionPresets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const key = readShortcutKey(request.headers.get("authorization"));
    if (!key) throw new HttpError(401, "请提供有效的快捷指令密钥。");
    const payload = await readJson(request, shortcutInputSchema);
    const db = await getDb();
    const [credential, user] = await Promise.all([
      shortcutKeys(db).findOne({ _id: key.userId, digest: key.digest }, { projection: { _id: 1 } }),
      db.collection("user").findOne({ _id: new ObjectId(key.userId), banned: { $ne: true } }, { projection: { _id: 1 } })
    ]);
    if (!user || !credential) throw new HttpError(401, "快捷指令密钥无效或已停用。");
    const input = await createPendingInput(db, key.userId, {
      text: payload.text,
      referenceDate: ledgerToday(),
      source: "shortcut"
    });
    const id = input._id.toHexString();
    await parsePendingInput(db, key.userId, id);
    return NextResponse.json({ id, status: "ready", openUrl: `${authOrigin()}/#shortcut=${id}` }, { status: 201, headers });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "请求内容无效。" }, { status: 400, headers });
    console.error("Could not recognize a TCCA shortcut receipt.");
    return NextResponse.json({ error: "识别失败，请稍后重试。" }, { status: 500, headers });
  }
}
