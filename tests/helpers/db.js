import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongod;

export const connectTestDB = async () => {
  if (process.env.TEST_MONGO_URI) {
    await mongoose.connect(process.env.TEST_MONGO_URI);
    return;
  }
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
};

export const disconnectTestDB = async () => {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
};

export const clearCollections = async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
};
