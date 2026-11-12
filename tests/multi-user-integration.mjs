// Run only against an explicitly named local preview database and local HTTP server.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve('@better-auth/passkey'));
const { isoCBOR } = await import(pathToFileURL(pluginRequire.resolve('@simplewebauthn/server/helpers')).href);
const origin = 'http://localhost:3184';
assert.match(process.env.MONGODB_DB || '', /^tcca_multi_(preview|test)_/);
assert.equal(process.env.BETTER_AUTH_URL, origin);
const client = new MongoClient(process.env.MONGODB_URI); await client.connect(); const db = client.db(process.env.MONGODB_DB);
const testIds = [], sessionTokens = []; const stamp = crypto.randomBytes(6).toString('hex'); let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
function cookieFor(token) { return 'better-auth.session_token=' + encodeURIComponent(token + '.' + crypto.createHmac('sha256', process.env.BETTER_AUTH_SECRET).update(token).digest('base64')); }
async function user(role = 'user') {
  const _id = new ObjectId(), token = crypto.randomBytes(32).toString('hex'), now = new Date(); testIds.push(_id.toString()); sessionTokens.push(token);
  await db.collection('user').insertOne({ _id, email: `tcca-${stamp}-${testIds.length}@example.test`, emailVerified: true, name: 'Integration fixture', role, banned: false, createdAt: now, updatedAt: now });
  await db.collection('session').insertOne({ _id: new ObjectId(), token, userId: _id, createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 365 * 86400000), ipAddress: '127.0.0.1', userAgent: 'TCCA integration' });
  return { id: _id.toString(), cookie: cookieFor(token), token };
}
async function call(user, url, method = 'GET', body, originOverride = origin) {
  const response = await fetch(origin + url, { method, headers: { ...(user ? { Cookie: user.cookie } : {}), Origin: originOverride, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { response, status: response.status, data };
}
function b64(value) { return Buffer.from(value).toString('base64url'); }
function withCookies(base, response) {
  const items = new Map(base.cookie.split('; ').map(part => [part.slice(0, part.indexOf('=')), part]));
  for (const header of response.headers.getSetCookie()) { const part = header.split(';')[0]; items.set(part.slice(0, part.indexOf('=')), part); }
  return { ...base, cookie: [...items.values()].join('; ') };
}
async function registerPasskey(account, name) {
  const options = await call(account, '/api/auth/passkey/generate-register-options');
  assert.equal(options.status, 200, JSON.stringify(options.data));
  const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); const jwk = keys.publicKey.export({ format: 'jwk' });
  const credential = crypto.randomBytes(32);
  const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
  const length = Buffer.alloc(2); length.writeUInt16BE(credential.length);
  const authData = Buffer.concat([crypto.createHash('sha256').update('localhost').digest(), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), length, credential, Buffer.from(cose)]);
  const clientDataJSON = b64(JSON.stringify({ type: 'webauthn.create', challenge: options.data.challenge, origin, crossOrigin: false }));
  const attestationObject = b64(isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]])));
  const result = await call(withCookies(account, options.response), '/api/auth/passkey/verify-registration', 'POST', { name, response: { id: b64(credential), rawId: b64(credential), type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform', response: { clientDataJSON, attestationObject, transports: ['internal'] } } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { id: result.data.id, credential, privateKey: keys.privateKey, userHandle: options.data.user.id };
}
async function passkeyLogin(key, badSignature = false) {
  const empty = { cookie: '' }; const options = await call(empty, '/api/auth/passkey/generate-authenticate-options');
  assert.equal(options.status, 200, JSON.stringify(options.data));
  const authData = Buffer.concat([crypto.createHash('sha256').update('localhost').digest(), Buffer.from([0x05]), Buffer.from([0, 0, 0, 1])]);
  const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.data.challenge, origin, crossOrigin: false }));
  const signature = badSignature ? crypto.randomBytes(70) : crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(clientData).digest()]), key.privateKey);
  return call(withCookies(empty, options.response), '/api/auth/passkey/verify-authentication', 'POST', { response: { id: b64(key.credential), rawId: b64(key.credential), type: 'public-key', clientExtensionResults: {}, response: { authenticatorData: b64(authData), clientDataJSON: b64(clientData), signature: b64(signature), userHandle: key.userHandle } } });
}
try {
  const a = await user(), b = await user(), owner = await user('owner');
  for (const route of ['/api/transactions', '/api/analytics', '/api/pending-inputs', '/api/transaction-presets', '/api/settings', '/api/ai-config', '/api/export', '/api/admin/users']) check((await call(null, route)).status === 401, 'anonymous blocked ' + route);
  check((await call({ cookie: cookieFor('invalid-token') }, '/api/me')).status === 401, 'forged session rejected');
  check((await call(a, '/api/me')).data.id === a.id, 'real signed session resolves correct owner');
  await call(a, '/api/auth/update-user', 'POST', { role: 'owner', banned: false });
  check((await db.collection('user').findOne({ _id: new ObjectId(a.id) })).role === 'user', 'client cannot grant itself owner role');
  const bill = { type: 'expense', amount: 12.5, currency: 'CNY', date: '2026-11-07', category: '交通', paymentMethod: '现金', tags: [], note: null };
  const saved = await call(a, '/api/transactions', 'POST', { ...bill, userId: b.id }); check(saved.status === 201, 'save transaction');
  const id = saved.data._id; check((await db.collection('transactions').findOne({ _id: new ObjectId(id) })).userId === a.id, 'client cannot change owner');
  check((await call(b, '/api/transactions')).data.length === 0, 'B cannot list A bills or legacy baseline');
  check((await call(b, '/api/transactions?id=' + id, 'PUT', { ...bill, amount: 99 })).status === 404, 'foreign edit blocked');
  check((await call(b, '/api/transactions?id=' + id, 'DELETE')).status === 404, 'foreign delete blocked');
  check((await call(a, '/api/transactions', 'POST', bill, 'https://evil.example')).status === 403, 'cross-origin write blocked');
  const preset = await call(a, '/api/transaction-presets', 'POST', { ...bill, name: 'Integration commute' }); check(preset.status === 201, 'preset saved separately');
  check((await call(b, '/api/transaction-presets')).data.length === 0, 'preset isolation');
  check((await call(b, '/api/transaction-presets?id=' + preset.data._id, 'DELETE')).status === 404, 'foreign preset delete blocked');
  const pending = await call(a, '/api/pending-inputs', 'POST', { text: 'Integration text', referenceDate: '2026-11-07' }); check(pending.status === 201, 'save pending text');
  check((await call(b, '/api/pending-inputs')).data.length === 0, 'pending input isolation');
  check((await call(b, '/api/pending-inputs?id=' + pending.data._id, 'PUT', { text: 'overwrite', referenceDate: '2026-11-07' })).status !== 200, 'foreign pending edit blocked');
  const draftId = crypto.randomUUID(); await db.collection('pending_inputs').updateOne({ _id: new ObjectId(pending.data._id) }, { $set: { status: 'ready', drafts: [{ pendingDraftId: draftId, ...bill }] } });
  check((await call(b, '/api/transactions', 'POST', { ...bill, pendingInputId: pending.data._id, pendingDraftId: draftId })).status === 409, 'foreign source cannot create bill');
  const first = await call(a, '/api/transactions', 'POST', { ...bill, pendingInputId: pending.data._id, pendingDraftId: draftId });
  const second = await call(a, '/api/transactions', 'POST', { ...bill, pendingInputId: pending.data._id, pendingDraftId: draftId });
  check(first.status === 201 && second.status === 200 && first.data._id === second.data._id, 'pending save is idempotent');
  check((await call(a, '/api/pending-inputs')).data.length === 0, 'completed pending source removed');
  const settings = (await call(a, '/api/settings')).data;
  check((await call(a, '/api/settings', 'PUT', { version: 0, settings: { ...settings, defaultCurrency: 'CNY' } })).status === 200, 'first settings save');
  check((await call(a, '/api/settings', 'PUT', { version: 0, settings })).status === 409, 'stale settings cannot overwrite');
  check((await call(b, '/api/settings')).data.defaultCurrency === 'HKD', 'settings isolated');
  check((await call(a, '/api/parse', 'POST', { text: '今天花了12块' })).status === 422, 'no shared fallback AI key');
  check((await call(a, '/api/ai-config', 'POST', { action: 'import-legacy' })).status === 403, 'ordinary user cannot import owner AI credentials');
  const aiSaved = await call(a, '/api/ai-config', 'PUT', { baseUrl: 'https://example.com/v1', model: 'test-model', apiKey: 'integration-secret-' + stamp });
  check(aiSaved.status === 200 && !JSON.stringify(aiSaved.data).includes('integration-secret'), 'AI config masked');
  check(!(await call(b, '/api/ai-config')).data.configured, 'AI config isolation');
  check((await call(a, '/api/ai-config', 'POST', { action: 'reveal' })).data.apiKey === 'integration-secret-' + stamp, 'explicit reveal own key');
  const encrypted = await db.collection('user_ai_configs').findOne({ userId: a.id }); check(!JSON.stringify(encrypted).includes('integration-secret-'), 'key encrypted at rest');
  check((await call(a, '/api/ai-config', 'PUT', { baseUrl: 'https://other.example/v1', model: 'x' })).status === 400, 'changing target cannot silently reuse saved key');
  check((await call(a, '/api/ai-config', 'PUT', { baseUrl: 'https://127.0.0.1/v1', model: 'x', apiKey: 'x' })).status === 400, 'private endpoint rejected');
  const analytics = await call(b, '/api/analytics?month=all&currency=CNY'); check(analytics.status === 200 && analytics.data.transactionCount === 0, 'analytics isolated');
  const exported = await call(a, '/api/export'); check(exported.status === 200 && exported.data.transactions.length === 2 && !JSON.stringify(exported.data).includes('integration-secret'), 'export includes only own data, no keys');
  check((await call(a, '/api/admin/users')).status === 403, 'non-owner admin access blocked');
  const oldExpiry = new Date(Date.now() + 360 * 86400000); await db.collection('session').updateOne({ token: a.token }, { $set: { updatedAt: new Date(Date.now() - 3 * 86400000), expiresAt: oldExpiry } });
  const refreshed = await call(a, '/api/auth/get-session'); check(refreshed.status === 200 && new Date(refreshed.data.session.expiresAt) > oldExpiry, 'session extends without Google');
  check(refreshed.response.headers.getSetCookie().some(c => /Max-Age=31536000/i.test(c) && /HttpOnly/i.test(c)), 'persistent cookie renewed for 365 days');
  // Return to a fresh session before registering additional credentials.
  await db.collection('session').updateOne({ token: a.token }, { $set: { createdAt: new Date(), updatedAt: new Date() } });
  const key1 = await registerPasskey(a, 'Integration iPhone'), key2 = await registerPasskey(a, 'Integration Android');
  check((await call(a, '/api/auth/passkey/list-user-passkeys')).data.length === 2, 'multiple device passkeys on same account');
  check((await call(b, '/api/auth/passkey/list-user-passkeys')).data.length === 0, 'passkey list isolation');
  check((await call(b, '/api/auth/passkey/delete-passkey', 'POST', { id: key1.id })).status !== 200, 'foreign passkey deletion rejected');
  check((await call(b, '/api/auth/passkey/update-passkey', 'POST', { id: key1.id, name: 'foreign rename' })).status !== 200, 'foreign passkey rename rejected');
  check((await call(a, '/api/auth/passkey/update-passkey', 'POST', { id: key1.id, name: 'Renamed device' })).status === 200, 'owner can rename passkey');
  check((await passkeyLogin(key1, true)).status !== 200, 'invalid assertion signature rejected');
  const direct = await passkeyLogin(key2); check(direct.status === 200 && direct.data.user.id === a.id, 'valid signed assertion logs into same account without Google');
  check((await call(owner, '/api/admin/users', 'POST', { userId: a.id, action: 'ban' })).status === 200, 'owner can ban');
  check((await call(a, '/api/transactions')).status !== 200, 'existing banned session denied');
  check((await passkeyLogin(key1)).status !== 200, 'banned account cannot log in with a passkey');
  check((await call(owner, '/api/admin/users', 'POST', { userId: a.id, action: 'clear', confirmation: `tcca-${stamp}-1@example.test` })).status === 200, 'clear is recoverable');
  check((await db.collection('transactions').countDocuments({ userId: a.id, deletedAt: { $exists: true } })) === 2, 'soft-deleted records retained');
  check((await call(owner, '/api/admin/users', 'POST', { userId: a.id, action: 'restore', confirmation: `tcca-${stamp}-1@example.test` })).status === 200, 'admin restores cleared records');
  check((await db.collection('transactions').countDocuments({ userId: a.id, deletedAt: { $exists: false } })) === 2, 'restored bills remain complete');
  check((await call(owner, '/api/admin/users', 'POST', { userId: a.id, action: 'purge', confirmation: 'wrong' })).status === 400, 'purge requires exact confirmation');
  await call(owner, '/api/admin/users', 'POST', { userId: a.id, action: 'clear', confirmation: `tcca-${stamp}-1@example.test` });
  check((await call(owner, '/api/admin/users', 'POST', { userId: a.id, action: 'purge', confirmation: `tcca-${stamp}-1@example.test` })).status === 200, 'owner purges already cleared data');
  check((await db.collection('transactions').countDocuments({ userId: a.id })) === 0 && (await db.collection('transactions').countDocuments({ userId: b.id })) === 0, 'purge stays within target account');
  check((await call(owner, '/api/admin/users', 'POST', { userId: owner.id, action: 'ban' })).status === 400, 'owner protected from self-ban');
  console.log(JSON.stringify({ passed: checks, database: db.databaseName, realGoogleCredentialsUsedForFixtures: false }));
} finally {
  for (const name of ['transactions', 'transaction_presets', 'pending_inputs', 'user_settings', 'user_ai_configs', 'request_events']) await db.collection(name).deleteMany({ userId: { $in: testIds } });
  for (const name of ['session', 'account', 'passkey']) await db.collection(name).deleteMany({ userId: { $in: testIds.map(id => new ObjectId(id)) } });
  await db.collection('admin_events').deleteMany({ actorId: { $in: testIds } });
  await db.collection('user').deleteMany({ _id: { $in: testIds.map(id => new ObjectId(id)) } });
  await client.close();
}
