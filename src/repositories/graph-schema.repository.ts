import {
  GraphSchema,
  DEFAULT_GRAPH_SCHEMA,
  EntityType,
  RelationshipType,
} from "../types/graph-schema.js";
import { GraphSchemaModel } from "../shared/database/mongoose.js";

/**
 * Repository for managing graph schemas in MongoDB
 */
export class GraphSchemaRepository {
  /**
   * Get schema for a workspace
   */
  async getSchema(workspaceId: string): Promise<GraphSchema | null> {
    return await GraphSchemaModel.findOne({ workspaceId }).exec();
  }

  /**
   * Create a new schema for a workspace
   */
  async createSchema(workspaceId: string): Promise<GraphSchema> {
    const schema = new GraphSchemaModel({
      _id: workspaceId,
      workspaceId,
      ...DEFAULT_GRAPH_SCHEMA,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return await schema.save();
  }

  /**
   * Get or create schema (ensures workspace always has a schema)
   */
  async getOrCreateSchema(workspaceId: string): Promise<GraphSchema> {
    let schema = await this.getSchema(workspaceId);

    if (!schema) {
      schema = await this.createSchema(workspaceId);
    }

    return schema;
  }

  /**
   * Add a new entity type to the schema
   */
  async addEntityType(
    workspaceId: string,
    entityType: EntityType
  ): Promise<GraphSchema | null> {
    return await GraphSchemaModel.findOneAndUpdate(
      { workspaceId },
      {
        $addToSet: { entityTypes: entityType },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    ).exec();
  }

  /**
   * Add a new relationship type to the schema
   */
  async addRelationshipType(
    workspaceId: string,
    relationshipType: RelationshipType
  ): Promise<GraphSchema | null> {
    return await GraphSchemaModel.findOneAndUpdate(
      { workspaceId },
      {
        $addToSet: { relationshipTypes: relationshipType },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    ).exec();
  }

  /**
   * Update entity types (merge with existing)
   */
  async updateEntityTypes(
    workspaceId: string,
    entityTypes: EntityType[]
  ): Promise<GraphSchema | null> {
    const schema = await this.getSchema(workspaceId);
    if (!schema) return null;

    // Merge new entity types with existing ones
    const existingNames = new Set(schema.entityTypes.map((e) => e.name));
    const newTypes = entityTypes.filter((e) => !existingNames.has(e.name));

    if (newTypes.length === 0) return schema;

    return await GraphSchemaModel.findOneAndUpdate(
      { workspaceId },
      {
        $push: { entityTypes: { $each: newTypes } },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    ).exec();
  }

  /**
   * Update relationship types (merge with existing)
   */
  async updateRelationshipTypes(
    workspaceId: string,
    relationshipTypes: RelationshipType[]
  ): Promise<GraphSchema | null> {
    const schema = await this.getSchema(workspaceId);
    if (!schema) return null;

    // Merge new relationship types with existing ones
    const existingNames = new Set(schema.relationshipTypes.map((r) => r.name));
    const newTypes = relationshipTypes.filter(
      (r) => !existingNames.has(r.name)
    );

    if (newTypes.length === 0) return schema;

    return await GraphSchemaModel.findOneAndUpdate(
      { workspaceId },
      {
        $push: { relationshipTypes: { $each: newTypes } },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    ).exec();
  }

  /**
   * Update extraction rules
   */
  async updateExtractionRules(
    workspaceId: string,
    rules: Partial<{
      autoExtractEntities: boolean;
      autoExtractRelationships: boolean;
      confidenceThreshold: number;
    }>
  ): Promise<GraphSchema | null> {
    const updateFields: any = { updatedAt: new Date() };

    if (rules.autoExtractEntities !== undefined) {
      updateFields["extractionRules.autoExtractEntities"] =
        rules.autoExtractEntities;
    }
    if (rules.autoExtractRelationships !== undefined) {
      updateFields["extractionRules.autoExtractRelationships"] =
        rules.autoExtractRelationships;
    }
    if (rules.confidenceThreshold !== undefined) {
      updateFields["extractionRules.confidenceThreshold"] =
        rules.confidenceThreshold;
    }

    return await GraphSchemaModel.findOneAndUpdate(
      { workspaceId },
      { $set: updateFields },
      { new: true }
    ).exec();
  }

  /**
   * Delete schema for a workspace
   */
  async deleteSchema(workspaceId: string): Promise<boolean> {
    const result = await GraphSchemaModel.deleteOne({ workspaceId }).exec();
    return result.deletedCount > 0;
  }

  /**
   * List all schemas
   */
  async listSchemas(): Promise<GraphSchema[]> {
    return await GraphSchemaModel.find().exec();
  }

  /**
   * Check if an entity type exists
   */
  async hasEntityType(
    workspaceId: string,
    entityTypeName: string
  ): Promise<boolean> {
    const schema = await this.getSchema(workspaceId);
    return schema?.entityTypes.some((e) => e.name === entityTypeName) || false;
  }

  /**
   * Check if a relationship type exists
   */
  async hasRelationshipType(
    workspaceId: string,
    relationshipTypeName: string
  ): Promise<boolean> {
    const schema = await this.getSchema(workspaceId);
    return (
      schema?.relationshipTypes.some((r) => r.name === relationshipTypeName) ||
      false
    );
  }

  /**
   * Get valid relationship types for a source->target entity pair
   */
  async getValidRelationshipTypes(
    workspaceId: string,
    sourceType: string,
    targetType: string
  ): Promise<RelationshipType[]> {
    const schema = await this.getSchema(workspaceId);
    if (!schema) return [];

    return schema.relationshipTypes.filter(
      (rel) =>
        rel.sourceTypes.includes(sourceType) &&
        rel.targetTypes.includes(targetType)
    );
  }
}
