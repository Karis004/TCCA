import { NextResponse } from "next/server";
import { privateRoute } from "@/lib/privateApi";
export const GET = privateRoute(async (_request, { user }) => NextResponse.json(user));
