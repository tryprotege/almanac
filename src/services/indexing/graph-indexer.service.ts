import { RecordStore } from "../../stores/record.store.js";
import { GraphStore } from "../../stores/graph.store.js";
import { Record } from "../../models/record.model.js";
import { SourceType } from "../../types/index.js";
import { BaseEntityAdapter } from "./adapters/base-adapter.js";
import { MemgraphNode, MemgraphRelationship } from "../../types/index.js";

/**
 * Graph Indexer Service
 * Post-processes MongoDB entities into Memgraph graph database
 * Handles node creation and relationship extraction
 */
export class GraphIndexerService {
  constructor(
    private entityStore: RecordStore,
    private graphStore: GraphStore,
    private adapters: Map<SourceType, BaseEntityAdapter>
  ) {}

  /**
   * Index all entities from a source into Memgraph
   */
  async indexAll(
    source: SourceType,
    options?: {
      entityType?: string;
      batchSize?: number;
      includeRelationships?: boolean;
    }
  ): Promise<{
    nodes: number;
    relationships: number;
    errors: number;
  }> {
    const batchSize = options?.batchSize || 100;
    const includeRelationships = options?.includeRelationships ?? true;

    const stats = {
      nodes: 0,
      relationships: 0,
      errors: 0,
    };

    console.log(`🔄 Starting graph indexing for source: ${source}`);

    let skip = 0;
    let hasMore = true;

    // First pass: Create all nodes
    while (hasMore) {
      const entities = await this.entityStore.findBySourceAndType(
        source,
        options?.entityType || "",
        { limit: batchSize, skip, includeDeleted: false }
      );

      if (entities.length === 0) {
        hasMore = false;
        break;
      }

      try {
        // Create nodes in batch
        const nodes = entities.map((entity) => this.entityToNode(entity));
        await this.graphStore.createNodes(nodes);
        stats.nodes += nodes.length;

        // Update entities with graph node IDs
        for (const entity of entities) {
          await this.entityStore.upsert({
            _id: entity._id,
            graphNodeId: entity._id,
          });
        }
      } catch (error) {
        console.error(`❌ Error creating nodes for batch:`, error);
        stats.errors++;
      }

      skip += entities.length;
      console.log(`📊 Progress: ${stats.nodes} nodes created`);
    }

    // Second pass: Create relationships
    if (includeRelationships) {
      console.log(`🔗 Extracting relationships...`);
      skip = 0;
      hasMore = true;

      while (hasMore) {
        const entities = await this.entityStore.findBySourceAndType(
          source,
          options?.entityType || "",
          { limit: batchSize, skip, includeDeleted: false }
        );

        if (entities.length === 0) {
          hasMore = false;
          break;
        }

        try {
          const relationships = await this.extractRelationshipsFromEntities(
            entities,
            source
          );
          if (relationships.length > 0) {
            await this.graphStore.createRelationships(relationships);
            stats.relationships += relationships.length;
          }
        } catch (error) {
          console.error(
            `❌ Error creating relationships for batch:`,
            error instanceof Error ? error.message : error
          );
          stats.errors++;
        }

        skip += entities.length;
        console.log(
          `📊 Progress: ${stats.relationships} relationships created`
        );
      }
    }

    console.log(`✅ Graph indexing complete for ${source}`);
    console.log(`   Nodes: ${stats.nodes}`);
    console.log(`   Relationships: ${stats.relationships}`);
    console.log(`   Errors: ${stats.errors}`);

    return stats;
  }

  /**
   * Index a single entity into Memgraph
   */
  async indexEntity(
    entity: Record,
    options?: {
      includeRelationships?: boolean;
    }
  ): Promise<{
    nodeId: string;
    relationships: number;
  }> {
    const includeRelationships = options?.includeRelationships ?? true;

    // Create node
    const node = this.entityToNode(entity);
    await this.graphStore.createNode(node);

    // Update entity with graph node ID
    await this.entityStore.upsert({
      _id: entity._id,
      graphNodeId: entity._id,
    });

    let relationshipCount = 0;

    // Extract and create relationships
    if (includeRelationships) {
      const relationships = await this.extractRelationshipsFromEntities(
        [entity],
        entity.source
      );
      if (relationships.length > 0) {
        await this.graphStore.createRelationships(relationships);
        relationshipCount = relationships.length;
      }
    }

    return {
      nodeId: entity._id,
      relationships: relationshipCount,
    };
  }

  /**
   * Index specific entities by IDs
   */
  async indexByIds(
    ids: string[],
    options?: {
      includeRelationships?: boolean;
    }
  ): Promise<{
    nodes: number;
    relationships: number;
    errors: number;
  }> {
    const stats = {
      nodes: 0,
      relationships: 0,
      errors: 0,
    };

    console.log(`🔄 Indexing ${ids.length} entities by ID`);

    const entities = await this.entityStore.findByIds(ids);

    // Create nodes
    for (const entity of entities) {
      try {
        const result = await this.indexEntity(entity, options);
        stats.nodes++;
        stats.relationships += result.relationships;
      } catch (error) {
        console.error(
          `❌ Error indexing entity ${entity._id}:`,
          error instanceof Error ? error.message : error
        );
        stats.errors++;
      }
    }

    console.log(
      `✅ Indexed ${stats.nodes} nodes with ${stats.relationships} relationships`
    );
    return stats;
  }

