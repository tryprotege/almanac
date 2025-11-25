import { MongoClient, Db } from "mongodb";
import { env } from "../../env.js";

export interface MongoConnection {
  client: MongoClient;
  db: Db;
  close: () => Promise<void>;
}

const createMongoUri = (): string => {
  const { MONGO_HOST, MONGO_PORT, MONGO_USERNAME, MONGO_PASSWORD } = env;
  return `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}`;
};

export const connectMongo = async (): Promise<MongoConnection> => {
  const uri = createMongoUri();

  try {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(env.MONGO_DB_NAME);

    console.log("✅ MongoDB connected successfully");

    const close = async (): Promise<void> => {
      await client.close();
      console.log("MongoDB disconnected");
    };

    return {
      client,
      db,
      close,
    };
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error;
  }
};
