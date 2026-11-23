import { NextResponse } from "next/server";
import { z } from "zod";
import { parseDrafts } from "@/lib/parseDrafts";
import { privateRoute,readJson,rateLimit,HttpError } from "@/lib/privateApi";
import { getUserAi,getUserSettings } from "@/lib/userData";
export const dynamic="force-dynamic";
export const POST=privateRoute(async(request,ctx)=>{
 const {text}=await readJson(request,z.object({text:z.string().trim().min(1).max(12000)}));
 const limits = rateLimit(ctx.db,ctx.userId,"ai-minute",10).then(() => rateLimit(ctx.db,ctx.userId,"ai-day",200,86400));
 const [, settings, credentials] = await Promise.all([limits, getUserSettings(ctx), getUserAi(ctx)]);
 try {
   const transactions = await parseDrafts(text, { credentials, defaultCurrency: settings.defaultCurrency, categories: settings.categories.map(c=>c.name), paymentMethods: settings.paymentMethods.map(p=>p.name) });
   return NextResponse.json({ transactions }, { headers: { "Server-Timing": `model;dur=${transactions[0].parseDurationMs}` } });
 }
 catch(e){throw new HttpError(502,e instanceof Error?e.message:"识别失败。");}
});
