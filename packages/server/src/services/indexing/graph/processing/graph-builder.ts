/**
 * Pure function to process extraction results into graph format
 * No side effects - just data transformation
 */

import {
  Entity,
  ExtractionResult,
  GraphNode,
  DocumentRelationship,
  ProcessedGraph,
} from "../types.js";
import {
  mergeRelationships,
  normalizeEntityName,
} from "../schema/entity-deduplication.js";
import {
  entitiesToGraphNodes,
  relationshipsToGraphRelationships,
} from "../graph-converter.js";
import logger from "../../../../utils/logger.js";

/**
 * High-value entity types that should be preserved even without relationships
 * These entities are considered important enough to exist standalone
 */
const HIGH_VALUE_ENTITY_TYPES = new Set([
  "PERSON",
  "ORGANIZATION",
  "COMPANY",
  "LOCATION",
  "PRODUCT",
  "PROJECT",
]);

/**
 * Minimum description length for standalone entities
 * Entities with substantial descriptions may be valuable even without relationships
 */
const MIN_DESCRIPTION_LENGTH = 50;

/**
 * Check if an entity should be preserved even without relationships
 */
const shouldPreserveEntity = (entity: Entity): boolean => {
  // Preserve high-value entity types
  if (HIGH_VALUE_ENTITY_TYPES.has(entity.type.toUpperCase())) {
    return true;
  }

  // Preserve entities with substantial descriptions
  if (
    entity.description &&
    entity.description.length >= MIN_DESCRIPTION_LENGTH
  ) {
    return true;
  }

  return false;
};

/**
 * Process batch of extraction results to graph format
 * Pure function - no side effects
 * Returns entity mappings for consistent ID generation
 * Now includes orphan prevention logic
 *
 * Returns document relationships separately from entity relationships
 */
export function processRecordsToGraph(
  recordsData: ExtractionResult[]
): ProcessedGraph {
  // Flatten all relationships
  const allRelationships = recordsData.flatMap((data) => data.relationships);

  // Merge relationships
  const mergedRelationships = mergeRelationships(allRelationships);

  // Build a set of entity names that have at least one valid relationship
  const entitiesWithRelationships = new Set<string>();
  for (const rel of mergedRelationships) {
    const normalizedSource = normalizeEntityName(rel.source);
    const normalizedTarget = normalizeEntityName(rel.target);
    entitiesWithRelationships.add(normalizedSource);
    entitiesWithRelationships.add(normalizedTarget);
  }

  // Convert to graph format
  // We need to map entity names to node IDs across all records
  const entityNameToId = new Map<string, string>();
  const entityIdToType = new Map<string, string>();
  const nodes: GraphNode[] = [];

  // Track orphan prevention stats
  let preventedOrphanCount = 0;
  const preventedEntities: Array<{
    name: string;
    type: string;
    reason: string;
  }> = [];

  // First pass: collect all unique entities (now global, not per-record)
  // Filter out entities that would become orphans
  for (const data of recordsData) {
    const allEntities = data.entities;

    // Filter entities: only include if they have relationships OR are high-value
    const connectedEntities = allEntities.filter((entity) => {
      const normalizedName = normalizeEntityName(entity.name);
      const hasRelationships = entitiesWithRelationships.has(normalizedName);
      const shouldPreserve = shouldPreserveEntity(entity);

      if (!hasRelationships && !shouldPreserve) {
        preventedOrphanCount++;
        preventedEntities.push({
          name: entity.name,
          type: entity.type,
          reason: "No valid relationships and not a high-value entity type",
        });
        return false;
      }

      return true;
    });

    const { nodes: recordNodes, entityNameToId: recordMapping } =
      entitiesToGraphNodes(connectedEntities);

    // Merge mappings and nodes (deduplication happens naturally with global IDs)
    for (const [name, id] of recordMapping.entries()) {
      if (!entityNameToId.has(name)) {
        entityNameToId.set(name, id);
        const node = recordNodes.find((n) => n.id === id)!;
        nodes.push(node);
        entityIdToType.set(id, node.type);
      }
    }
  }

  // Log orphan prevention results
  if (preventedOrphanCount > 0) {
    logger.info({
      msg: `🛡️  Prevented creation of ${preventedOrphanCount} entities that would become orphans`,
      preventedCount: preventedOrphanCount,
      entities: preventedEntities.slice(0, 50), // Show up to 50 prevented entities
      totalPrevented: preventedOrphanCount,
    });
  }

  // Convert LLM relationships to graph relationships (entity-to-entity)
  const llmGraphRels = relationshipsToGraphRelationships(
    mergedRelationships,
    entityNameToId
  );

  // Collect adapter relationships (document-to-document)
  // These are kept separate and will be processed differently
  const allAdapterRels = recordsData.flatMap(
    (data) => data.adapterRelationships
  );

  // Convert adapter relationships from GraphRelationship[] to DocumentRelationship[]
  const documentRelationships: DocumentRelationship[] = allAdapterRels.map(
    (rel) => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type,
      confidence: rel.confidence,
    })
  );

  return {
    nodes,
    relationships: llmGraphRels, // Only entity relationships
    documentRelationships, // Document-to-document relationships (separate)
    entityNameToId,
    entityIdToType,
  };
}
