import mongoose from "mongoose";
import { env } from "../../env.js";
import type { GraphSchema } from "../../types/graph-schema.js";

export interface MongooseConnection {
  connection: typeof mongoose;
  close: () => Promise<void>;
}

const createMongoUri = (): string => {
  const { MONGO_HOST, MONGO_PORT, MONGO_USERNAME, MONGO_PASSWORD } = env;
  return `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}`;
};

// Graph Schema Mongoose Schema
const EntityTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    mcpSource: { type: String },
    properties: [{ type: String }],
  },
  { _id: false }
);

const RelationshipTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    sourceTypes: [{ type: String, required: true }],
    targetTypes: [{ type: String, required: true }],
    bidirectional: { type: Boolean, required: true },
    mcpSource: { type: String },
  },
  { _id: false }
);

const ExtractionRulesSchema = new mongoose.Schema(
  {
    autoExtractEntities: { type: Boolean, required: true, default: true },
    autoExtractRelationships: { type: Boolean, required: true, default: true },
    confidenceThreshold: {
      type: Number,
      required: true,
      default: 0.6,
      min: 0,
      max: 1,
    },
  },
  { _id: false }
);

const GraphSchemaSchema = new mongoose.Schema<GraphSchema>(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true, unique: true, index: true },
    entityTypes: [EntityTypeSchema],
    relationshipTypes: [RelationshipTypeSchema],
    extractionRules: {
      type: ExtractionRulesSchema,
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "graph_schemas",
    timestamps: true,
  }
);

// Create indexes
GraphSchemaSchema.index({ workspaceId: 1 }, { unique: true });

// Export the model
export const GraphSchemaModel = mongoose.model<GraphSchema>(
  "GraphSchema",
  GraphSchemaSchema
);

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
