import { NextResponse } from "next/server";
import { z } from "zod";
import { parseDrafts } from "@/lib/parseDrafts";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  text: z.string().min(1),
  categories: z.array(z.string()).optional(),
  paymentMethods: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const transactions = await parseDrafts(body.text, {
      categories: body.categories,
      paymentMethods: body.paymentMethods
    });
    return NextResponse.json({ transactions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse text." },
      { status: 400 }
    );
  }
}
