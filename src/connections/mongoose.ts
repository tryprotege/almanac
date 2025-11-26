import mongoose from "mongoose";
import { env } from "../env.js";

// TODO: we may not need this
export const MONGODB_SCHEMAS = {
  // Main content storage (renamed from resources)
  records: {
    collectionName: "documents",
    indexes: [
      { key: { _id: 1 }, unique: true },
      { key: { source: 1, type: 1 } },
      { key: { type: 1 } },
      { key: { indexedAt: -1 } },
    ],
  },

  // Graph extraction configuration
  graph_schema: {
    collectionName: "graph_schema",
    indexes: [{ key: { _id: 1 }, unique: true }],
  },

  // MCP server configurations
  mcp_server_configs: {
    collectionName: "mcp_server_configs",
    indexes: [{ key: { name: 1 }, unique: true }, { key: { type: 1 } }],
  },

  // Embedding model metadata
  embedding_metadata: {
    collectionName: "embedding_metadata",
    indexes: [
      { key: { _id: 1 }, unique: true }, // Collection name
      { key: { active: 1 } }, // Which collection is active
      { key: { model: 1 } },
    ],
  },
} as const;

export interface MongooseConnection {
  connection: typeof mongoose;
  close: () => Promise<void>;
}

// Re-export models
export { GraphSchemaModel } from "../models/graph-schema.model.js";
export { MCPServerConfigModel } from "../models/mcp-config.model.js";

const createMongoUri = (): string => {
  const { MONGO_HOST, MONGO_PORT, MONGO_USERNAME, MONGO_PASSWORD } = env;
  return `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}`;
};

/**
 * Connect to MongoDB using Mongoose
 */
export const connectMongoose = async (): Promise<MongooseConnection> => {
  const uri = createMongoUri();

  try {
    await mongoose.connect(uri, {
      dbName: env.MONGO_DB_NAME,
    });

    console.log("✅ Mongoose connected successfully");

    const close = async (): Promise<void> => {
      await mongoose.connection.close();
      console.log("Mongoose disconnected");
    };

    return {
      connection: mongoose,
      close,
    };
  } catch (error) {
    console.error("❌ Mongoose connection error:", error);
    throw error;
  }
};
