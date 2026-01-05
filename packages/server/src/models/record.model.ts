import mongoose, { InferSchemaType } from "mongoose";
import { SourceType } from "../types/index.js";

/**
 * Unified entity model for multi-source synchronization
 * Supports Notion, Slack, Calendar, Jira, and future sources
 */
const RecordSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Format: "{source}_{recordType}_{sourceId}"
    source: {
      type: String,
      required: true,
      index: true,
      // No enum constraint - allow any source name for custom MCP servers
    },
    sourceId: { type: String, required: true, index: true }, // Original ID from source
    recordType: { type: String, required: true, index: true }, // 'page' | 'message' | 'event' | 'task' | 'issue' | etc.
    parentId: { type: String, index: true }, // Parent record ID (for threads, conversations, etc.)

    // Grouping support (for parent-child relationships)
    childIds: [{ type: String }], // Array of child record IDs (for parent records created by grouping)
    groupId: { type: String, index: true }, // Group identifier for debugging/tracking
    isParentRecord: { type: Boolean, default: false }, // Flag indicating this is a generated parent record

    // Universal searchable fields (indexed for fast queries)
    title: { type: String, required: true, index: true },
    content: { type: String, required: true }, // Combined searchable text
    people: [{ type: String, index: true }], // Email addresses or user IDs
    primaryDate: { type: Date, index: true }, // Most relevant date for the entity
    tags: [{ type: String, index: true }], // Extracted or explicit tags

    // Raw data (for reconstruction and debugging)
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // SHA-256 of normalized content
    checksum: { type: String, required: true },
    // Incremental version number
    version: { type: Number, default: 1 },
    // Last successful sync
    syncedAt: { type: Date, default: Date.now, index: true },
    // Last update time from source
    sourceUpdatedAt: { type: Date, required: true, index: true },

    // Deletion tracking
    deletedAt: { type: Date },

    // Indexing timestamps
    lastGraphIndexAt: { type: Date }, // Last indexed to graph DB
    lastEmbeddedAt: { type: Date }, // Last embedded to vector DB
    embeddingModelVersion: { type: String }, // Model used for embeddings (e.g., "text-embedding-3-large")
  },
  {
    collection: "records",
    timestamps: true,
    _id: false, // We provide our own _id
  }
);

export type Record = InferSchemaType<typeof RecordSchema>;

// Compound indexes for efficient queries
RecordSchema.index({ source: 1, recordType: 1 });
RecordSchema.index({ source: 1, sourceId: 1 });
RecordSchema.index({ deletedAt: 1, syncedAt: -1 });
RecordSchema.index({ sourceUpdatedAt: -1 });
RecordSchema.index({ content: "text", title: "text" }); // Full-text search

export const RecordModel = mongoose.model<Record>("SyncedRecord", RecordSchema);
