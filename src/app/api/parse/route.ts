import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCurrency } from "@/lib/currency";
import { parseLedgerText } from "@/lib/aiClient";
import { getRateToCny } from "@/lib/fx";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  text: z.string().min(1),
  categories: z.array(z.string()).optional(),
  paymentMethods: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = requestSchema.parse(await request.json());
    const parsed = await parseLedgerText(body.text, {
      categories: body.categories,
      paymentMethods: body.paymentMethods
    });
    const parseDurationMs = Date.now() - startedAt;
    const transactions = await Promise.all(
      parsed.map(async (item) => {
        const currency = resolveCurrency(item.currency, body.text);
        const fxRateToCny = await getRateToCny(currency);
        const amount = item.amount || 0;

        return {
          ...item,
          currency,
          amount,
          amountCny: Number((amount * fxRateToCny).toFixed(2)),
          fxRateToCny,
          parseDurationMs,
          originalText: body.text
        };
      })
    );

    return NextResponse.json({ transactions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse text." },
      { status: 400 }
    );
  }
}
