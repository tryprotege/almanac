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
  extractedBy: "explicit" | "llm" | "heuristic";
  metadata?: Record<string, any>;
}
