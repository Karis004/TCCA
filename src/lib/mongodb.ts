import { MongoClient } from "mongodb";

const options = {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30000
};

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
  _tccaIndexesPromise?: Promise<unknown>;
};

export function getClientPromise() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("Missing MONGODB_URI in environment variables.");
  }

  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = new MongoClient(uri, options).connect();
  }

  return globalWithMongo._mongoClientPromise;
}

export async function getDb() {
  const clientPromise = getClientPromise();
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || "ai_ledger");
  if (!globalWithMongo._tccaIndexesPromise) globalWithMongo._tccaIndexesPromise = Promise.all([
    db.collection("user_settings").createIndex({ userId: 1 }, { unique: true }),
    db.collection("user_ai_configs").createIndex({ userId: 1 }, { unique: true }),
    db.collection("transactions").createIndex({ userId: 1, date: -1, createdAt: -1, _id: -1 }),
    db.collection("transaction_presets").createIndex({ userId: 1, createdAt: -1, _id: -1 }),
    db.collection("pending_inputs").createIndex({ userId: 1, status: 1, createdAt: 1 }),
    db.collection("usage_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ,db.collection("request_events").createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 })
  ]).catch(error => { globalWithMongo._tccaIndexesPromise = undefined; throw error; });
  await globalWithMongo._tccaIndexesPromise;
  return db;
}
