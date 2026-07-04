import { NextResponse } from "next/server";
import { normalizeCurrencyCode } from "@/lib/currency";
import { getRateToCny } from "@/lib/fx";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
