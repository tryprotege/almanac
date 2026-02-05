/**
 * Type definitions for graph indexing
 */

import { SourceType } from '../../../types/index.js';

// ============================================================================
// Entity & Relationship Types
// ============================================================================

export interface Entity {
  name: string;
  type: string;
  description: string;
}

export interface Relationship {
  source: string;
  target: string;
  type: string;
  description: string;
  strength: number;
}

// ============================================================================
// Graph Node & Relationship Types
// ============================================================================

export interface GraphNode {
  id: string;
  type: string;
  title: string;
  description?: string;
}

export interface GraphRelationship {
  sourceId: string;
  targetId: string;
  type: string;
  confidence: number;
}

export interface DocumentRelationship {
  sourceId: string;
  targetId: string;
  type: string;
  confidence: number;
}

// ============================================================================
// Extraction Types
// ============================================================================

export interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
  adapterRelationships: GraphRelationship[];
  recordId: string;
  recordChecksum: string;
  wasFilteredAsToxic?: boolean;
}

export interface ExtractionOptions {
  enableToxicFilter?: boolean;
  maxEntitiesPerDoc?: number;
  force?: boolean;
}

// ============================================================================
// Indexing Types
// ============================================================================

export interface IndexingOptions {
  recordType?: string;
  batchSize?: number;
  concurrency?: number;
  enableToxicFilter?: boolean;
  maxEntitiesPerDoc?: number;
  force?: boolean;
  limit?: number;
}

export interface IndexingStats {
  nodes: number;
  relationships: number;
  errors: number;
  skippedToxic: number;
  emptyExtractions: number;
  processedRecords: number;
  failedRecords: number;
  successfulRecords: number;
  totalRuntimeMs: number;
  avgTimePerDocMs: number;
  avgBatchTimeMs: number;
  throughputDocsPerSec: number;
}

// ============================================================================
// Graph Processing Types
// ============================================================================

export interface ProcessedGraph {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  documentRelationships: DocumentRelationship[];
  entityNameToId: Map<string, string>;
  entityIdToType: Map<string, string>;
}

// ============================================================================
// Persistence Types
// ============================================================================

export interface EntityMetadata {
  id: string;
  type: string;
  description: string;
  source: SourceType;
  contentChecksum: string;
  sourceRecordIds: string[];
}

export interface RelationshipMetadata {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  description?: string;
  source: SourceType;
  contentChecksum: string;
  sourceRecordIds: string[];
}

export interface DocumentNode {
  id: string;
  title: string;
  source: SourceType;
}

export interface EntityLink {
  entityId: string;
  recordId: string;
}

export interface RelationshipLink {
  recordId: string;
  relationshipType: string;
  sourceEntityId: string;
  targetEntityId: string;
  confidence: number;
}
