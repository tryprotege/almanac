/**
 * Graph Conversion (Pure Functions)
 * Convert entities/relationships to minimal graph format
 */

import {
  Entity,
  Relationship,
  normalizeEntityName,
} from "./schema/entity-deduplication.js";

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
 * Uses normalization to ensure consistent IDs across documents
 * @example generateGlobalEntityId("John Smith", "Person") => "entity_person_john_smith"
 */
export const generateGlobalEntityId = (
  entityName: string,
  entityType: string
): string => {
  const normalized = normalizeEntityName(entityName).replace(/\s+/g, "_");
  return `entity_${entityType.toLowerCase()}_${normalized}`;
};

/**
 * Convert entities to global graph nodes
 * Returns nodes and entity name to ID mapping
 * NOTE: No longer scoped to individual records - entities are global
 */
export const entitiesToGraphNodes = (
  entities: Entity[]
): { nodes: GraphNode[]; entityNameToId: Map<string, string> } => {
  const entityNameToId = new Map<string, string>();
  const nodes: GraphNode[] = [];

  for (const entity of entities) {
    // Use global ID instead of record-scoped ID
    const nodeId = generateGlobalEntityId(entity.name, entity.type);

    if (!entityNameToId.has(entity.name)) {
      entityNameToId.set(entity.name, nodeId);
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
  entityNameToId: Map<string, string>
): GraphRelationship[] =>
  relationships
    .map((rel) => {
      const sourceId = entityNameToId.get(rel.source);
      const targetId = entityNameToId.get(rel.target);

      return sourceId && targetId
        ? {
            sourceId,
            targetId,
            type: rel.type,
            confidence: rel.strength / 10, // Convert 1-10 to 0.1-1.0
          }
        : null;
    })
    .filter((rel): rel is GraphRelationship => rel !== null);
