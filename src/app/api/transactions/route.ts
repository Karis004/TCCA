import { getRecentDates } from "@/lib/analytics";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeCurrencyCode } from "@/lib/currency";
import { getRateToCny } from "@/lib/fx";
import { ownedCollection } from "@/lib/ownership";
import { privateRoute, readJson, objectId, HttpError, rateLimit } from "@/lib/privateApi";
import { finishPendingDraft } from "@/lib/pendingInputStore";
import { serializeDoc } from "@/lib/userData";
import type { PendingDoc } from "@/lib/pendingInputStore";
export const dynamic = "force-dynamic";
const transactionSchema = z.object({
 type:z.enum(["expense","income","transfer","refund"]), amount:z.coerce.number().positive().max(1e12), currency:z.string().min(3).max(3).regex(/^[A-Za-z]{3}$/),
 date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+"T00:00:00Z");return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===v},"日期无效。"),
 category:z.string().trim().min(1).max(100),paymentMethod:z.string().trim().min(1).max(100),merchant:z.string().max(200).nullable().optional(),
 tags:z.array(z.string().max(100)).max(30).default([]),note:z.string().max(4000).nullable().optional(),originalText:z.string().max(12000).nullable().optional(),
 pendingInputId:z.string().regex(/^[a-f0-9]{24}$/i).optional(),pendingDraftId:z.string().uuid().optional()
}).refine(v=>!!v.pendingInputId===!!v.pendingDraftId,"暂存来源无效。");
export const GET=privateRoute(async(request,ctx)=>{
 const params=new URL(request.url).searchParams;
 const search = z.object({ category:z.string().max(100).optional(), paymentMethod:z.string().max(100).optional(), q:z.string().trim().max(100).optional(), range:z.enum(["year","half","all"]).optional() }).parse(Object.fromEntries(params));
 const filters:any[]=[];
 if(search.category) filters.push({category:search.category});
 if(search.paymentMethod) filters.push({paymentMethod:search.paymentMethod});
 if(search.q) {
   const literal=search.q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
   filters.push({$or:[{note:{$regex:literal,$options:"i"}},{merchant:{$regex:literal,$options:"i"}}]});
 }
 if(search.range && search.range!=="all") {
   const {start,end}=getRecentDates(search.range==="year"?365:183);
   filters.push({date:{$gte:start,$lte:end}});
 }
 if(params.get("options")==="1") {
   const collection=ownedCollection(ctx.db,ctx.userId,"transactions");
   const filter=filters.length?{$and:filters}:{};
   const [categories,paymentMethods]=await Promise.all([collection.distinct("category",filter),collection.distinct("paymentMethod",filter)]);
   return NextResponse.json({categories,paymentMethods});
 }
 let filter:any={};
 if(params.get("cursor")){
  let cursor:any;try{cursor=z.object({date:z.string(),createdAt:z.string().datetime(),id:z.string().regex(/^[a-f0-9]{24}$/i)}).parse(JSON.parse(Buffer.from(params.get("cursor")!,"base64url").toString()))}catch{throw new HttpError(400,"分页参数无效。")}
  filter={$or:[{date:{$lt:cursor.date}},{date:cursor.date,createdAt:{$lt:new Date(cursor.createdAt)}},{date:cursor.date,createdAt:new Date(cursor.createdAt),_id:{$lt:new ObjectId(cursor.id)}}]};
 }
 if(Object.keys(filter).length) filters.push(filter);
 filter=filters.length?{$and:filters}:{};
 const docs=await ownedCollection(ctx.db,ctx.userId,"transactions").find(filter).sort({date:-1,createdAt:-1,_id:-1}).limit(101).toArray();
 const page=docs.slice(0,100);const last=page.at(-1);
 const next=docs.length>100&&last?Buffer.from(JSON.stringify({date:last.date,createdAt:last.createdAt.toISOString(),id:last._id.toString()})).toString("base64url"):"";
 return NextResponse.json(page.map(serializeDoc),{headers:{"X-Next-Cursor":next}});
});
export const POST=privateRoute(async(request,ctx)=>{
 await rateLimit(ctx.db,ctx.userId,"save-transaction",120);
 const {pendingInputId,pendingDraftId,...payload}=await readJson(request,transactionSchema);
 const collection=ownedCollection(ctx.db,ctx.userId,"transactions");
 const sourceId=pendingInputId&&pendingDraftId?new ObjectId(createHash("sha256").update("pending:"+ctx.userId+":"+pendingInputId+":"+pendingDraftId).digest("hex").slice(0,24)):null;
 if(sourceId){const existing=await collection.findOne({_id:sourceId});if(existing){await finishPendingDraft(pendingInputId!,pendingDraftId!,ctx.userId);return NextResponse.json(serializeDoc(existing));}
 const source=await ownedCollection<PendingDoc>(ctx.db,ctx.userId,"pending_inputs").findOne({_id:new ObjectId(pendingInputId!),status:"ready","drafts.pendingDraftId":pendingDraftId});
 if(!source)throw new HttpError(409,"这张暂存账单已处理或已删除，请刷新列表。");}
 if(await collection.countDocuments()>=50000)throw new HttpError(413,"账单数量已达到当前账户上限，请联系站长。");
 const currency=normalizeCurrencyCode(payload.currency)!;const fxRateToCny=await getRateToCny(currency);const now=new Date();
 const doc={...payload,currency,amountCny:Number((payload.amount*fxRateToCny).toFixed(2)),fxRateToCny,createdAt:now,updatedAt:now};
 if(sourceId){try{await collection.insertOne({...doc,_id:sourceId});}catch(e:any){if(e.code!==11000)throw e;}
 const saved=await collection.findOne({_id:sourceId});if(!saved)throw new HttpError(409,"该账单已处理。");
 await finishPendingDraft(pendingInputId!,pendingDraftId!,ctx.userId);return NextResponse.json(serializeDoc(saved),{status:201});}
 const result=await collection.insertOne(doc);return NextResponse.json(serializeDoc({...doc,_id:result.insertedId}),{status:201});
});
export const PUT=privateRoute(async(request,ctx)=>{
 const _id=objectId(request);await rateLimit(ctx.db,ctx.userId,"edit-transaction",120);
 const collection=ownedCollection(ctx.db,ctx.userId,"transactions");if(!await collection.findOne({_id}))throw new HttpError(404,"找不到这笔账单。");
 const {pendingInputId:_source,pendingDraftId:_draft,...payload}=await readJson(request,transactionSchema);
 const currency=normalizeCurrencyCode(payload.currency)!;const fxRateToCny=await getRateToCny(currency);
 const saved=await collection.findOneAndUpdate({_id},{$set:{...payload,currency,fxRateToCny,amountCny:Number((payload.amount*fxRateToCny).toFixed(2)),updatedAt:new Date()}},{returnDocument:"after"});
 if(!saved)throw new HttpError(404,"找不到这笔账单。");return NextResponse.json(serializeDoc(saved));
});
export const DELETE=privateRoute(async(request,ctx)=>{
 await rateLimit(ctx.db,ctx.userId,"delete-transaction",120);const result=await ownedCollection(ctx.db,ctx.userId,"transactions").deleteOne({_id:objectId(request)});
 if(!result.deletedCount)throw new HttpError(404,"找不到这笔账单。");return NextResponse.json({ok:true});
});
