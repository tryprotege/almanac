import { RecordStore } from "../../stores/record.store.js";
import { GraphStore } from "../../stores/graph.store.js";
import { Record } from "../../models/record.model.js";
import { SourceType } from "../../types/index.js";
import { BaseRecordAdapter } from "./adapters/base-adapter.js";
import { MemgraphNode, MemgraphRelationship } from "../../types/index.js";

/**
 * Graph Indexer Service
 * Post-processes MongoDB entities into Memgraph graph database
 * Handles node creation and relationship extraction
 */
export class GraphIndexerService {
  constructor(
    private recordStore: RecordStore,
    private graphStore: GraphStore,
    private adapters: Map<SourceType, BaseRecordAdapter>
  ) {}

  /**
   * Index all records from a source into Memgraph
   */
  async indexAll(
    source: SourceType,
    options?: {
      recordType?: string;
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
      const records = await this.recordStore.findBySourceAndType(
        source,
        options?.recordType || "",
        { limit: batchSize, skip, includeDeleted: false }
      );

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      try {
        // Create nodes in batch
        const nodes = records.map((record) => this.recordToNode(record));
        await this.graphStore.createNodes(nodes);
        stats.nodes += nodes.length;

        // Update records with graph node IDs
        for (const record of records) {
          await this.recordStore.upsert({
            _id: record._id,
            graphNodeId: record._id,
            lastGraphIndexDate: new Date(),
          });
        }
      } catch (error) {
        console.error(`❌ Error creating nodes for batch:`, error);
        stats.errors++;
      }

      skip += records.length;
      console.log(`📊 Progress: ${stats.nodes} nodes created`);
    }

    // Second pass: Create relationships
    if (includeRelationships) {
      console.log(`🔗 Extracting relationships...`);
      skip = 0;
      hasMore = true;

      while (hasMore) {
        const records = await this.recordStore.findBySourceAndType(
          source,
          options?.recordType || "",
          { limit: batchSize, skip, includeDeleted: false }
        );

        if (records.length === 0) {
          hasMore = false;
          break;
        }

        try {
          const relationships = await this.extractRelationshipsFromRecords(
            records,
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

        skip += records.length;
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
   * Index a single record into Memgraph
   */
  async indexRecord(
    record: Record,
    options?: {
      includeRelationships?: boolean;
    }
  ): Promise<{
    nodeId: string;
    relationships: number;
  }> {
    const includeRelationships = options?.includeRelationships ?? true;

    // Create node
    const node = this.recordToNode(record);
    await this.graphStore.createNode(node);

    // Update record with graph node ID
    await this.recordStore.upsert({
      _id: record._id,
      graphNodeId: record._id,
      lastGraphIndexDate: new Date(),
    });

    let relationshipCount = 0;

    // Extract and create relationships
    if (includeRelationships) {
      const relationships = await this.extractRelationshipsFromRecords(
        [record],
        record.source
      );
      if (relationships.length > 0) {
        await this.graphStore.createRelationships(relationships);
        relationshipCount = relationships.length;
      }
    }

    return {
      nodeId: record._id,
      relationships: relationshipCount,
    };
  }

  /**
   * Index specific records by IDs
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

    console.log(`🔄 Indexing ${ids.length} records by ID`);

    const records = await this.recordStore.findByIds(ids);

    // Create nodes
    for (const record of records) {
      try {
        const result = await this.indexRecord(record, options);
        stats.nodes++;
        stats.relationships += result.relationships;
      } catch (error) {
        console.error(
          `❌ Error indexing record ${record._id}:`,
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
   * Convert record to graph node
   */
  private recordToNode(record: Record): MemgraphNode {
    return {
      label: record.recordType.toUpperCase(),
      id: record._id,
      type: record.recordType,
      title: record.title,
    };
  }

  /**
   * Extract relationships from records using their adapters
   */
  private async extractRelationshipsFromRecords(
    records: Record[],
    source: SourceType
  ): Promise<MemgraphRelationship[]> {
    const adapter = this.adapters.get(source);
    if (!adapter) {
      console.warn(`No adapter found for source: ${source}`);
      return [];
    }

    const relationships: MemgraphRelationship[] = [];

    for (const record of records) {
      try {
        // Use the raw data to extract relationships via adapter
        const sourceRecord = record.rawData;
        const recordRelationships = await adapter.extractRelationships(
          sourceRecord
        );

        // Convert to Memgraph relationships
        // The sourceId and targetId from adapter are already in the format we need
        for (const rel of recordRelationships) {
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
          `Error extracting relationships for record ${record._id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    return relationships;
  }

  /**
   * Delete node for deleted record
   */
  async deleteNode(entityId: string): Promise<void> {
    await this.graphStore.deleteNode(entityId);

    // Clear graph node ID from record
    const record = await this.recordStore.findById(entityId);
    if (record) {
      await this.recordStore.upsert({
        _id: entityId,
        graphNodeId: "",
      });
    }
  }

  /**
   * Clean up nodes for deleted records
   */
  async cleanupDeletedRecords(source: SourceType): Promise<number> {
    console.log(
      `🧹 Cleaning up graph nodes for deleted records from ${source}`
    );

    const deletedRecords = await this.recordStore.findBySourceAndType(
      source,
      "",
      { includeDeleted: true }
    );

    const deleted = deletedRecords.filter(
      (record) => record.isDeleted && record.graphNodeId
    );
    let cleaned = 0;

    for (const record of deleted) {
      try {
        await this.graphStore.deleteNode(record.graphNodeId);
        cleaned++;

        // Clear graph node ID
        await this.recordStore.upsert({
          _id: record._id,
          graphNodeId: "",
        });
      } catch (error) {
        console.error(
          `Error deleting node for record ${record._id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log(
      `✅ Cleaned up ${cleaned} nodes from ${deleted.length} deleted records`
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
      recordType?: string;
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
      const records = await this.recordStore.findBySourceAndType(
        source,
        options?.recordType || "",
        { limit: batchSize, skip, includeDeleted: false }
      );

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      try {
        const relationships = await this.extractRelationshipsFromRecords(
          records,
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

      skip += records.length;
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
    totalRecords: number;
    indexedNodes: number;
    notIndexed: number;
  }> {
    const records = await this.recordStore.findBySourceAndType(source, "", {
      includeDeleted: false,
    });

    const indexed = records.filter((record) => record.graphNodeId);

    return {
      totalRecords: records.length,
      indexedNodes: indexed.length,
      notIndexed: records.length - indexed.length,
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
    const records = await this.recordStore.findBySourceAndType(source, "", {
      includeDeleted: false,
    });

    const indexed = records.filter((record) => record.graphNodeId);

    return {
      totalNodes: indexed.length,
      relationshipsByType: {}, // Would need Memgraph query to populate
    };
  }
}
