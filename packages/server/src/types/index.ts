/**
 * Core Types - Single Tenant (No Workspace)
 */

// ============================================
// Core Source Types
// ============================================

export type SourceType =
  | "notion"
  | "slack"
  | "calendar"
  | "fathom"
  | "whatsapp"
  | "codebase"
  | "asana"
  | "jira"
  | "google_drive"
  | "github";

// ============================================
// Qdrant (Vector Search)
// ============================================

export type VectorPayloadType = "chunk" | "entity" | "relationship";

export interface ChunkVectorPayload extends Record<string, unknown> {
  type: "chunk";
  mongoId: string;
  checksum: string;
  chunkIndex: number;
  chunkStart: number;
  chunkEnd: number;
}

export interface EntityVectorPayload extends Record<string, unknown> {
  type: "entity";
  mongoId: string; // Links to Record._id
  recordType: string; // meeting, page, issue, etc.
  source: SourceType;
  degree: number; // Graph centrality (cached)
  checksum: string;
}

export interface RelationshipVectorPayload extends Record<string, unknown> {
  type: "relationship";
  sourceId: string;
  targetId: string;
  relType: string;
  confidence: number;
  checksum?: string;
}

export interface VectorPoint {
  id: string; // UUID
  vector: number[]; // Embedding dimensions
  payload: ChunkVectorPayload | EntityVectorPayload | RelationshipVectorPayload;
}

// ============================================
// Memgraph (Knowledge Graph)
// ============================================

export interface MemgraphNode {
  label: string; // Type-based label: "Page", "Task", "Issue", etc.
  id: string; // Same as MongoDB _id
  type: string; // "page", "task", "issue"
  title: string; // For display
}

export interface MemgraphRelationship {
  sourceId: string;
  targetId: string;
  type: string; // "BLOCKS", "REQUIRES", "ASSIGNED_TO", "RELATED_TO"
  confidence: number; // 0.0 - 1.0
}

/**
 * Fetch options for entity adapters
 */
export interface FetchOptions {
  batchSize?: number;
  cursor?: string;
  includeDeleted?: boolean;
}

/**
 * Entity relationship extracted from source data
 */
export interface EntityRelationship {
  sourceId: string;
  targetId: string;
  type: string; // "BLOCKS", "REQUIRES", "ASSIGNED_TO", "RELATED_TO", etc.
  confidence: number; // 0.0 - 1.0
}

// Re-export from new type files
export * from "./search.types.js";
