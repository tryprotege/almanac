import {
  GraphSchema,
  DEFAULT_GRAPH_SCHEMA,
  EntityType,
  RelationshipType,
} from "../types/graph-schema.js";
import { GraphSchemaModel } from "../connections/mongoose.js";

/**
 * Graph Schema Store - Single-tenant schema management
 */
export class GraphSchemaStore {
  private readonly SCHEMA_ID = "default";

  /**
   * Get the global schema
   */
  async getSchema(): Promise<GraphSchema | null> {
    return await GraphSchemaModel.findById(this.SCHEMA_ID).exec();
  }

  /**
   * Create the default schema
   */
  async createSchema(): Promise<GraphSchema> {
    const schema = new GraphSchemaModel({
      _id: this.SCHEMA_ID,
      ...DEFAULT_GRAPH_SCHEMA,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return await schema.save();
  }

  /**
   * Get or create schema (ensures schema always exists)
   */
  async getOrCreateSchema(): Promise<GraphSchema> {
    let schema = await this.getSchema();

    if (!schema) {
      schema = await this.createSchema();
    }

    return schema;
  }

  /**
   * Add a new entity type to the schema
   */
  async addEntityType(entityType: EntityType): Promise<GraphSchema | null> {
    return await GraphSchemaModel.findByIdAndUpdate(
      this.SCHEMA_ID,
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
    relationshipType: RelationshipType
  ): Promise<GraphSchema | null> {
    return await GraphSchemaModel.findByIdAndUpdate(
      this.SCHEMA_ID,
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
    entityTypes: EntityType[]
  ): Promise<GraphSchema | null> {
    const schema = await this.getSchema();
    if (!schema) return null;

    // Merge new entity types with existing ones
    const existingNames = new Set(schema.entityTypes.map((e) => e.name));
    const newTypes = entityTypes.filter((e) => !existingNames.has(e.name));

    if (newTypes.length === 0) return schema;

    return await GraphSchemaModel.findByIdAndUpdate(
      this.SCHEMA_ID,
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
    relationshipTypes: RelationshipType[]
  ): Promise<GraphSchema | null> {
    const schema = await this.getSchema();
    if (!schema) return null;

    // Merge new relationship types with existing ones
    const existingNames = new Set(schema.relationshipTypes.map((r) => r.name));
    const newTypes = relationshipTypes.filter(
      (r) => !existingNames.has(r.name)
    );

    if (newTypes.length === 0) return schema;

    return await GraphSchemaModel.findByIdAndUpdate(
      this.SCHEMA_ID,
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

    return await GraphSchemaModel.findByIdAndUpdate(
      this.SCHEMA_ID,
      { $set: updateFields },
      { new: true }
    ).exec();
  }

  /**
   * Reset schema to default
   */
  async resetSchema(): Promise<GraphSchema> {
    await GraphSchemaModel.deleteOne({ _id: this.SCHEMA_ID }).exec();
    return await this.createSchema();
  }

  /**
   * Check if an entity type exists
   */
  async hasEntityType(entityTypeName: string): Promise<boolean> {
    const schema = await this.getSchema();
    return schema?.entityTypes.some((e) => e.name === entityTypeName) || false;
  }

  /**
   * Check if a relationship type exists
   */
  async hasRelationshipType(relationshipTypeName: string): Promise<boolean> {
    const schema = await this.getSchema();
    return (
      schema?.relationshipTypes.some((r) => r.name === relationshipTypeName) ||
      false
    );
  }

  /**
   * Get valid relationship types for a source->target entity pair
   */
  async getValidRelationshipTypes(
    sourceType: string,
    targetType: string
  ): Promise<RelationshipType[]> {
    const schema = await this.getSchema();
    if (!schema) return [];

    return schema.relationshipTypes.filter(
      (rel) =>
        rel.sourceTypes.includes(sourceType) &&
        rel.targetTypes.includes(targetType)
    );
  }
}

// Export with old name for backwards compatibility during migration
export const GraphSchemaRepository = GraphSchemaStore;
