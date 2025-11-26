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
  | "google_drive";

// ============================================
// Qdrant (Vector Search)
// ============================================

export interface QdrantPoint {
  id: string; // UUID
  vector: number[]; // Embedding dimensions

  payload: {
    mongoId: string; // Reference to MongoDB _id
    checksum: string; // Record checksum

    // For chunked documents
    chunkIndex?: number; // 0, 1, 2, ... (which chunk)
    chunkStart?: number; // Character offset start
    chunkEnd?: number; // Character offset end
  };
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
  extractedBy: "explicit" | "llm" | "heuristic";
  metadata?: Record<string, any>;
}

// ============================================
// Extraction Pipeline Types
// ============================================

export interface ExtractedResource {
  id: string;
  source: SourceType;
  resourceId: string;
  type: string;
  title: string;
  textContent: string;
  people: string[];
  primaryDate: Date | null;
  attributes: Record<string, any>;
  relationships: MemgraphRelationship[];
  rawData: Record<string, any>;
}

// ============================================
// Chunking Types
// ============================================

export interface DocumentChunk {
  index: number;
  text: string;
  start: number; // Character offset in original document
  end: number;
}

export interface ChunkingStrategy {
  maxChunkSize: number; // Characters per chunk
  overlapSize: number; // Overlap between chunks
  splitOn?: "paragraph" | "sentence" | "token";
}

// ============================================
// Graph Schema Types
// ============================================

// Re-export from new type files
export * from "./indexing.types.js";
export * from "./search.types.js";
