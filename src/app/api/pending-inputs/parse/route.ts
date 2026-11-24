import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { HttpError, privateRoute } from "@/lib/privateApi";
import { parsePendingInput } from "@/lib/parsePendingInput";
import { serializePending } from "@/lib/pendingInputStore";

export const dynamic = "force-dynamic";

export const POST = privateRoute(async (request, { db, userId }) => {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !ObjectId.isValid(id)) throw new HttpError(400, "无效的暂存编号。");
  return NextResponse.json(serializePending(await parsePendingInput(db, userId, id)));
});
