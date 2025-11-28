/**
 * Graph Conversion (Pure Functions)
 * Convert entities/relationships to minimal graph format
 */

import {
  Entity,
  Relationship,
  normalizeEntityName,
} from "../schema/entity-deduplication.js";

export interface GraphNode {
  id: string; // MongoDB _id only
  checksum: string; // Content checksum
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
 * Convert entities to minimal graph nodes
 * Returns nodes and entity name to ID mapping
 */
export const entitiesToGraphNodes = (
  entities: Entity[],
  recordId: string,
  recordChecksum: string
): { nodes: GraphNode[]; entityNameToId: Map<string, string> } => {
  const entityNameToId = new Map<string, string>();
  const nodes: GraphNode[] = [];

  for (const entity of entities) {
    const nodeId = `${recordId}_${normalizeEntityName(entity.name).replace(
      /\s+/g,
      "_"
    )}`;

    if (!entityNameToId.has(entity.name)) {
      entityNameToId.set(entity.name, nodeId);
      nodes.push({
        id: nodeId,
        checksum: recordChecksum, // Track which record version created this node
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
