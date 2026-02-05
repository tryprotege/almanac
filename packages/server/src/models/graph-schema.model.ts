import mongoose, { InferSchemaType } from 'mongoose';

// Graph Schema Mongoose Schema
const EntityTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    mcpSource: { type: String },
    properties: [{ type: String }],
  },
  { _id: false },
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
  { _id: false },
);

const SchemaUpdateHistorySchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    updatedAt: { type: Date, required: true },
    reason: { type: String, required: true },
    entityTypesAdded: { type: Number, default: 0 },
    relationshipTypesAdded: { type: Number, default: 0 },
    totalEntityTypes: { type: Number, required: true },
    totalRelationshipTypes: { type: Number, required: true },
  },
  { _id: false },
);

const GraphSchemaSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    entityTypes: [EntityTypeSchema],
    relationshipTypes: [RelationshipTypeSchema],
    // Versioning fields
    version: { type: Number, required: true, default: 1 },
    lastLearnedAt: { type: Date },
    learnedFromSampleSize: { type: Number },
    // Persona field
    persona: {
      type: String,
      default: '',
      description: 'User-provided context/persona for AI schema learning',
    },
    // History tracking
    schemaUpdateHistory: [SchemaUpdateHistorySchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'graph_schemas',
    timestamps: true,
  },
);

export type GraphSchema = InferSchemaType<typeof GraphSchemaSchema>;
export type GraphRelationshipType = InferSchemaType<typeof RelationshipTypeSchema>;
export type GraphEntityType = InferSchemaType<typeof EntityTypeSchema>;

// Export the model
export const GraphSchemaModel = mongoose.model<GraphSchema>('GraphSchema', GraphSchemaSchema);
