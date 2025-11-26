import mongoose from "mongoose";
import { SourceType } from "../types/index.js";

/**
 * Unified entity model for multi-source synchronization
 * Supports Notion, Slack, Calendar, Jira, and future sources
 */
export interface ISyncedEntity {
  // Identity
  _id: string; // Format: "{source}_{entityType}_{sourceId}"
  source: SourceType;
  sourceId: string; // Original ID from source
  entityType: string; // 'page' | 'message' | 'event' | 'task' | 'issue' | etc.

  // Universal searchable fields (indexed for fast queries)
  title: string;
  content: string; // Combined searchable text
  people: string[]; // Email addresses or user IDs
  primaryDate: Date | null; // Most relevant date for the entity
  tags: string[]; // Extracted or explicit tags

  // Flexible attributes (source-specific data)
  attributes: Record<string, any>;

  // Raw data (for reconstruction and debugging)
  rawData: Record<string, any>;

  // Sync metadata
  checksum: string; // SHA-256 of normalized content
  version: number; // Incremental version number
  syncedAt: Date; // Last successful sync
  sourceUpdatedAt: Date; // Last update time from source

  // Deletion tracking
  isDeleted: boolean; // Soft delete flag
  deletedAt: Date | null;
  deletionStrategy: "soft" | "hard" | "historical";

  // Vector & Graph references
  vectorIds: string[]; // Qdrant point IDs (for chunked content)
  graphNodeId: string; // Memgraph node reference

  // Indexing metadata
  embeddingVersion: number;
  lastIndexedAt: Date;
}

const SyncedEntitySchema = new mongoose.Schema<ISyncedEntity>(
  {
    _id: { type: String, required: true },
    source: { type: String, required: true, index: true },
    sourceId: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },

    title: { type: String, required: true, index: true },
    content: { type: String, required: true },
    people: [{ type: String, index: true }],
    primaryDate: { type: Date, index: true },
    tags: [{ type: String, index: true }],

    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },

    checksum: { type: String, required: true },
    version: { type: Number, default: 1 },
    syncedAt: { type: Date, default: Date.now, index: true },
    sourceUpdatedAt: { type: Date, required: true, index: true },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletionStrategy: {
      type: String,
      enum: ["soft", "hard", "historical"],
      default: "soft",
    },

    vectorIds: [{ type: String }],
    graphNodeId: { type: String },

    embeddingVersion: { type: Number, default: 1 },
    lastIndexedAt: { type: Date, default: Date.now },
  },
  {
    collection: "synced_entities",
    timestamps: true,
    _id: false, // We provide our own _id
  }
);

// Compound indexes for efficient queries
SyncedEntitySchema.index({ source: 1, entityType: 1 });
SyncedEntitySchema.index({ source: 1, sourceId: 1 }, { unique: true });
SyncedEntitySchema.index({ isDeleted: 1, syncedAt: -1 });
SyncedEntitySchema.index({ sourceUpdatedAt: -1 });
SyncedEntitySchema.index({ content: "text", title: "text" }); // Full-text search

export const SyncedEntityModel = mongoose.model<ISyncedEntity>(
  "SyncedEntity",
  SyncedEntitySchema
);
