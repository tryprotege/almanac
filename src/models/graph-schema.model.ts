import mongoose, { InferSchemaType } from "mongoose";

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

const GraphSchemaSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
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

export type GraphSchema = InferSchemaType<typeof GraphSchemaSchema>;
export type RelationshipType = InferSchemaType<typeof RelationshipTypeSchema>;
export type EntityType = InferSchemaType<typeof EntityTypeSchema>;

// Export the model
export const GraphSchemaModel = mongoose.model<GraphSchema>(
  "GraphSchema",
  GraphSchemaSchema
);
