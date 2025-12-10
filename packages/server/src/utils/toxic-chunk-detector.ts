/**
 * Toxic Chunk Detection (Pure Functions)
 * LightRAG-inspired filtering for low-quality content
 */

import logger from "./logger.js";

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
 * Truncate entities using dynamic limit based on content length
 * Formula: min(contentLength / charsPerEntity, maxEntities)
 * If charsPerEntity or maxEntities are undefined, no limit is applied
 */
export const truncateEntities = <T>({
  entities,
  contentLength,
  charsPerEntity,
  maxEntities,
}: {
  entities: T[];
  contentLength: number;
  charsPerEntity?: number;
  maxEntities?: number;
}): T[] => {
  // If no limits configured, return all entities (logged once in graph-indexer config)
  if (!charsPerEntity && !maxEntities) {
    return entities;
  }

  // Calculate dynamic limit based on content length
  let dynamicLimit: number;

  if (charsPerEntity) {
    // Use ratio-based calculation
    dynamicLimit = Math.ceil(contentLength / charsPerEntity);

    // Apply cap if maxEntities is defined
    if (maxEntities) {
      dynamicLimit = Math.min(dynamicLimit, maxEntities);
    }
  } else if (maxEntities) {
    // Only maxEntities is defined, use it as static limit
    dynamicLimit = maxEntities;
  } else {
    // Should not reach here, but return all entities as fallback
    return entities;
  }

  if (entities.length > dynamicLimit) {
    const limitReason = charsPerEntity
      ? `${contentLength} chars @ 1:${charsPerEntity} ratio`
      : `static limit`;
    const capInfo =
      maxEntities && charsPerEntity ? `, capped at ${maxEntities}` : "";

    logger.warn(
      `⚠️  Truncating ${entities.length} entities to ${dynamicLimit} ` +
        `(${limitReason}${capInfo})`
    );
    return entities.slice(0, dynamicLimit);
  }

  const limitInfo = charsPerEntity
    ? `limit: ${dynamicLimit} from ${contentLength} chars @ 1:${charsPerEntity}`
    : `limit: ${dynamicLimit}`;

  logger.info(`✅ Kept all ${entities.length} entities (${limitInfo})`);

  return entities;
};
