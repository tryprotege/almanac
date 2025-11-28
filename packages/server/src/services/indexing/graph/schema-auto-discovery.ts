/**
 * Schema Auto-Discovery
 * Automatically discover and update entity/relationship types during indexing
 */

import {
  GraphEntityType,
  GraphRelationshipType,
  GraphSchema,
} from "../../../models/graph-schema.model.js";
import {
  updateEntityTypes,
  updateRelationshipTypes,
} from "../../../stores/graph-schema.store.js";
import { Entity, Relationship } from "./schema/entity-deduplication.js";

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Discover new entity types from extracted entities
 * Pure function - no side effects
 */
export const discoverNewTypes = (
  entities: Entity[],
  relationships: Relationship[],
  currentSchema: GraphSchema
): {
  newEntityTypes: GraphEntityType[];
  newRelationshipTypes: GraphRelationshipType[];
} => {
  // Extract unique entity types from entities
  const extractedEntityTypes = new Set(entities.map((e) => e.type));

  // Filter to only types not in current schema
  const existingEntityTypes = new Set(
    currentSchema.entityTypes.map((e) => e.name)
  );

  const newEntityTypeNames = Array.from(extractedEntityTypes).filter(
    (type) => !existingEntityTypes.has(type)
  );

  const newEntityTypes: GraphEntityType[] = newEntityTypeNames.map((name) => ({
    name,
    description: `Auto-discovered entity type: ${name}`,
    mcpSource: "auto_discovery",
    properties: [],
  }));

  // Extract unique relationship types from relationships
  const extractedRelTypes = new Set(relationships.map((r) => r.type));

  // Filter to only types not in current schema
  const existingRelTypes = new Set(
    currentSchema.relationshipTypes.map((r) => r.name)
  );

  const newRelTypeNames = Array.from(extractedRelTypes).filter(
    (type) => !existingRelTypes.has(type)
  );

  const newRelationshipTypes: GraphRelationshipType[] = newRelTypeNames.map(
    (name) => ({
      name,
      description: `Auto-discovered relationship type: ${name}`,
      sourceTypes: ["*"], // Accept any source type
      targetTypes: ["*"], // Accept any target type
      bidirectional: false,
      mcpSource: "auto_discovery",
    })
  );

  return {
    newEntityTypes,
    newRelationshipTypes,
  };
};

/**
 * Update schema with auto-discovered types
 * Side effect: Updates schema in database
 */
export const updateSchemaWithDiscovery = async (
  newEntityTypes: GraphEntityType[],
  newRelationshipTypes: GraphRelationshipType[],
  sampleSize?: number
): Promise<{
  entityTypesAdded: number;
  relationshipTypesAdded: number;
}> => {
  let entityTypesAdded = 0;
  let relationshipTypesAdded = 0;

  // Update entity types if any new ones found
  if (newEntityTypes.length > 0) {
    console.log(
      `🔍 Auto-discovered ${newEntityTypes.length} new entity types:`,
      newEntityTypes.map((e) => e.name).join(", ")
    );

    await updateEntityTypes(
      newEntityTypes,
      "auto_discovery_during_indexing",
      sampleSize
    );

    entityTypesAdded = newEntityTypes.length;
  }

  // Update relationship types if any new ones found
  if (newRelationshipTypes.length > 0) {
    console.log(
      `🔍 Auto-discovered ${newRelationshipTypes.length} new relationship types:`,
      newRelationshipTypes.map((r) => r.name).join(", ")
    );

    await updateRelationshipTypes(
      newRelationshipTypes,
      "auto_discovery_during_indexing",
      sampleSize
    );

    relationshipTypesAdded = newRelationshipTypes.length;
  }

  return {
    entityTypesAdded,
    relationshipTypesAdded,
  };
};

/**
 * Get all entity and relationship types from current schema
 * Helper function for indexer
 */
export const getCurrentSchemaTypes = (
  schema: GraphSchema | null
): {
  entityTypes: string[];
  relationshipTypes: string[];
  version: number;
} => {
  if (!schema) {
    return {
      entityTypes: ["Person", "Organization", "Project", "Task", "Document"],
      relationshipTypes: [
        "WORKS_ON",
        "ASSIGNED_TO",
        "MENTIONS",
        "RELATED_TO",
        "BLOCKS",
      ],
      version: 0,
    };
  }

  return {
    entityTypes: schema.entityTypes.map((e) => e.name),
    relationshipTypes: schema.relationshipTypes.map((r) => r.name),
    version: schema.version,
  };
};
