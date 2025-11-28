import { GraphSchemaModel } from "../connections/mongoose.js";
import {
  GraphEntityType,
  GraphSchema,
  GraphRelationshipType,
} from "../models/graph-schema.model.js";

// TODO: Add REST API CRUD endpoints for persona management:
// - GET /api/schema/persona - Get current persona
// - PUT /api/schema/persona - Update persona
// - DELETE /api/schema/persona - Clear persona

// ============================================================================
// Constants
// ============================================================================

const SCHEMA_ID = "default";

// ============================================================================
// Core Schema Functions
// ============================================================================

/**
 * Get the global schema
 */
export async function getSchema(): Promise<GraphSchema | null> {
  return await GraphSchemaModel.findById(SCHEMA_ID).exec();
}

/**
 * Create the default schema
 */
export async function createSchema(): Promise<GraphSchema> {
  const schema = new GraphSchemaModel({
    _id: SCHEMA_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return await schema.save();
}

/**
 * Reset schema to default
 */
export async function resetSchema(): Promise<GraphSchema> {
  await GraphSchemaModel.deleteOne({ _id: SCHEMA_ID }).exec();
  return await createSchema();
}

// ============================================================================
// Entity Type Functions
// ============================================================================

/**
 * Add a new entity type to the schema
 */
export async function addEntityType(
  entityType: GraphEntityType
): Promise<GraphSchema | null> {
  return await GraphSchemaModel.findByIdAndUpdate(
    SCHEMA_ID,
    {
      $addToSet: { entityTypes: entityType },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  ).exec();
}

/**
 * Update entity types with version tracking
 */
export async function updateEntityTypes(
  newTypes: GraphEntityType[],
  reason: string,
  sampleSize?: number
): Promise<GraphSchema | null> {
  const schema = await getSchema();
  if (!schema) return null;

  const existingNames = new Set(schema.entityTypes.map((e) => e.name));
  const typesToAdd = newTypes.filter((e) => !existingNames.has(e.name));

  if (typesToAdd.length === 0) return schema;

  const newVersion = schema.version + 1;
  const newTotalEntityTypes = schema.entityTypes.length + typesToAdd.length;

  return await GraphSchemaModel.findByIdAndUpdate(
    SCHEMA_ID,
    {
      $push: {
        entityTypes: { $each: typesToAdd },
        schemaUpdateHistory: {
          $each: [
            {
              version: newVersion,
              updatedAt: new Date(),
              reason,
              entityTypesAdded: typesToAdd.length,
              relationshipTypesAdded: 0,
              totalEntityTypes: newTotalEntityTypes,
              totalRelationshipTypes: schema.relationshipTypes.length,
            },
          ],
          $slice: -20, // Keep last 20 history entries
        },
      },
      $set: {
        version: newVersion,
        lastLearnedAt: new Date(),
        learnedFromSampleSize: sampleSize,
        updatedAt: new Date(),
      },
    },
    { new: true }
  ).exec();
}

/**
 * Check if an entity type exists
 */
export async function hasEntityType(entityTypeName: string): Promise<boolean> {
  const schema = await getSchema();
  return schema?.entityTypes.some((e) => e.name === entityTypeName) || false;
}

// ============================================================================
// Relationship Type Functions
// ============================================================================

/**
 * Add a new relationship type to the schema
 */
export async function addRelationshipType(
  relationshipType: GraphRelationshipType
): Promise<GraphSchema | null> {
  return await GraphSchemaModel.findByIdAndUpdate(
    SCHEMA_ID,
    {
      $addToSet: { relationshipTypes: relationshipType },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  ).exec();
}

/**
 * Update relationship types with version tracking
 */
export async function updateRelationshipTypes(
  newTypes: GraphRelationshipType[],
  reason: string,
  sampleSize?: number
): Promise<GraphSchema | null> {
  const schema = await getSchema();
  if (!schema) return null;

  const existingNames = new Set(schema.relationshipTypes.map((r) => r.name));
  const typesToAdd = newTypes.filter((r) => !existingNames.has(r.name));

  if (typesToAdd.length === 0) return schema;

  const newVersion = schema.version + 1;
  const newTotalRelTypes = schema.relationshipTypes.length + typesToAdd.length;

  return await GraphSchemaModel.findByIdAndUpdate(
    SCHEMA_ID,
    {
      $push: {
        relationshipTypes: { $each: typesToAdd },
        schemaUpdateHistory: {
          $each: [
            {
              version: newVersion,
              updatedAt: new Date(),
              reason,
              entityTypesAdded: 0,
              relationshipTypesAdded: typesToAdd.length,
              totalEntityTypes: schema.entityTypes.length,
              totalRelationshipTypes: newTotalRelTypes,
            },
          ],
          $slice: -20,
        },
      },
      $set: {
        version: newVersion,
        lastLearnedAt: new Date(),
        learnedFromSampleSize: sampleSize,
        updatedAt: new Date(),
      },
    },
    { new: true }
  ).exec();
}

/**
 * Check if a relationship type exists
 */
export async function hasRelationshipType(
  relationshipTypeName: string
): Promise<boolean> {
  const schema = await getSchema();
  return (
    schema?.relationshipTypes.some((r) => r.name === relationshipTypeName) ||
    false
  );
}

/**
 * Get valid relationship types for a source->target entity pair
 */
export async function getValidRelationshipTypes(
  sourceType: string,
  targetType: string
): Promise<GraphRelationshipType[]> {
  const schema = await getSchema();
  if (!schema) return [];

  return schema.relationshipTypes.filter(
    (rel) =>
      rel.sourceTypes.includes(sourceType) &&
      rel.targetTypes.includes(targetType)
  );
}

// ============================================================================
// Persona Functions
// ============================================================================

/**
 * Update the persona for AI schema learning
 */
export async function updatePersona(
  persona: string
): Promise<GraphSchema | null> {
  return await GraphSchemaModel.findByIdAndUpdate(
    SCHEMA_ID,
    { $set: { persona, updatedAt: new Date() } },
    { new: true }
  ).exec();
}

/**
 * Get the current persona
 */
export async function getPersona(): Promise<string | null> {
  const schema = await getSchema();
  return schema?.persona || null;
}
