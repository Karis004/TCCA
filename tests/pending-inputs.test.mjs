import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingInputSchema, shortcutInputSchema, pendingKey, mergePendingDrafts } from '../src/lib/pendingInputs.ts';
import { shortcutInputId, shortcutPaymentMethod } from '../src/lib/shortcutInput.ts';

const draft = {type:'expense',amount:12.8,currency:'HKD',date:'2026-10-20',category:'交通',paymentMethod:'八达通',merchant:null,tags:[],note:null,confidence:1,needsReview:true,pendingInputId:'input-1',pendingDraftId:'draft-1'};
const input = {_id:'input-1',text:'今天地铁12.8块',referenceDate:'2026-10-20',status:'ready',drafts:[draft],createdAt:'2026-10-20',updatedAt:'2026-10-20'};

test('raw text is kept with its own reference date and invalid calendar dates are rejected',()=>{
  assert.deepEqual(pendingInputSchema.parse({text:'  昨天午饭30块\n今天地铁12.8块  ',referenceDate:'2026-10-20',amount:999}),{text:'昨天午饭30块\n今天地铁12.8块',referenceDate:'2026-10-20'});
  for(const referenceDate of ['2026-02-30','2026-13-01','yesterday','']) assert.equal(pendingInputSchema.safeParse({text:'午饭30',referenceDate}).success,false);
  assert.equal(pendingInputSchema.safeParse({text:' ',referenceDate:'2026-10-20'}).success,false);
});
test('shortcut intake keeps OCR lines and only accepts text', () => {
  const result = shortcutInputSchema.parse({ text: ' 支付成功\n实付 HKD 28 ', paymentMethod: ' 八达通 ', userId: 'elsewhere' });
  assert.deepEqual(result, { text: '支付成功\n实付 HKD 28' });
  assert.equal(shortcutInputSchema.safeParse({ text: ' ', paymentMethod: '微信' }).success, false);
  assert.equal(shortcutInputSchema.safeParse({ text: '文本' }).success, true);
});
test('shortcut links and payment methods resolve to known shapes', () => {
  const id = '0123456789abcdef01234567';
  assert.equal(shortcutInputId(`#shortcut=${id}`), id);
  assert.equal(shortcutInputId(`#shortcut=${id}&next=https://example.com`), undefined);
  assert.equal(shortcutPaymentMethod('  Mox ', ['MOX', '现金']), 'MOX');
  assert.equal(shortcutPaymentMethod('新支付方式', ['MOX', '现金']), null);
});
test('loading identified text restores its drafts without writing or changing normal drafts',()=>{
  const normal = {...draft,pendingInputId:undefined,pendingDraftId:undefined,amount:50};
  const result=mergePendingDrafts([normal],[input]);
  assert.deepEqual(result,[normal,draft]);
  assert.equal(result[0],normal);
});
test('reloading and reusing ready inputs never duplicates drafts or overwrites in-page edits',()=>{
  const edited={...draft,amount:20,note:'人工修改'};
  const result=mergePendingDrafts([edited],[input]);
  assert.deepEqual(result,[edited]);
  assert.deepEqual(mergePendingDrafts(result,[input]),result);
  assert.equal(pendingKey(draft),'input-1:draft-1');
});
test('pending and processing raw text never becomes a ledger draft',()=>{
  assert.deepEqual(mergePendingDrafts([],[{...input,status:'pending'},{...input,status:'processing'}]),[]);
});
test('confirmed or deleted source drafts disappear while unrelated drafts are retained',()=>{
  const second={...draft,pendingDraftId:'draft-2'};
  const normal={...draft,pendingInputId:undefined,pendingDraftId:undefined};
  assert.deepEqual(mergePendingDrafts([draft,second,normal],[{...input,drafts:[second]}]),[second,normal]);
  assert.deepEqual(mergePendingDrafts([draft,normal],[]),[normal]);
});
