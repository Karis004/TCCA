import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeCurrencyCode } from "@/lib/currency";
import { getRateToCny } from "@/lib/fx";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

const transactionSchema = z.object({
  type: z.enum(["expense", "income", "transfer", "refund"]),
  amount: z.coerce.number().positive(),
  currency: z.string().min(2),
  date: z.string().min(8),
  category: z.string().min(1),
  paymentMethod: z.string().min(1),
  merchant: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  note: z.string().nullable().optional(),
  originalText: z.string().nullable().optional()
});

function serialize(doc: any) {
  return {
    ...doc,
    _id: doc._id.toString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}

export async function GET() {
  const db = await getDb();
  const docs = await db.collection("transactions").find().sort({ date: -1, createdAt: -1 }).limit(300).toArray();
  return NextResponse.json(docs.map(serialize));
}

export async function POST(request: Request) {
  try {
    const payload = transactionSchema.parse(await request.json());
    const currency = normalizeCurrencyCode(payload.currency) || "CNY";
    const fxRateToCny = await getRateToCny(currency);
    const now = new Date();
    const doc = {
      ...payload,
      currency,
      amountCny: Number((payload.amount * fxRateToCny).toFixed(2)),
      fxRateToCny,
      createdAt: now,
      updatedAt: now
    };

    const db = await getDb();
    const result = await db.collection("transactions").insertOne(doc);
    return NextResponse.json(serialize({ ...doc, _id: result.insertedId }), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save transaction." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const payload = transactionSchema.parse(await request.json());
    const currency = normalizeCurrencyCode(payload.currency) || "CNY";
    const fxRateToCny = await getRateToCny(currency);
    const now = new Date();
    const update = {
      ...payload,
      currency,
      amountCny: Number((payload.amount * fxRateToCny).toFixed(2)),
      fxRateToCny,
      updatedAt: now
    };

    const db = await getDb();
    const _id = new ObjectId(id);
    const result = await db.collection("transactions").updateOne({ _id }, { $set: update });

    if (!result.matchedCount) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    const doc = await db.collection("transactions").findOne({ _id });
    return NextResponse.json(serialize(doc));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update transaction." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("transactions").deleteOne({ _id: new ObjectId(id) });
  return NextResponse.json({ ok: true });
}