  /**
   * Convert entity to graph node
   */
  private entityToNode(entity: Record): MemgraphNode {
    return {
      label: entity.recordType.toUpperCase(),
      id: entity._id,
      type: entity.recordType,
      title: entity.title,
    };
  }

  /**
   * Extract relationships from entities using their adapters
   */
  private async extractRelationshipsFromEntities(
    entities: Record[],
    source: SourceType
  ): Promise<MemgraphRelationship[]> {
    const adapter = this.adapters.get(source);
    if (!adapter) {
      console.warn(`No adapter found for source: ${source}`);
      return [];
    }

    const relationships: MemgraphRelationship[] = [];

    for (const entity of entities) {
      try {
        // Use the raw data to extract relationships via adapter
        const sourceEntity = entity.rawData;
        const entityRelationships = await adapter.extractRelationships(
          sourceEntity
        );

        // Convert to Memgraph relationships
        // The sourceId and targetId from adapter are already in the format we need
        for (const rel of entityRelationships) {
          relationships.push({
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
            confidence: rel.confidence || 1.0,
            extractedBy: rel.extractedBy || "explicit",
          });
        }
      } catch (error) {
        console.error(
          `Error extracting relationships for entity ${entity._id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    return relationships;
  }

  /**
   * Delete node for deleted entity
   */
  async deleteNode(entityId: string): Promise<void> {
    await this.graphStore.deleteNode(entityId);

    // Clear graph node ID from entity
    const entity = await this.entityStore.findById(entityId);
    if (entity) {
      await this.entityStore.upsert({
        _id: entityId,
        graphNodeId: "",
      });
    }
  }

  /**
   * Clean up nodes for deleted entities
   */
  async cleanupDeletedEntities(source: SourceType): Promise<number> {
    console.log(
      `🧹 Cleaning up graph nodes for deleted entities from ${source}`
    );

    const deletedEntities = await this.entityStore.findBySourceAndType(
      source,
      "",
      { includeDeleted: true }
    );

    const deleted = deletedEntities.filter((e) => e.isDeleted && e.graphNodeId);
    let cleaned = 0;

    for (const entity of deleted) {
      try {
        await this.graphStore.deleteNode(entity.graphNodeId);
        cleaned++;

        // Clear graph node ID
        await this.entityStore.upsert({
          _id: entity._id,
          graphNodeId: "",
        });
      } catch (error) {
        console.error(
          `Error deleting node for entity ${entity._id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log(
      `✅ Cleaned up ${cleaned} nodes from ${deleted.length} deleted entities`
    );
    return cleaned;
  }

  /**
   * Rebuild relationships for a source
   * Useful after schema changes or relationship extraction improvements
   */
  async rebuildRelationships(
    source: SourceType,
    options?: {
      entityType?: string;
      batchSize?: number;
    }
  ): Promise<{
    relationships: number;
    errors: number;
  }> {
    const batchSize = options?.batchSize || 100;
    const stats = {
      relationships: 0,
      errors: 0,
    };

    console.log(`🔄 Rebuilding relationships for source: ${source}`);

    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const entities = await this.entityStore.findBySourceAndType(
        source,
        options?.entityType || "",
        { limit: batchSize, skip, includeDeleted: false }
      );

      if (entities.length === 0) {
        hasMore = false;
        break;
      }

      try {
        const relationships = await this.extractRelationshipsFromEntities(
          entities,
          source
        );
        if (relationships.length > 0) {
          await this.graphStore.createRelationships(relationships);
          stats.relationships += relationships.length;
        }
      } catch (error) {
        console.error(
          `❌ Error rebuilding relationships for batch:`,
          error instanceof Error ? error.message : error
        );
        stats.errors++;
      }

      skip += entities.length;
      console.log(`📊 Progress: ${stats.relationships} relationships rebuilt`);
    }

    console.log(`✅ Relationship rebuild complete`);
    console.log(`   Relationships: ${stats.relationships}`);
    console.log(`   Errors: ${stats.errors}`);

    return stats;
  }

  /**
   * Get indexing statistics
   */
  async getStats(source: SourceType): Promise<{
    totalEntities: number;
    indexedNodes: number;
    notIndexed: number;
  }> {
    const entities = await this.entityStore.findBySourceAndType(source, "", {
      includeDeleted: false,
    });

    const indexed = entities.filter((e) => e.graphNodeId);

    return {
      totalEntities: entities.length,
      indexedNodes: indexed.length,
      notIndexed: entities.length - indexed.length,
    };
  }

  /**
   * Get relationship statistics for a source
   */
  async getRelationshipStats(source: SourceType): Promise<{
    totalNodes: number;
    relationshipsByType: Record<string, number>;
  }> {
    // This would require querying Memgraph for statistics
    // For now, return basic stats from MongoDB
    const entities = await this.entityStore.findBySourceAndType(source, "", {
      includeDeleted: false,
    });

    const indexed = entities.filter((e) => e.graphNodeId);

    return {
      totalNodes: indexed.length,
      relationshipsByType: {}, // Would need Memgraph query to populate
    };
  }
}
