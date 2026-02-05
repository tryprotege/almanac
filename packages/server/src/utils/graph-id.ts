import { createHash } from 'crypto';

/**
 * Generate a deterministic UUID for an entity based on its name and type
 * This ensures the same entity always gets the same ID across indexing runs
 *
 * @param entityName - The entity's name
 * @param entityType - The entity's type
 * @returns A deterministic UUID string
 *
 * @example
 * generateEntityId("John Doe", "Person")
 * // Returns: same UUID every time for this name+type combination
 */
export function generateEntityId(entityName: string, entityType: string): string {
  // Use crypto.createHash for deterministic UUID generation
  const hash = createHash('sha256')
    .update(`${entityType}:${entityName.toLowerCase().trim()}`)
    .digest('hex');

  // Convert hash to UUID format (8-4-4-4-12)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Generate a deterministic UUID for a relationship based on its source, type, and target
 * This ensures the same relationship always gets the same ID across indexing runs
 *
 * @param sourceEntityId - The source entity's UUID
 * @param relType - The relationship type (e.g., "WORKS_WITH")
 * @param targetEntityId - The target entity's UUID
 * @returns A deterministic UUID string
 *
 * @example
 * generateRelationshipId(sourceId, "WORKS_WITH", targetId)
 * // Returns: same UUID every time for this source+type+target combination
 */
export function generateRelationshipId(
  sourceEntityId: string,
  relType: string,
  targetEntityId: string,
): string {
  const hash = createHash('sha256')
    .update(`${sourceEntityId}:${relType}:${targetEntityId}`)
    .digest('hex');

  // Convert hash to UUID format (8-4-4-4-12)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}
