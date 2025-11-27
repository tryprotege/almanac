import { MCPServerConfigModel } from "../../connections/mongoose.js";
import { mcpClientManager } from "../../mcp/client.js";
import { RecordModel } from "../../models/record.model.js";
import { CacheStore } from "../../stores/cache.store.js";
import { GraphStore } from "../../stores/graph.store.js";
import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";

/**
 * Statistics Service
 * Aggregates data from all stores for dashboard display
 */
export class StatsService {
  constructor(
    private recordStore: RecordStore,
    private vectorStore: VectorStore,
    private graphStore: GraphStore,
    private cacheStore: CacheStore
  ) {}

  /**
   * Get overview statistics for dashboard
   */
  async getOverview(): Promise<OverviewStats> {
    return this.getCached("stats:overview", async () => {
      // Get total records by source
      const recordsBySource = await this.getRecordsBySource();

      // Get MCP server stats
      const mcpStats = await this.getMCPServerStats();

      // Get vector and graph totals
      const [vectorStats, graphStats] = await Promise.all([
        this.getVectorStats(),
        this.getGraphStats(),
      ]);

      // Calculate totals
      const totalRecords = Object.values(recordsBySource).reduce(
        (sum, data) => sum + data.records,
        0
      );

      return {
        totalRecords,
        totalVectors: vectorStats.totalPoints,
        totalGraphNodes: graphStats.totalNodes,
        totalGraphRelationships: graphStats.totalRelationships,
        mcpServers: mcpStats,
        bySource: recordsBySource,
      };
    });
  }

