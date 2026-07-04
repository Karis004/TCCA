import { MongoClient } from "mongodb";

const options = {};

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

function getClientPromise() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("Missing MONGODB_URI in environment variables.");
  }

  if (process.env.NODE_ENV === "development") {
    if (!globalWithMongo._mongoClientPromise) {
      globalWithMongo._mongoClientPromise = new MongoClient(uri, options).connect();
    }
    return globalWithMongo._mongoClientPromise;
  }

  return new MongoClient(uri, options).connect();
}

export async function getDb() {
  const clientPromise = getClientPromise();
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || "ai_ledger");
}
