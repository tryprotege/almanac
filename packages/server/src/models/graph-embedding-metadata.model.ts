import { Schema, model } from "mongoose";

/**
 * Tracks embedding metadata for graph elements (entities and relationships)
 * One entry per global entity or relationship (deduplicated across documents)
 */

export interface IGraphEmbeddingMetadata {
  _id: string; // Format: "entity_{globalId}" or "rel_{sourceId}_{type}_{targetId}" - Semantic MongoDB ID
  qdrantId?: string; // UUID for Qdrant point ID (required by Qdrant, generated on first embedding)
  itemType: "entity" | "relationship";

  // For entities
  entityId?: string; // Global Memgraph entity ID
  entityType?: string; // "Person", "Organization", etc.

  // For relationships
  sourceId?: string; // Global source entity ID
  targetId?: string; // Global target entity ID
  relType?: string; // "WORKS_WITH", "REPORTS_TO", etc.

  // Source tracking
  source?: string; // Primary source ("notion", "github", etc.)
  sources?: string[]; // All sources that contributed to this element

  // Embedding tracking
  contentChecksum: string; // Current content hash for change detection
  embeddedChecksum?: string; // Checksum when last embedded (for comparison)
  embeddedAt?: Date; // When last embedded
  embeddingModelVersion?: string; // Which model was used

  // Provenance - which documents contributed to this element
  sourceDocumentIds: string[]; // Array of MongoDB record IDs
  lastUpdatedBy: string; // Which document triggered the last update

  createdAt: Date;
  updatedAt: Date;
}

const graphEmbeddingMetadataSchema = new Schema<IGraphEmbeddingMetadata>(
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
    itemType: {
      type: String,
      required: true,
      enum: ["entity", "relationship"],
      index: true,
    },

    // Entity fields
    entityId: {
      type: String,
      index: true,
      sparse: true,
    },
    entityType: {
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

    // Source tracking
    source: {
      type: String,
      index: true,
      sparse: true,
    },
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
    sourceDocumentIds: {
      type: [String],
      default: [],
      index: true,
    },
    lastUpdatedBy: {
      type: String,
      required: true,
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
graphEmbeddingMetadataSchema.index({ sourceDocumentIds: 1 });

// Performance indexes for LightRAG queries (added for optimization)
graphEmbeddingMetadataSchema.index({ entityType: 1, embeddedAt: -1 }); // Filter by entity type
graphEmbeddingMetadataSchema.index({
  itemType: 1,
  entityType: 1,
  embeddedAt: -1,
}); // Combined filter
graphEmbeddingMetadataSchema.index({ sourceDocumentIds: 1, itemType: 1 }); // Document lookup

// Checksum-based embedding queries
graphEmbeddingMetadataSchema.index({ contentChecksum: 1, embeddedChecksum: 1 }); // For change detection
graphEmbeddingMetadataSchema.index({ source: 1, embeddedAt: 1 }); // Find items by source and embedding status
graphEmbeddingMetadataSchema.index({
  itemType: 1,
  source: 1,
  embeddedAt: 1,
}); // Filter by type + source + embedding status

export const GraphEmbeddingMetadata = model<IGraphEmbeddingMetadata>(
  "GraphEmbeddingMetadata",
  graphEmbeddingMetadataSchema
);
