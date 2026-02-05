/**
 * Graph Conversion (Pure Functions)
 * Convert entities/relationships to minimal graph format
 */

import { Entity, Relationship, normalizeEntityName } from './schema/entity-deduplication.js';
import { generateEntityId } from '../../../utils/graph-id.js';
import logger from '../../../utils/logger.js';

export interface GraphNode {
  id: string; // Global entity ID
  type: string; // Entity type
  title: string; // Entity name/title
  description?: string; // Optional entity description
}

export interface GraphRelationship {
  sourceId: string;
  targetId: string;
  type: string;
  confidence: number; // 0.0-1.0 (LLM strength score)
}

// ============================================================================
// Pure Functions - Graph Conversion
// ============================================================================

/**
 * Generate a global entity ID from name and type
 * Uses deterministic UUID generation to ensure consistent IDs across documents
 * @example generateGlobalEntityId("John Smith", "Person") => "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 */
export const generateGlobalEntityId = (entityName: string, entityType: string): string => {
  // Normalize the entity name first to ensure consistent IDs
  const normalized = normalizeEntityName(entityName);
  return generateEntityId(normalized, entityType);
};

/**
 * Convert entities to global graph nodes
 * Returns nodes and entity name to ID mapping
 * NOTE: No longer scoped to individual records - entities are global
 */
export const entitiesToGraphNodes = (
  entities: Entity[],
): { nodes: GraphNode[]; entityNameToId: Map<string, string> } => {
  const entityNameToId = new Map<string, string>();
  const nodes: GraphNode[] = [];

  for (const entity of entities) {
    // Use global ID instead of record-scoped ID
    const nodeId = generateGlobalEntityId(entity.name, entity.type);

    // Use normalized name as the key to ensure case-insensitive lookups
    const normalizedKey = normalizeEntityName(entity.name);

    if (!entityNameToId.has(normalizedKey)) {
      entityNameToId.set(normalizedKey, nodeId);
      nodes.push({
        id: nodeId,
        type: entity.type,
        title: entity.name,
        description: entity.description,
      });
    }
  }

  return { nodes, entityNameToId };
};

/**
 * Convert relationships to minimal graph relationships
 */
export const relationshipsToGraphRelationships = (
  relationships: Relationship[],
  entityNameToId: Map<string, string>,
): GraphRelationship[] => {
  const validRelationships: GraphRelationship[] = [];
  let skippedCount = 0;

  for (const rel of relationships) {
    // Normalize entity names when looking up IDs to ensure case-insensitive matching
    const normalizedSource = normalizeEntityName(rel.source);
    const normalizedTarget = normalizeEntityName(rel.target);

    const sourceId = entityNameToId.get(normalizedSource);
    const targetId = entityNameToId.get(normalizedTarget);

    if (sourceId && targetId) {
      validRelationships.push({
        sourceId,
        targetId,
        type: rel.type,
        confidence: rel.strength / 10, // Convert 1-10 to 0.1-1.0
      });
    } else {
      skippedCount++;
      if (!sourceId) {
        logger.warn({
          msg: `⚠️  Skipping relationship - source entity not found`,
          relationship: `${rel.source} -[${rel.type}]-> ${rel.target}`,
          originalSource: rel.source,
          normalizedSource,
          availableEntitiesCount: entityNameToId.size,
          sampleKeys: Array.from(entityNameToId.keys()).slice(0, 5),
        });
      }
      if (!targetId) {
        logger.warn({
          msg: `⚠️  Skipping relationship - target entity not found`,
          relationship: `${rel.source} -[${rel.type}]-> ${rel.target}`,
          originalTarget: rel.target,
          normalizedTarget,
          availableEntitiesCount: entityNameToId.size,
          sampleKeys: Array.from(entityNameToId.keys()).slice(0, 5),
        });
      }
    }
  }

  if (skippedCount > 0) {
    logger.warn(`⚠️  Skipped ${skippedCount} relationships due to missing entities`);
  }

  return validRelationships;
};
