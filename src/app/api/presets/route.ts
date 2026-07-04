import { NextResponse } from "next/server";
import { categories, currencies, paymentMethods } from "@/presets/ledger";

export async function GET() {
  return NextResponse.json({
    categories,
    currencies,
    paymentMethods
  });
}
