import { InferSchemaType, Schema, model } from "mongoose";

/**
 * Tracks embedding metadata for graph elements (entities and relationships)
 * One entry per global entity or relationship (deduplicated across documents)
 */

/**
 * Represents a single mention of a relationship in a document
 * Used to track provenance: which documents mention which relationships
 */

const graphEmbeddingMetadataSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    qdrantId: {
      type: String,
      index: true,
      sparse: true,
    },
    memgraphId: {
      type: String,
      index: true,
    },
    itemType: {
      type: String,
      required: true,
      enum: ["entity", "relationship"],
      index: true,
    },

    // Entity fields
    entityType: {
      type: String,
      sparse: true,
    },
    entityDescription: {
      type: String,
      sparse: true,
    },

    // Relationship fields
    sourceId: {
      type: String,
      index: true,
      sparse: true,
    },
    targetId: {
      type: String,
      index: true,
      sparse: true,
    },
    relType: {
      type: String,
      sparse: true,
    },
    relationshipDescription: {
      type: String,
      sparse: true,
    },

    // Source tracking
    sources: {
      type: [String],
      default: [],
      index: true,
    },

    // Embedding metadata
    contentChecksum: {
      type: String,
      required: true,
      index: true,
    },
    embeddedChecksum: {
      type: String,
      index: true,
      sparse: true,
    },
    embeddedAt: {
      type: Date,
      index: true,
      sparse: true,
    },
    embeddingModelVersion: {
      type: String,
      index: true,
      sparse: true,
    },

    // Provenance
    sourceRecordIds: {
      type: [String],
      default: [],
      index: true,
    },
    lastUpdatedBy: {
      type: String,
      required: true,
    },

    // Relationship mentions tracking
    mentionedInRecords: {
      type: [
        {
          recordId: { type: String, required: true },
          confidence: { type: Number, required: true },
          extractedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      sparse: true, // Only for relationships
    },
  },
  {
    timestamps: true,
    collection: "graph_embedding_metadata",
  }
);

// Indexes for efficient queries
graphEmbeddingMetadataSchema.index({ itemType: 1, embeddedAt: 1 });
graphEmbeddingMetadataSchema.index({ embeddingModelVersion: 1 });
graphEmbeddingMetadataSchema.index({ sourceRecordIds: 1 });

// Performance indexes for LightRAG queries (added for optimization)
graphEmbeddingMetadataSchema.index({ entityType: 1, embeddedAt: -1 }); // Filter by entity type
graphEmbeddingMetadataSchema.index({
  itemType: 1,
  entityType: 1,
  embeddedAt: -1,
}); // Combined filter
graphEmbeddingMetadataSchema.index({ sourceRecordIds: 1, itemType: 1 }); // Document lookup

// Checksum-based embedding queries
graphEmbeddingMetadataSchema.index({ contentChecksum: 1, embeddedChecksum: 1 }); // For change detection
graphEmbeddingMetadataSchema.index({ source: 1, embeddedAt: 1 }); // Find items by source and embedding status
graphEmbeddingMetadataSchema.index({
  itemType: 1,
  source: 1,
  embeddedAt: 1,
}); // Filter by type + source + embedding status

// Relationship mention tracking indexes
graphEmbeddingMetadataSchema.index({ "mentionedInRecords.recordId": 1 }); // Find relationships by document
graphEmbeddingMetadataSchema.index({
  itemType: 1,
  mentionedInRecords: 1,
}); // Find orphaned relationships (empty array)

export type GraphEmbeddingMetadataSchema = InferSchemaType<
  typeof graphEmbeddingMetadataSchema
>;

export const GraphEmbeddingMetadata = model<GraphEmbeddingMetadataSchema>(
  "GraphEmbeddingMetadata",
  graphEmbeddingMetadataSchema
);
