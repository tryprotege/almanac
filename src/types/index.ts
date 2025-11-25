// src/types/index.ts

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
// MongoDB Collections
// ============================================

export interface Workspace {
  _id: string; // e.g., "acme_corp"
  name: string;
  createdAt: Date;
  settings?: Record<string, any>;
}

export interface Connection {
  _id: string;
  workspaceId: string;
  serverId: string; // Maps to MCPServerRegistration.serverId from contracts
  serverType: SourceType;
  status: "active" | "disconnected" | "error";
  connectedAt: Date;
  connectedBy: string;
  metadata?: Record<string, any>;
}

// ============================================
// MongoResource (Main Resource Collection)
// ============================================

export interface MongoResource {
  // Identity
  _id: string; // e.g., "notion_page_abc123"
  workspaceId: string; // e.g., "acme_corp"
  source: SourceType;
  resourceId: string; // Original ID from source
  type: string; // 'page' | 'message' | 'event' | 'call' | 'file' | 'task' | 'issue'

  // Universal searchable fields (extracted for fast queries)
  title: string;
  textContent: string; // Combined searchable text
  people: string[]; // Email addresses
  primaryDate: Date | null;

  // ALL heterogeneous data (flexible schema)
  attributes: Record<string, any>; // All source-specific fields

  // Original API response (for reconstruction)
  rawData: Record<string, any>; // Full MCP tool result

  // Indexing metadata
  qdrantIds?: string[]; // Array of Qdrant point IDs (for chunked documents)
  embeddingVersion: number;
  indexedAt: Date;
  updatedAt: Date;
}

// ============================================
// Qdrant (Ultra-Minimal Vector Search)
// ============================================

export interface QdrantPoint {
  id: string; // UUID
  vector: number[]; // 3584 dimensions (Qwen2-7B)

  payload: {
    mongoId: string; // Reference to MongoDB _id
    workspaceId: string; // For workspace isolation

    // For chunked documents
    chunkIndex?: number; // 0, 1, 2, ... (which chunk)
    chunkStart?: number; // Character offset start
    chunkEnd?: number; // Character offset end
  };
}

// ============================================
// Memgraph (Workspace-Scoped Graph)
// ============================================

export interface MemgraphNode {
  label: string; // Composite: "{workspaceId}_{type}" e.g., "AcmeCorp_Page"
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

export interface ExtractionSchema {
  source: SourceType;
  entityTypes: EntityTypeConfig[];
}

export interface EntityTypeConfig {
  type: string;
  titlePaths: string[]; // JSON paths to extract title
  contentPaths: string[]; // JSON paths to extract content
  peoplePaths: string[]; // JSON paths to extract people
  datePaths: string[]; // JSON paths to extract dates
  relationshipRules: RelationshipRule[];
}

export interface RelationshipRule {
  type: string; // "BLOCKS", "REQUIRES", etc.
  targetType: string; // Target entity type
  pathsToIds: string[]; // JSON paths to find related IDs
  bidirectional?: boolean;
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
// Query Types
// ============================================

export interface SearchRequest {
  workspaceId: string;
  query: string;
  filters?: Record<string, any>; // MongoDB filters
  sources?: SourceType[];
  types?: string[];
  people?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  includeRelationships?: boolean;
}

export interface SearchResult {
  resources: MongoResource[];
  relationships?: MemgraphRelationship[];
  latency: number;
  strategy: "semantic" | "structured" | "graph" | "hybrid";
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate workspace-scoped Memgraph label
 * @example getNodeLabel("acme_corp", "page") => "AcmeCorp_Page"
 */
export function getNodeLabel(workspaceId: string, type: string): string {
  const wsPrefix = workspaceId
    .replace(/-/g, "")
    .replace(/_/g, "")
    .split("")
    .map((char, i) => (i === 0 ? char.toUpperCase() : char))
    .join("");

  const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1);
  return `${wsPrefix}_${typeCapitalized}`;
}

/**
 * Generate MongoDB collection name for workspace resources
 * @example getWorkspaceCollectionName("acme_corp") => "ws_acme_corp_resources"
 */
export function getWorkspaceCollectionName(workspaceId: string): string {
  return `ws_${workspaceId}_resources`;
}

/**
 * Generate MongoDB _id from source and resource ID
 * @example generateMongoId("notion", "page_abc123") => "notion_page_abc123"
 */
export function generateMongoId(
  source: SourceType,
  resourceId: string
): string {
  return `${source}_${resourceId}`;
}
