import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoClient, BSON } from 'mongodb';
const collections = ['transactions', 'transaction_presets', 'pending_inputs'];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function businessHash(doc) {
  const { userId: _owner, ...business } = doc;
  return crypto.createHash('sha256').update(JSON.stringify(canonical(BSON.EJSON.serialize(business, { relaxed: false })))).digest('hex');
}
export function compareBaseline(baseline, current) {
  return baseline.collections.filter(col => collections.includes(col.name)).map(col => {
    const after = new Map((current.collections.find(c => c.name === col.name)?.documents || []).map(doc => [doc._id.toString(), doc]));
    const missing = [], changed = [];
    for (const doc of col.documents) {
      const id = doc._id.toString(); const match = after.get(id);
      if (!match) missing.push(id); else if (businessHash(doc) !== businessHash(match)) changed.push(id);
    }
    return { collection: col.name, baselineCount: col.documents.length, missing, changed, laterRecordsExcluded: [...after.keys()].filter(id => !col.documents.some(d => d._id.toString() === id)).length };
  });
}
export async function snapshotDb(db) {
  const result = [];
  for (const meta of (await db.listCollections().toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
    const col = db.collection(meta.name);
    result.push({ name: meta.name, options: meta.options, documents: await col.find().sort({ _id: 1 }).toArray(), indexes: await col.indexes() });
  }
  return { database: db.databaseName, capturedAt: new Date(), collections: result };
}
export async function backupDb(db, directory) {
  const output = path.resolve(directory); const repo = path.resolve(import.meta.dirname, '..');
  if (output === repo || output.startsWith(repo + path.sep)) throw new Error('备份必须放在仓库外。');
  await fs.mkdir(output, { recursive: false, mode: 0o700 });
  const data = await snapshotDb(db); const raw = BSON.EJSON.stringify(data, { relaxed: false });
  await fs.writeFile(path.join(output, 'mongodb.ejson'), raw, { flag: 'wx', mode: 0o600 });
  const manifest = { database: db.databaseName, capturedAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(raw).digest('hex'), collections: data.collections.map(c => ({ name: c.name, count: c.documents.length })) };
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  return manifest;
}
export async function migrateOwner(db, email, apply = false) {
  const user = await db.collection('user').findOne({ email: email.toLowerCase(), emailVerified: true });
  if (!user) throw new Error('请先用已确认的 Google 邮箱登录目标环境。');
  const account = await db.collection('account').findOne({ providerId: 'google', userId: user._id });
  if (!account) throw new Error('目标账号尚未绑定 Google 身份。');
  const report = [];
  for (const name of collections) {
    const col = db.collection(name); const filter = { userId: { $exists: false } };
    const count = await col.countDocuments(filter);
    if (apply && count) await col.updateMany(filter, { $set: { userId: user._id.toString() } });
    report.push({ collection: name, eligible: count, applied: apply ? count : 0 });
  }
  if (apply) await db.collection('user').updateOne({ _id: user._id }, { $set: { role: 'owner' } });
  return { ownerId: user._id.toString(), applied: apply, collections: report };
}
export async function restorePreview(db, snapshot) {
  if (!/^tcca_multi_(preview|test)_/.test(db.databaseName) || snapshot.database === db.databaseName) throw new Error('只能恢复到独立预览／测试数据库。');
  for (const source of snapshot.collections.filter(c => collections.includes(c.name))) {
    const target = db.collection(source.name);
    if (await target.countDocuments()) throw new Error('目标业务集合必须为空，不覆盖现有数据。');
  }
  for (const source of snapshot.collections.filter(c => collections.includes(c.name))) {
    if (source.documents.length) await db.collection(source.name).insertMany(source.documents);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const command = args[0], database = value('--database') || process.env.MONGODB_DB;
  if (!database || !process.env.MONGODB_URI) throw new Error('必须明确设置数据库及连接配置。');
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect(); const db = client.db(database);
    if (command === 'backup') console.log(JSON.stringify(await backupDb(db, value('--output')), null, 2));
    else if (command === 'restore-preview') { await restorePreview(db, BSON.EJSON.parse(await fs.readFile(value('--snapshot'), 'utf8'), { relaxed: false })); console.log('仅业务快照已恢复到独立预览库。'); }
    else if (command === 'migrate-owner') {
      const apply = args.includes('--apply');
      if (apply && (value('--confirm-db') !== database || !value('--backup-dir'))) throw new Error('执行迁移必须提供 --confirm-db 和仓库外 --backup-dir。');
      const before = await snapshotDb(db);
      if (apply) await backupDb(db, value('--backup-dir'));
      console.log(JSON.stringify(await migrateOwner(db, value('--owner-email') || process.env.OWNER_GOOGLE_EMAIL, apply), null, 2));
      if (apply) { const check = compareBaseline(before, await snapshotDb(db)); if (check.some(c => c.changed.length || c.missing.length)) throw new Error('迁移后业务字段比对失败。'); console.log('迁移前后业务字段一致。'); }
    } else if (command === 'verify-baseline') {
      const baseline = BSON.EJSON.parse(await fs.readFile(value('--snapshot'), 'utf8'), { relaxed: false }); const report = compareBaseline(baseline, await snapshotDb(db));
      console.log(JSON.stringify(report, null, 2)); if (report.some(c => c.changed.length || c.missing.length)) process.exitCode = 2;
    } else throw new Error('支持 backup、restore-preview、migrate-owner（默认只预览）、verify-baseline。');
  } finally { await client.close(); }
}
