/**
 * Toxic Chunk Detection (Pure Functions)
 * LightRAG-inspired filtering for low-quality content
 */

export interface ToxicChunkConfig {
  minEntitiesThreshold: number;
  maxRelationshipsForToxic: number;
  minAvgNameLength: number;
  maxEntitiesPerDoc: number;
}

const DEFAULT_CONFIG: ToxicChunkConfig = {
  minEntitiesThreshold: 50,
  maxRelationshipsForToxic: 5,
  minAvgNameLength: 20,
  maxEntitiesPerDoc: 200,
};

/**
 * Detect toxic chunks (lists, bibliographies, indexes)
 * Heuristic from LightRAG:
 * - Many entities (>50)
 * - Few relationships (<5) = no semantic structure
 * - Short entity names (<20 chars avg) = list items
 */
export const isToxicChunk = (
  entities: Array<{ name: string }>,
  relationships: Array<any>,
  config: Partial<ToxicChunkConfig> = {}
): boolean => {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Not enough entities to be toxic
  if (entities.length < cfg.minEntitiesThreshold) {
    return false;
  }

  // Has semantic structure (relationships)
  if (relationships.length > cfg.maxRelationshipsForToxic) {
    return false;
  }

  // Check avg name length (short names = likely list items)
  const avgNameLength =
    entities.reduce((sum, e) => sum + e.name.length, 0) / entities.length;

  return avgNameLength < cfg.minAvgNameLength;
};

/**
 * Truncate entities if exceeding max limit
 */
export const truncateEntities = <T>(
  entities: T[],
  maxEntities: number = DEFAULT_CONFIG.maxEntitiesPerDoc
): T[] => {
  if (entities.length > maxEntities) {
    console.warn(
      `⚠️  Truncating ${entities.length} entities to ${maxEntities}`
    );
    return entities.slice(0, maxEntities);
  }
  return entities;
};
