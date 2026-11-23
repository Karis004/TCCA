import { NextResponse } from "next/server";
import { privateRoute } from "@/lib/privateApi";
import { getUserSettings } from "@/lib/userData";

export const GET = privateRoute(async (request, context) => {
  if (new URL(request.url).searchParams.get("settings") !== "1") return NextResponse.json(context.user);
  return NextResponse.json({ user: context.user, settings: await getUserSettings(context) });
});