  /**
   * Get detailed record statistics
   */
  async getRecordStats(): Promise<RecordStats> {
    return this.getCached("stats:records", async () => {
      const recordsBySource = await this.getRecordsBySource();
      const recordsByType = await this.getRecordsByType();

      // Get recently updated count (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentlyUpdated = await RecordModel.find({
        isDeleted: false,
        syncedAt: { $gte: oneDayAgo },
      })
        .countDocuments()
        .exec();

      // Get deleted count
      const deletedCount = await this.getDeletedRecordsCount();

      const total = Object.values(recordsBySource).reduce(
        (sum, data) => sum + data.records,
        0
      );

      return {
        total,
        bySource: Object.fromEntries(
          Object.entries(recordsBySource).map(([source, data]) => [
            source,
            data.records,
          ])
        ),
        byType: recordsByType,
        recentlyUpdated,
        deleted: deletedCount,
      };
    });
  }

  /**
   * Get vector database statistics
   */
  async getVectorStats(): Promise<VectorStats> {
    return this.getCached("stats:vectors", async () => {
      try {
        const collectionName = "embeddings";
        const collection = await this.vectorStore[
          "qdrant"
        ].client.getCollection(collectionName);

        // Extract dimensions safely
        let dimensions = 1536; // default
        if (collection.config?.params?.vectors) {
          const vectorConfig = collection.config.params.vectors;
          if (
            typeof vectorConfig === "object" &&
            "size" in vectorConfig &&
            typeof vectorConfig.size === "number"
          ) {
            dimensions = vectorConfig.size;
          }
        }

        return {
          collectionName,
          totalPoints: collection.points_count || 0,
          indexedPoints: collection.indexed_vectors_count || 0,
          dimensions,
          model: process.env.LLM_EMBEDDING_MODEL || "text-embedding-3-small",
        };
      } catch (error) {
        console.error("Error fetching vector stats:", error);
        return {
          collectionName: "embeddings",
          totalPoints: 0,
          indexedPoints: 0,
          dimensions: 1536,
          model: process.env.LLM_EMBEDDING_MODEL || "text-embedding-3-small",
        };
      }
    });
  }

  /**
   * Get graph database statistics
   */
  async getGraphStats(): Promise<GraphStats> {
    return this.getCached("stats:graph", async () => {
      try {
        // Get total nodes
        const totalNodesResult = await this.graphStore[
          "memgraph"
        ].executeQuery<{
          total: any;
        }>("MATCH (n) RETURN count(n) as total", {});
        const totalNodes = this.toNumber(totalNodesResult[0]?.total) || 0;

        // Get nodes by label
        const nodesByLabelResult = await this.graphStore[
          "memgraph"
        ].executeQuery<{
          label: string;
          count: any;
        }>(
          "MATCH (n) WITH labels(n)[0] as label, count(n) as count WHERE label IS NOT NULL RETURN label, count",
          {}
        );
        const nodesByLabel: { [label: string]: number } = {};
        nodesByLabelResult.forEach((row) => {
          if (row.label) {
            nodesByLabel[row.label] = this.toNumber(row.count);
          }
        });

        // Get total relationships
        const totalRelsResult = await this.graphStore["memgraph"].executeQuery<{
          total: any;
        }>("MATCH ()-[r]->() RETURN count(r) as total", {});
        const totalRelationships =
          this.toNumber(totalRelsResult[0]?.total) || 0;

        // Get relationships by type
        const relsByTypeResult = await this.graphStore[
          "memgraph"
        ].executeQuery<{
          type: string;
          count: any;
        }>("MATCH ()-[r]->() RETURN type(r) as type, count(r) as count", {});
        const relationshipsByType: { [type: string]: number } = {};
        relsByTypeResult.forEach((row) => {
          if (row.type) {
            relationshipsByType[row.type] = this.toNumber(row.count);
          }
        });

        return {
          totalNodes,
          totalRelationships,
          nodesByLabel,
          relationshipsByType,
        };
      } catch (error) {
        console.error("Error fetching graph stats:", error);
        return {
          totalNodes: 0,
          totalRelationships: 0,
          nodesByLabel: {},
          relationshipsByType: {},
        };
      }
    });
  }

  /**
   * Get records count by source with last sync time
   */
  private async getRecordsBySource(): Promise<{
    [source: string]: { records: number; lastSync?: Date };
  }> {
    try {
      // Get all unique sources
      const sources = await RecordModel.distinct("source", {
        isDeleted: false,
      }).exec();

      const result: { [source: string]: { records: number; lastSync?: Date } } =
        {};

      await Promise.all(
        sources.map(async (source: string) => {
          const count = await this.recordStore.countBySource(
            source as any,
            false
          );

          // Get the most recent sync time for this source
          const recentRecord = await RecordModel.findOne({
            source,
            isDeleted: false,
          })
            .sort({ syncedAt: -1 })
            .select("syncedAt")
            .lean()
            .exec();

          result[source] = {
            records: count,
            lastSync: recentRecord?.syncedAt,
          };
        })
      );

      return result;
    } catch (error) {
      console.error("Error fetching records by source:", error);
      return {};
    }
  }

  /**
   * Get records count by type
   */
  private async getRecordsByType(): Promise<{ [type: string]: number }> {
    try {
      const types = await RecordModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: "$recordType", count: { $sum: 1 } } },
      ]).exec();

      const result: { [type: string]: number } = {};
      types.forEach((item: { _id: string; count: number }) => {
        if (item._id) {
          result[item._id] = item.count;
        }
      });

      return result;
    } catch (error) {
      console.error("Error fetching records by type:", error);
      return {};
    }
  }

  /**
   * Get deleted records count
   */
  private async getDeletedRecordsCount(): Promise<number> {
    try {
      return await RecordModel.countDocuments({ isDeleted: true }).exec();
    } catch (error) {
      console.error("Error fetching deleted records count:", error);
      return 0;
    }
  }

  /**
   * Get MCP server statistics
   */
  private async getMCPServerStats(): Promise<MCPServerStats> {
    try {
      const configs = await MCPServerConfigModel.find().exec();
      const total = configs.length;
      let connected = 0;

      configs.forEach((config) => {
        if (mcpClientManager.isConnected(config.name)) {
          connected++;
        }
      });

      return {
        total,
        connected,
        disconnected: total - connected,
      };
    } catch (error) {
      console.error("Error fetching MCP server stats:", error);
      return {
        total: 0,
        connected: 0,
        disconnected: 0,
      };
    }
  }

  /**
   * Cache helper with 5-second TTL
   * Uses JSON serialization for complex objects
   */
  private async getCached<T>(
    key: string,
    fetcher: () => Promise<T>
  ): Promise<T> {
    try {
      // Try to get from cache
      const cached = await this.cacheStore.get(key);
      if (cached !== null) {
        return JSON.parse(cached) as T;
      }

      // Fetch fresh data
      const data = await fetcher();

      // Cache for 5 seconds
      await this.cacheStore.set(key, JSON.stringify(data), 5);

      return data;
    } catch (error) {
      console.error(`Cache error for key ${key}:`, error);
      // If cache fails, just fetch the data
      return fetcher();
    }
  }

  /**
   * Convert Neo4j Integer to JavaScript number
   * Neo4j returns integers as objects with {low, high} properties
   */
  private toNumber(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }

    // If it's already a number, return it
    if (typeof value === "number") {
      return value;
    }

    // If it's a Neo4j Integer object (has low/high properties)
    if (typeof value === "object" && "low" in value) {
      // For values that fit in JavaScript's safe integer range
      if (value.high === 0 || value.high === undefined) {
        return value.low;
      }
      // For larger values, convert using the formula
      return value.high * 0x100000000 + value.low;
    }

    // Try to parse as number
    const parsed = Number(value);
    return isNaN(parsed) ? 0 : parsed;
  }
}

// Type definitions
export interface OverviewStats {
  totalRecords: number;
  totalVectors: number;
  totalGraphNodes: number;
  totalGraphRelationships: number;
  mcpServers: MCPServerStats;
  bySource: {
    [source: string]: {
      records: number;
      lastSync?: Date;
    };
  };
}

export interface RecordStats {
  total: number;
  bySource: { [source: string]: number };
  byType: { [type: string]: number };
  recentlyUpdated: number;
  deleted: number;
}

export interface VectorStats {
  collectionName: string;
  totalPoints: number;
  indexedPoints: number;
  dimensions: number;
  model: string;
}

export interface GraphStats {
  totalNodes: number;
  totalRelationships: number;
  nodesByLabel: { [label: string]: number };
  relationshipsByType: { [type: string]: number };
}

interface MCPServerStats {
  total: number;
  connected: number;
  disconnected: number;
}
