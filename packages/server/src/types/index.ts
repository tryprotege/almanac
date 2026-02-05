/**
 * Core Types - Single Tenant (No Workspace)
 */

// ============================================
// Core Source Types
// ============================================

export type SourceType =
  | 'notion'
  | 'slack'
  | 'calendar'
  | 'fathom'
  | 'whatsapp'
  | 'codebase'
  | 'asana'
  | 'jira'
  | 'google_drive'
  | 'github';

// ============================================
// Qdrant (Vector Search)
// ============================================
//
// UNIVERSAL UUID SYSTEM:
// The system uses a universal UUID where the same UUID is used across:
// - MongoDB _id (GraphEmbeddingMetadata document ID)
// - Memgraph node/relationship ID
// - Qdrant vector point ID
//
// This simplifies ID management and eliminates the need for ID mapping between systems.
//
// ============================================

export type VectorPayloadType = 'chunk' | 'entity' | 'relationship';

export interface ChunkVectorPayload extends Record<string, unknown> {
  type: 'chunk';
  recordId: string;
  checksum: string;
  chunkIndex: number;
  chunkStart: number;
  chunkEnd: number;
}

export interface EntityVectorPayload extends Record<string, unknown> {
  type: 'entity';
  entityId: string; // Universal UUID - same as MongoDB _id, Memgraph node ID, and Qdrant point ID
  // Shared fields
  source: SourceType;
  checksum: string;
}

export interface RelationshipVectorPayload extends Record<string, unknown> {
  type: 'relationship';
  sourceEntityId: string; // Universal UUID of source entity
  targetEntityId: string; // Universal UUID of target entity
  relType: string;
  confidence: number;
  checksum?: string;
}

export interface VectorPoint {
  id: string; // Universal UUID - same as MongoDB _id, Memgraph node/relationship ID
  vector: number[]; // Embedding dimensions
  payload: ChunkVectorPayload | EntityVectorPayload | RelationshipVectorPayload;
}

// ============================================
// Memgraph (Knowledge Graph)
// ============================================
//
// UNIVERSAL UUID SYSTEM:
// Node and relationship IDs use the same UUID as:
// - MongoDB _id (GraphEmbeddingMetadata document ID)
// - Qdrant vector point ID
//
// This enables seamless cross-system queries without ID mapping.
//
// ============================================

export interface MemgraphNode {
  label: string; // Type-based label: "Page", "Task", "Issue", etc.
  id: string; // Universal UUID - same as MongoDB _id and Qdrant point ID
  type: string; // "page", "task", "issue"
  title: string; // For display
}

export interface MemgraphRelationship {
  sourceId: string; // Universal UUID of source entity
  targetId: string; // Universal UUID of target entity
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
 * Document-to-Document relationship (structural links from adapters)
 * These link MongoDB records to each other (e.g., transcript to meeting, page to database)
 * IDs use the record ID format: {source}_{type}_{id}
 */
export interface DocumentRelationship {
  sourceId: string; // MongoDB record ID (e.g., "fathom_transcript_123")
  targetId: string; // MongoDB record ID (e.g., "fathom_meeting_456")
  type: string; // "TRANSCRIPT_OF", "CHILD_OF", "ROW_OF", etc.
  confidence: number; // 0.0 - 1.0
}

/**
 * Entity relationship extracted from source data
 * @deprecated Use DocumentRelationship for adapter relationships
 * This type is still used for backwards compatibility but will be removed
 */
export interface EntityRelationship {
  sourceId: string;
  targetId: string;
  type: string; // "BLOCKS", "REQUIRES", "ASSIGNED_TO", "RELATED_TO", etc.
  confidence: number; // 0.0 - 1.0
}

// Re-export from new type files
export * from './search.types.js';
