import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyDrafts,changeDraft} from '../src/lib/draftState.ts';

const draft={type:'expense',amount:10,currency:'HKD',date:'2026-11-03',category:'餐饮',paymentMethod:'现金',merchant:null,tags:[],note:null,confidence:1,needsReview:true};
const create=(count)=>{let id=0;return identifyDrafts(Array.from({length:count},()=>({...draft})),()=>`draft-${++id}`);};

test('identical recognized bills get stable distinct IDs before submission',()=>{
  const items=create(5);
  assert.equal(new Set(items.map(item=>item.localDraftId)).size,5);
  assert.deepEqual(identifyDrafts(items),items);
  assert.equal(identifyDrafts(items)[0],items[0]);
  assert.equal(draft.localDraftId,undefined);
});

test('five successful submissions leave no draft, even when stale FX callbacks arrive afterwards',()=>{
  const batch=create(5);let current=batch;
  for(const submitted of batch){
    current=changeDraft(current,submitted.localDraftId,null);
    current=changeDraft(current,submitted.localDraftId,{...submitted,amountCny:8.5});
  }
  assert.deepEqual(current,[]);
  const empty=current;
  assert.equal(changeDraft(current,batch[4].localDraftId,batch[4]),empty);
});

test('late callbacks for a removed first bill cannot overwrite the bill that moves into its place',()=>{
  const [first,second]=create(2);
  const remaining=changeDraft([first,second],first.localDraftId,null);
  assert.deepEqual(changeDraft(remaining,first.localDraftId,{...first,amount:999}),[second]);
  assert.equal(changeDraft(remaining,second.localDraftId,{...second,amount:20})[0].amount,20);
});

test('partial batch success only removes confirmed bills, retaining failed and unattempted bills and edits',()=>{
  const batch=create(5);
  let current=changeDraft(batch,batch[0].localDraftId,null);
  current=changeDraft(current,batch[1].localDraftId,null);
  current=changeDraft(current,batch[3].localDraftId,{...batch[3],note:'保留修改'});
  assert.deepEqual(current.map(item=>item.localDraftId),['draft-3','draft-4','draft-5']);
  assert.equal(current[1].note,'保留修改');
});

test('updates cannot lose a draft identity or its saved-text source metadata',()=>{
  const [item]=identifyDrafts([{...draft,pendingInputId:'input-1',pendingDraftId:'bill-1'}]);
  const [updated]=changeDraft([item],item.localDraftId,{...draft,amountCny:8.5});
  assert.equal(updated.localDraftId,item.localDraftId);
  assert.equal(updated.pendingInputId,'input-1');assert.equal(updated.pendingDraftId,'bill-1');
  assert.equal(identifyDrafts([{...draft,pendingInputId:'input-1',pendingDraftId:'bill-1'}])[0].localDraftId,item.localDraftId);
});

test('discarding a single draft clears it without affecting its original object or another bill',()=>{
  const [single,other]=create(2);
  assert.deepEqual(changeDraft([single],single.localDraftId,null),[]);
  assert.deepEqual(changeDraft([single,other],single.localDraftId,null),[other]);
  assert.equal(single.amount,10);
});
