import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateMilestones,milestoneDay} from '../src/lib/milestoneRules.ts';
const row=(time,type='expense',amount=10,category='餐饮')=>({createdAt:time,type,category,amountHkd:amount});
test('historical data uses original threshold dates and has stable IDs',()=>{
 const rows=Array.from({length:100},(_,i)=>row(new Date(Date.UTC(2025,0,i+1)).toISOString()));
 const result=calculateMilestones(rows,new Date('2026-11-26'));
 assert.equal(result.find(c=>c.id==='active-100').date,'2025-04-10');
 assert.equal(result.find(c=>c.id==='elapsed-1y').date,'2026-01-01');
 assert.deepEqual(result,calculateMilestones(rows,new Date('2026-11-26')));
});
test('recurring tiers reuse final design without losing their actual count',()=>{
 const rows=Array.from({length:501},(_,i)=>row(new Date(Date.UTC(2024,0,i+1)).toISOString()));
 const result=calculateMilestones(rows,new Date('2026-11-26'));
 assert.equal(result.find(c=>c.id==='active-500').template,'active-300');
 assert.equal(result.find(c=>c.id==='active-500').value,'500');
});
test('large single payment awards highest crossed tier without enumerating millions of cards',()=>{
 const result=calculateMilestones([row('2026-11-25T00:00:00Z','expense',1e12)]);
 assert.equal(result.filter(c=>c.id.startsWith('expense-')).length,1);
});
test('batch tiers upgrade per month and income is qualified within this ledger',()=>{
 const rows=Array.from({length:20},(_,i)=>row(new Date(Date.UTC(2026,10,25,0,i)).toISOString(),'income',10000,'工资'));
 const result=calculateMilestones(rows,new Date('2026-11-26'));
 assert.equal(result.filter(c=>c.id.startsWith('batch-')).length,1);
 assert.ok(result.some(c=>c.template==='batch-20'));
 assert.equal(result.find(c=>c.id==='first-salary').title,'在这里记下第一笔工资');
});
test('Hong Kong day boundaries and fourteen complete inactive days',()=>{
 assert.equal(milestoneDay(new Date('2026-11-25T16:00:00Z')),'2026-11-26');
 assert.ok(!calculateMilestones([row('2026-11-01T00:00:00Z'),row('2026-11-15T00:00:00Z')]).some(c=>c.id.startsWith('return-')));
 assert.ok(calculateMilestones([row('2026-11-01T00:00:00Z'),row('2026-11-16T00:00:00Z')]).some(c=>c.id.startsWith('return-')));
});
test('empty ledger and leap-day anniversary',()=>{
 assert.deepEqual(calculateMilestones([]),[]);
 assert.equal(calculateMilestones([row('2024-02-29T00:00:00Z')],new Date('2025-03-01')).find(c=>c.id==='elapsed-1y').date,'2025-02-28');
});
test('fractional amounts cross the exact monetary threshold in cents',()=>{
 const rows=[row('2026-11-01T00:00:00Z','expense',4999.7),row('2026-11-01T00:01:00Z','expense',0.1),row('2026-11-01T00:02:00Z','expense',0.2)];
 assert.ok(calculateMilestones(rows).some(c=>c.id==='expense-5000'));
});
