import type { Db } from "mongodb";
import { getDb } from "./mongodb";
import { getRateToCny } from "./fx";
import { calculateMilestones, milestoneDay } from "./milestoneRules";

const pending = new Map<string,Promise<void>>();
export function refreshMilestones(db: Db, userId: string): Promise<void> {
  const previous = pending.get(userId) ?? Promise.resolve();
  const job = previous.catch(()=>{}).then(async () => {
    const docs = await db.collection("transactions").find({userId,deletedAt:{$exists:false}}, {projection:{type:1,category:1,amount:1,currency:1,amountCny:1,createdAt:1,updatedAt:1}}).sort({createdAt:1}).toArray();
    const saved = await db.collection("milestone_summaries").findOne({userId},{projection:{hkdRate:1}});
    const hkdRate = saved?.hkdRate || docs.findLast(doc=>doc.currency==="HKD" && doc.amount)?.amountCny / docs.findLast(doc=>doc.currency==="HKD" && doc.amount)?.amount || (docs.length ? await getRateToCny("HKD") : 1);
    const rows = docs.map(doc=>({createdAt:new Date(doc.createdAt ?? doc._id.getTimestamp()).toISOString(),type:doc.type,category:doc.category || "",amountHkd:doc.currency==="HKD" ? doc.amount : doc.amountCny/hkdRate}));
    await db.collection("milestone_summaries").updateOne({userId},{$set:{cards:calculateMilestones(rows),hkdRate,computedAt:new Date(),day:milestoneDay(new Date()),count:docs.length,latest:docs.reduce((max,doc)=>Math.max(max,+new Date(doc.updatedAt ?? doc.createdAt)),0)}},{upsert:true});
  }).finally(()=>{if(pending.get(userId)===job)pending.delete(userId);});
  pending.set(userId,job); return job;
}

// The same idempotent pass bootstraps old ledgers and maintains calendar milestones.
export async function syncMilestones() {
  const db=await getDb();
  const users=await db.collection("transactions").distinct("userId",{deletedAt:{$exists:false}});
  for (const userId of users.filter((id): id is string=>typeof id==="string")) {
    const [saved,count,last]=await Promise.all([
      db.collection("milestone_summaries").findOne({userId}),
      db.collection("transactions").countDocuments({userId,deletedAt:{$exists:false}}),
      db.collection("transactions").find({userId,deletedAt:{$exists:false}}).sort({updatedAt:-1}).limit(1).next()
    ]);
    if(!saved || saved.day!==milestoneDay(new Date()) || saved.count!==count || saved.latest!==+new Date(last?.updatedAt ?? last?.createdAt)) await refreshMilestones(db,userId);
  }
}
export function startMilestoneWorker() {
  const state=globalThis as typeof globalThis & { milestoneTimer?: ReturnType<typeof setInterval> };
  if(state.milestoneTimer)return;
  let busy=false;
  const run=async()=>{if(busy)return;busy=true;try{await syncMilestones();}catch{console.error("Milestone background sync failed");}finally{busy=false;}};
  state.milestoneTimer=setInterval(()=>{void run();},60000);state.milestoneTimer.unref();void run();
}
