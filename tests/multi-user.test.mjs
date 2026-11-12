import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { isPublicAddress, resolveAiTarget, encryptAiKey, decryptAiKey, redactAiError } from '../src/lib/aiSecurity.ts';
import { compareBaseline } from '../scripts/ledger-data.mjs';
import { resolveCurrency } from '../src/lib/currency.ts';
import { ownedCollection } from '../src/lib/ownership.ts';

test('AI targets block local, reserved, encoded and IPv4-mapped addresses', async () => {
  for (const address of ['127.0.0.1', '0.0.0.0', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  await assert.rejects(resolveAiTarget('https://2130706433/v1'));
  await assert.rejects(resolveAiTarget('http://example.com/v1'));
  await assert.rejects(resolveAiTarget('https://u:p@example.com/v1'));
});
test('DNS pinning rejects mixed public/private records and returns the checked address', async () => {
  const mixed = async () => [{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }];
  await assert.rejects(resolveAiTarget('https://example.com/v1', undefined, mixed));
  let lookups = 0;
  const checked = await resolveAiTarget('https://example.com/v1', undefined, async () => { lookups++; return [{ address: '1.1.1.1', family: 4 }]; });
  assert.equal(checked.address.address, '1.1.1.1'); assert.equal(lookups, 1);
});
test('legacy internal API exception is limited to exactly the configured origin', async () => {
  const target = await resolveAiTarget('http://127.0.0.1:8317/v1', 'http://127.0.0.1:8317');
  assert.equal(target.target.origin, 'http://127.0.0.1:8317');
  await assert.rejects(resolveAiTarget('http://127.0.0.1:8318/v1', 'http://127.0.0.1:8317'));
});
test('encrypted keys are bound to their user and tampering is rejected', () => {
  process.env.AI_CONFIG_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  const first = encryptAiKey('test-secret', 'alice'), second = encryptAiKey('test-secret', 'alice');
  assert.notEqual(first, second); assert.equal(decryptAiKey(first, 'alice'), 'test-secret');
  assert.throws(() => decryptAiKey(first, 'bob'));
  const pieces = first.split('.'); pieces[3] = Buffer.from('different').toString('base64'); assert.throws(() => decryptAiKey(pieces.join('.'), 'alice'));
  assert.equal(redactAiError('failed test-secret Bearer xyz', { apiKey: 'test-secret' }).includes('test-secret'), false);
});
test('user currency preference covers ambiguous text and preserves explicit exceptions', () => {
  assert.equal(resolveCurrency('JPY', '地铁¥20', false, 'CNY'), 'CNY');
  assert.equal(resolveCurrency('HKD', '20人民币', false, 'USD'), 'CNY');
  assert.equal(resolveCurrency('USD', '地铁20，午饭30人民币', true, 'JPY'), 'JPY');
});
test('ownership is enforced even when a query attempts to supply another user', () => {
  let filter, inserted;
  const db = { collection: () => ({ find: f => { filter = f; }, insertOne: doc => { inserted = doc; } }) };
  const own = ownedCollection(db, 'alice', 'transactions'); own.find({ userId: 'bob', _id: 'foreign' });
  assert.deepEqual(filter.$and[0], { userId: 'alice', deletedAt: { $exists: false } });
  own.insertOne({ userId: 'bob', amount: 20 }); assert.equal(inserted.userId, 'alice');
  assert.throws(() => ownedCollection(db, '', 'transactions'));
});
test('historical regression compares fixed IDs, not later additions or backdated transactions', () => {
  const old = { _id: new ObjectId(), amount: 20, date: '2026-11-07', createdAt: new Date('2026-11-07T00:00:00Z') };
  const baseline = { collections: [{ name: 'transactions', documents: [old] }] };
  const after = { collections: [{ name: 'transactions', documents: [{ ...old, userId: 'owner' }, { ...old, _id: new ObjectId(), date: '2026-01-01', amount: 900 }] }] };
  const report = compareBaseline(baseline, after)[0]; assert.deepEqual(report.changed, []); assert.deepEqual(report.missing, []); assert.equal(report.laterRecordsExcluded, 1);
  after.collections[0].documents[0].amount = 21; assert.equal(compareBaseline(baseline, after)[0].changed.length, 1);
});
