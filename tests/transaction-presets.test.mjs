import test from 'node:test';
import assert from 'node:assert/strict';
import { presetToDraft, ledgerToday } from '../src/lib/transactionPresets.ts';
import { transactionPresetSchema } from '../src/lib/transactionPresetSchema.ts';

const preset={name:'上班地铁',type:'expense',amount:12.8,currency:'HKD',category:'交通',paymentMethod:'八达通',merchant:'港铁',tags:['通勤'],note:'上班'};

test('presets retain reusable fields, but never a past date, exchange rate, original text, or record ID',()=>{
 const parsed=transactionPresetSchema.parse({...preset,_id:'old-record',date:'2026-07-01',fxRateToCny:99,amountCny:999,originalText:'昨天地铁'});
 assert.deepEqual(parsed,preset);
 const draft=presetToDraft(parsed,new Date('2026-10-19T17:00:00Z'));
 assert.equal(draft.date,'2026-10-20');
 assert.equal(draft.needsReview,true);
 assert.equal(draft.amount,12.8);
 assert.equal(draft.paymentMethod,'八达通');
 for(const key of ['_id','fxRateToCny','amountCny','originalText'])assert.equal(key in draft,false);
});

test('using or editing a generated draft does not mutate its source preset',()=>{
 const draft=presetToDraft(preset);
 draft.tags.push('测试');draft.amount=99;
 assert.deepEqual(preset.tags,['通勤']);
 assert.equal(preset.amount,12.8);
});

test('each reuse gets its own date and CNY does not carry a stale foreign exchange value',()=>{
 const first=presetToDraft({...preset,currency:'CNY'},new Date('2026-10-20T04:00:00Z'));
 const second=presetToDraft({...preset,currency:'CNY'},new Date('2026-10-21T04:00:00Z'));
 assert.equal(first.date,'2026-10-20');assert.equal(second.date,'2026-10-21');
 assert.equal(second.fxRateToCny,1);assert.equal(second.amountCny,12.8);
 assert.equal(ledgerToday(new Date('2026-10-19T16:01:00Z')),'2026-10-20');
});

test('invalid names and nonpositive amounts are rejected, and currency aliases are normalized',()=>{
 for(const amount of [0,-1,NaN,Infinity])assert.equal(transactionPresetSchema.safeParse({...preset,amount}).success,false);
 assert.equal(transactionPresetSchema.safeParse({...preset,name:'   '}).success,false);
 assert.equal(transactionPresetSchema.parse({...preset,currency:'rmb',name:' 通勤 '}).currency,'CNY');
 assert.equal(transactionPresetSchema.parse({...preset,name:' 通勤 '}).name,'通勤');
});
