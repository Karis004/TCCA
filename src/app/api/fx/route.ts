import { privateRoute, readJson, rateLimit, HttpError } from "@/lib/privateApi";
import type { ApiContext } from "@/lib/privateApi";
import { ownedCollection } from "@/lib/ownership";
import { getUserAi, getUserSettings } from "@/lib/userData";
import { NextResponse } from "next/server";
import { normalizeCurrencyCode } from "@/lib/currency";
import { getRateToCny } from "@/lib/fx";

export const dynamic = "force-dynamic";

async function handleGET(request: Request, ctx: ApiContext) {
  try {
    const { searchParams } = new URL(request.url);
    const currency = normalizeCurrencyCode(searchParams.get("currency")) || "CNY";
    const rate = await getRateToCny(currency);

    return NextResponse.json({ currency, rate });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load FX rate." },
      { status: 400 }
    );
  }
}

export const GET = privateRoute(handleGET);
