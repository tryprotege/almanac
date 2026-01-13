import crypto from 'crypto';

/**
 * Normalize data for consistent checksum computation
 * Removes timestamps and other volatile fields
 */
export function normalizeForChecksum(data: any): any {
  if (data === null || data === undefined) {
    return null;
  }

  if (Array.isArray(data)) {
    return data.map(normalizeForChecksum).sort((a, b) => {
      const aStr = JSON.stringify(a);
      const bStr = JSON.stringify(b);
      return aStr.localeCompare(bStr);
    });
  }

  if (typeof data === 'object') {
    const normalized: any = {};
    const keys = Object.keys(data).sort();

    for (const key of keys) {
      // Skip volatile fields
      if (
        key === 'last_edited_time' ||
        key === 'created_time' ||
        key === 'indexed_at' ||
        key === 'synced_at' ||
        key === 'updated_at' ||
        key === 'timestamp'
      ) {
        continue;
      }

      normalized[key] = normalizeForChecksum(data[key]);
    }

    return normalized;
  }

  return data;
}

/**
 * Compute SHA-256 checksum of normalized data
 */
export function computeChecksum(data: any): string {
  const normalized = normalizeForChecksum(data);
  const json = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Compute checksums for multiple entities
 */
export function computeChecksums(entities: any[]): Map<string, string> {
  const checksums = new Map<string, string>();

  for (const entity of entities) {
    const id = entity.id || entity._id;
    if (id) {
      checksums.set(id, computeChecksum(entity));
    }
  }

  return checksums;
}

/**
 * Compare two checksums
 */
export function hasChanged(newChecksum: string, existingChecksum: string | null): boolean {
  if (!existingChecksum) return true;
  return newChecksum !== existingChecksum;
}

/**
 * Batch compare checksums
 */
export function detectChanges(
  newChecksums: Map<string, string>,
  existingChecksums: Map<string, string>,
): {
  changed: Set<string>;
  unchanged: Set<string>;
  new: Set<string>;
} {
  const changed = new Set<string>();
  const unchanged = new Set<string>();
  const newEntities = new Set<string>();

  for (const [id, newChecksum] of newChecksums) {
    const existingChecksum = existingChecksums.get(id);

    if (!existingChecksum) {
      newEntities.add(id);
    } else if (newChecksum !== existingChecksum) {
      changed.add(id);
    } else {
      unchanged.add(id);
    }
  }

  return { changed, unchanged, new: newEntities };
}

/**
 * Calculate checksum for embedding content
 * Used to determine if entity/relationship needs re-embedding
 */
export function calculateEmbeddingChecksum(content: {
  text?: string;
  entityType?: string;
  description?: string;
  relationships?: Array<{ type: string; target: string }>;
  sourceId?: string;
  targetId?: string;
  relType?: string;
}): string {
  // Normalize all fields to lowercase and trim whitespace
  const normalized: any = {};

  if (content.text) {
    normalized.text = content.text.toLowerCase().trim();
  }
  if (content.entityType) {
    normalized.entityType = content.entityType.toLowerCase().trim();
  }
  if (content.description) {
    normalized.description = content.description.toLowerCase().trim();
  }
  if (content.relationships && content.relationships.length > 0) {
    // Sort relationships for consistent ordering
    normalized.relationships = content.relationships
      .map((rel) => ({
        type: rel.type.toLowerCase().trim(),
        target: rel.target.toLowerCase().trim(),
      }))
      .sort((a, b) => {
        const aStr = `${a.type}:${a.target}`;
        const bStr = `${b.type}:${b.target}`;
        return aStr.localeCompare(bStr);
      });
  }
  if (content.sourceId) {
    normalized.sourceId = content.sourceId.toLowerCase().trim();
  }
  if (content.targetId) {
    normalized.targetId = content.targetId.toLowerCase().trim();
  }
  if (content.relType) {
    normalized.relType = content.relType.toLowerCase().trim();
  }

  const json = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(json).digest('hex');
}
