/**
 * Entity Deduplication (Pure Functions)
 * LightRAG-inspired deduplication for knowledge graph extraction
 */

export interface Entity {
  name: string;
  type: string;
  description: string;
}

export interface Relationship {
  source: string;
  target: string;
  type: string;
  strength: number;
  description: string;
  keywords: string[];
}

// ============================================================================
// Pure Functions - Entity Deduplication
// ============================================================================

export const normalizeEntityName = (name: string): string =>
  name.toLowerCase().trim();

export const selectDominantType = (typeCounts: Map<string, number>): string =>
  Array.from(typeCounts.entries()).reduce(
    (max, [type, count]) => (count > max.count ? { type, count } : max),
    { type: "", count: 0 }
  ).type;

export const mergeDescriptions = (descriptions: string[]): string => {
  const unique = [...new Set(descriptions.filter(Boolean))];
  return unique.length > 6
    ? unique.slice(0, 6).join(" ||| ") + " [...]"
    : unique.join(" ||| ");
};

export const deduplicateEntities = (entities: Entity[]): Entity[] => {
  const groups = entities.reduce(
    (map, entity) => {
      const key = normalizeEntityName(entity.name);

      if (!map.has(key)) {
        map.set(key, {
          entity,
          typeCounts: new Map([[entity.type, 1]]),
          descriptions: [entity.description],
        });
      } else {
        const group = map.get(key)!;
        const count = group.typeCounts.get(entity.type) || 0;
        group.typeCounts.set(entity.type, count + 1);

        if (
          entity.description &&
          !group.descriptions.includes(entity.description)
        ) {
          group.descriptions.push(entity.description);
        }
      }

      return map;
    },
    new Map<
      string,
      {
        entity: Entity;
        typeCounts: Map<string, number>;
        descriptions: string[];
      }
    >()
  );

  return Array.from(groups.values()).map((group) => ({
    name: group.entity.name,
    type: selectDominantType(group.typeCounts),
    description: mergeDescriptions(group.descriptions),
  }));
};

// ============================================================================
// Pure Functions - Relationship Merging
// ============================================================================

export const mergeRelationships = (
  relationships: Relationship[]
): Relationship[] => {
  const groups = relationships.reduce((map, rel) => {
    const key = `${normalizeEntityName(rel.source)}|${
      rel.type
    }|${normalizeEntityName(rel.target)}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...rel, strengthSum: rel.strength, count: 1 });
    } else {
      existing.strengthSum += rel.strength;
      existing.count += 1;
      existing.keywords = [...new Set([...existing.keywords, ...rel.keywords])];
    }

    return map;
  }, new Map<string, Relationship & { strengthSum: number; count: number }>());

  return Array.from(groups.values()).map((rel) => ({
    source: rel.source,
    target: rel.target,
    type: rel.type,
    strength: Math.round(rel.strengthSum / rel.count),
    description: rel.description,
    keywords: rel.keywords,
  }));
};
