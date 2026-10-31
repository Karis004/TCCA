import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalyticsCache,analyticsQueryKey,analyticsQueryUrl} from '../src/lib/analyticsCache.ts';

const query={month:'2026-10',currency:'HKD',excludedCategories:[]};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

test('prefetched results and simultaneous consumers share a single request',async()=>{
  let calls=0;const pending=deferred();const cache=createAnalyticsCache(()=>{calls++;return pending.promise;});
  const first=cache.load(query);const second=cache.load(query);assert.equal(first,second);
  assert.equal(cache.getSnapshot(query).loading,true);
  await Promise.resolve();assert.equal(calls,1);
  pending.resolve({totalExpense:30});await first;
  assert.equal(cache.getSnapshot(query).data.totalExpense,30);assert.equal(cache.getSnapshot(query).loading,false);
  await cache.load(query);assert.equal(calls,1);
});

test('month, currency and category sets are independent cache keys while reordered sets reuse results',async()=>{
  let calls=0;const cache=createAnalyticsCache(async()=>({id:++calls}));
  await cache.load(query);await cache.load({...query,month:'all'});await cache.load({...query,currency:'CNY'});
  await cache.load({...query,excludedCategories:['住房','工资']});
  await cache.load({...query,excludedCategories:[' 工资 ','住房','住房']});
  assert.equal(calls,4);assert.equal(cache.getSnapshot(query).data.id,1);
  assert.equal(analyticsQueryKey({...query,excludedCategories:['住房','工资']}),analyticsQueryKey({...query,excludedCategories:['工资','住房']}));
  const params=new URL(analyticsQueryUrl({...query,excludedCategories:['住房 & 水电','工资']}),'http://local').searchParams;
  assert.deepEqual(new Set(params.getAll('excludeCategory')),new Set(['住房 & 水电','工资']));
});

test('ledger invalidation marks every cached view stale, including partial batch changes',async()=>{
  let calls=0;const cache=createAnalyticsCache(async()=>({id:++calls}));
  const alternate={...query,currency:'CNY'};
  await cache.load(query);await cache.load(alternate);cache.invalidate();
  assert.equal(cache.getSnapshot(query).data.id,1);
  await cache.load(query);assert.equal(calls,3);assert.equal(cache.getSnapshot(query).data.id,3);
  await cache.load(alternate);assert.equal(calls,4);
});

test('an older request cannot overwrite results fetched after a ledger change',async()=>{
  const old=deferred();const fresh=deferred();let calls=0;
  const cache=createAnalyticsCache(()=>++calls===1?old.promise:fresh.promise);
  const original=cache.load(query);await Promise.resolve();cache.invalidate();
  const updated=cache.load(query);await Promise.resolve();
  fresh.resolve({totalExpense:80});await updated;
  old.resolve({totalExpense:30});await original;
  assert.equal(cache.getSnapshot(query).data.totalExpense,80);assert.equal(cache.getSnapshot(query).loading,false);
});

test('a stale failed request cannot clear the loading state of a newer request',async()=>{
  const old=deferred();const fresh=deferred();let calls=0;
  const cache=createAnalyticsCache(()=>++calls===1?old.promise:fresh.promise);
  const original=cache.load(query);await Promise.resolve();cache.invalidate();
  const updated=cache.load(query);await Promise.resolve();
  old.reject(new Error('old failure'));await original;
  assert.equal(cache.getSnapshot(query).loading,true);assert.equal(cache.getSnapshot(query).error,'');
  fresh.resolve({totalExpense:80});await updated;assert.equal(cache.getSnapshot(query).data.totalExpense,80);
});

test('background refresh retains existing data on failure and can be explicitly retried',async()=>{
  let calls=0;const cache=createAnalyticsCache(async()=>{calls++;if(calls===2)throw new Error('network down');return{id:calls};});
  await cache.load(query);await cache.load(query,true);
  assert.equal(cache.getSnapshot(query).data.id,1);assert.equal(cache.getSnapshot(query).error,'network down');
  await cache.load(query,true);assert.equal(cache.getSnapshot(query).data.id,3);assert.equal(cache.getSnapshot(query).error,'');
});

test('focus revalidation only fetches after the freshness window expires',async()=>{
  let time=1000,calls=0;const cache=createAnalyticsCache(async()=>({id:++calls}),()=>time,300000);
  await cache.load(query);time+=299999;await cache.load(query);assert.equal(calls,1);
  time++;await cache.load(query);assert.equal(calls,2);
});
