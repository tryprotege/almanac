/**
 * Graph ID Generation Utilities
 *
 * These functions provide a single source of truth for generating consistent
 * IDs across the graph indexing and embedding systems.
 */

/**
 * Generate consistent memgraphId for relationships
 * Format: rel_{sourceId}_{relType}_{targetId}
 *
 * IMPORTANT: This is the single source of truth for relationship IDs.
 * Both graph-indexer.ts and relationship-mention.store.ts MUST use this function
 * to ensure MongoDB documents are created/updated consistently.
 *
 * @param sourceEntityId - The source entity's memgraph ID
 * @param relType - The relationship type (e.g., "WORKS_WITH")
 * @param targetEntityId - The target entity's memgraph ID
 * @returns A consistent relationship memgraph ID
 *
 * @example
 * generateRelationshipMemgraphId("entity_123", "WORKS_WITH", "entity_456")
 * // Returns: "rel_entity_123_WORKS_WITH_entity_456"
 */
export function generateRelationshipMemgraphId(
  sourceEntityId: string,
  relType: string,
  targetEntityId: string,
): string {
  return `rel_${sourceEntityId}_${relType}_${targetEntityId}`;
}
