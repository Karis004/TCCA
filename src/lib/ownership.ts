import type { Db, Document, Filter, UpdateFilter, FindOptions, FindOneAndUpdateOptions } from "mongodb";

const businessCollections = ["transactions", "transaction_presets", "pending_inputs", "user_settings", "user_ai_configs"] as const;
export type BusinessCollection = typeof businessCollections[number];
// Every business query has a mandatory owner constraint, including nested task/retry operations.
export function ownedCollection<T extends Document = Document>(db: Db, userId: string, name: BusinessCollection) {
  if (!userId) throw new Error("Missing authenticated owner");
  const collection = db.collection<T>(name);
  const scope = (filter: Filter<T> = {}): Filter<T> => ({ $and: [{ userId, deletedAt: { $exists: false } }, filter] }) as Filter<T>;
  return {
    find: (filter: Filter<T> = {}, options?: FindOptions<T>) => collection.find(scope(filter), options),
    findOne: (filter: Filter<T> = {}) => collection.findOne(scope(filter)),
    countDocuments: (filter: Filter<T> = {}) => collection.countDocuments(scope(filter)),
    insertOne: (doc: any) => collection.insertOne({ ...doc, userId }),
    updateOne: (filter: Filter<T>, update: UpdateFilter<T>) => collection.updateOne(scope(filter), update),
    updateMany: (filter: Filter<T>, update: UpdateFilter<T>) => collection.updateMany(scope(filter), update),
    findOneAndUpdate: (filter: Filter<T>, update: UpdateFilter<T>, options?: FindOneAndUpdateOptions) => collection.findOneAndUpdate(scope(filter), update, { ...options, includeResultMetadata: false }),
    deleteOne: (filter: Filter<T>) => collection.deleteOne(scope(filter))
  };
}
