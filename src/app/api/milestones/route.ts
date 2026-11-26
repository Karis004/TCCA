import { NextResponse } from "next/server";
import { privateRoute } from "@/lib/privateApi";
export const dynamic="force-dynamic";
export const GET=privateRoute(async(_request,ctx)=>{
  const summary=await ctx.db.collection("milestone_summaries").findOne({userId:ctx.userId},{projection:{cards:1}});
  return NextResponse.json(summary?.cards ?? []);
});
