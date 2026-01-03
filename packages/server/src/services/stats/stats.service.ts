import { DataSourceModel } from "../../models/data-source.model.js";
import { mcpClientManager } from "../../mcp/client.js";
import { RecordModel } from "../../models/record.model.js";
import { MCPSyncStateModel } from "../../models/mcp-sync-state.model.js";
import { CacheStore } from "../../stores/cache.store.js";
import { GraphStore } from "../../stores/graph.store.js";
import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { SourceType } from "../../types/index.js";
import logger from "../../utils/logger.js";

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
        dataSources: mcpStats,
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
        deletedAt: { $exists: false },
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
      } catch (err) {
        logger.error({ err }, "Error fetching vector stats");
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
      } catch (err) {
        logger.error({ err }, "Error fetching graph stats");
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
   * Get records count by source with last sync time, embedded count, and graph indexed count
   */
  private async getRecordsBySource(): Promise<{
    [source: string]: {
      records: number;
      embedded: number;
      graphIndexed: number;
      lastSync?: Date;
    };
  }> {
    try {
      // Get all unique sources
      const sources = await RecordModel.distinct("source").exec();

      const result: {
        [source: string]: {
          records: number;
          embedded: number;
          graphIndexed: number;
          lastSync?: Date;
        };
      } = {};

      await Promise.all(
        sources.map(async (source: string) => {
          // Total records count
          const count = await this.recordStore.countBySource(
            source as SourceType,
            true
          );

          // Count embedded records (have lastEmbeddedAt set)
          const embeddedCount = await RecordModel.countDocuments({
            source,
            deletedAt: { $exists: false },
            lastEmbeddedAt: { $exists: true },
          }).exec();

          // Count graph-indexed records (have lastGraphIndexAt set)
          const graphIndexedCount = await RecordModel.countDocuments({
            source,
            deletedAt: { $exists: false },
            lastGraphIndexAt: { $exists: true },
          }).exec();

          // Get the most recent sync time for this source
          const recentRecord = await RecordModel.findOne({
            source,
          })
            .sort({ syncedAt: -1 })
            .select("syncedAt")
            .lean()
            .exec();

          result[source] = {
            records: count,
            embedded: embeddedCount,
            graphIndexed: graphIndexedCount,
            lastSync: recentRecord?.syncedAt,
          };
        })
      );

      return result;
    } catch (err) {
      logger.error({ err }, "Error fetching records by source");
      return {};
    }
  }

  /**
   * Get records count by type
   */
  private async getRecordsByType(): Promise<{ [type: string]: number }> {
    try {
      const types = await RecordModel.aggregate([
        { $match: { deletedAt: { $exists: false } } },
        { $group: { _id: "$recordType", count: { $sum: 1 } } },
      ]).exec();

      const result: { [type: string]: number } = {};
      types.forEach((item: { _id: string; count: number }) => {
        if (item._id) {
          result[item._id] = item.count;
        }
      });

      return result;
    } catch (err) {
      logger.error({ err }, "Error fetching records by type");
      return {};
    }
  }

  /**
   * Get deleted records count
   */
  private async getDeletedRecordsCount(): Promise<number> {
    try {
      return await RecordModel.countDocuments({
        deletedAt: { $exists: true },
      }).exec();
    } catch (err) {
      logger.error({ err }, "Error fetching deleted records count");
      return 0;
    }
  }

  /**
   * Get recent sync activity for dashboard
   */
  async getRecentActivity(): Promise<ActivityItem[]> {
    return this.getCached("stats:activity", async () => {
      try {
        const activities: ActivityItem[] = [];
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Get all sync states with recent activity
        const syncStates = await MCPSyncStateModel.find({
          $or: [
            { lastFullSyncAt: { $gte: oneDayAgo } },
            { lastIncrementalSyncAt: { $gte: oneDayAgo } },
          ],
        })
          .sort({ updatedAt: -1 })
          .limit(10)
          .exec();

        for (const state of syncStates) {
          const syncTime = state.lastIncrementalSyncAt || state.lastFullSyncAt;
          if (!syncTime) continue;

          // Count records synced in this sync session (within 5 minutes of sync time)
          const syncWindowStart = new Date(syncTime.getTime() - 5 * 60 * 1000);
          const syncWindowEnd = new Date(syncTime.getTime() + 5 * 60 * 1000);

          const recordStats = await RecordModel.aggregate([
            {
              $match: {
                source: state.serverName,
                syncedAt: {
                  $gte: syncWindowStart,
                  $lte: syncWindowEnd,
                },
              },
            },
            {
              $group: {
                _id: "$recordType",
                count: { $sum: 1 },
              },
            },
          ]).exec();

          if (recordStats.length > 0) {
            // Build description from record types
            const descriptions = recordStats.map((stat) => {
              const count = stat.count;
              const type = stat._id || "items";
              return `${count} ${type}${count !== 1 ? "s" : ""}`;
            });

            const description =
              state.status === "syncing"
                ? `Syncing ${descriptions.join(", ")}`
                : `Indexed ${descriptions.join(", ")}`;

            activities.push({
              service: this.capitalizeFirst(state.serverName),
              time: this.formatRelativeTime(syncTime),
              description,
              isNew: Date.now() - syncTime.getTime() < 5 * 60 * 1000, // New if within 5 minutes
            });
          }
        }

        // If no recent activity, show a placeholder
        if (activities.length === 0) {
          activities.push({
            service: "System",
            time: "No recent activity",
            description: "No syncs in the last 24 hours",
            isNew: false,
          });
        }

        return activities;
      } catch (err) {
        logger.error({ err }, "Error fetching recent activity");
        return [
          {
            service: "System",
            time: "Error",
            description: "Failed to load activity",
            isNew: false,
          },
        ];
      }
    });
  }

  /**
   * Get MCP server statistics (using DataSourceModel)
   */
  private async getMCPServerStats(): Promise<MCPServerStats> {
    try {
      const dataSources = await DataSourceModel.find().exec();
      const total = dataSources.length;
      let connected = 0;

      dataSources.forEach((source) => {
        if (mcpClientManager.isConnected(source.name)) {
          connected++;
        }
      });

      return {
        total,
        connected,
        disconnected: total - connected,
      };
    } catch (err) {
      logger.error({ err }, "Error fetching data source stats");
      return {
        total: 0,
        connected: 0,
        disconnected: 0,
      };
    }
  }

  /**
   * Helper: Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Helper: Format relative time
   */
  private formatRelativeTime(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
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
    } catch (err) {
      logger.error({ err, cacheKey: key }, `Cache error for key ${key}`);
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
  dataSources: MCPServerStats;
  bySource: {
    [source: string]: {
      records: number;
      embedded: number;
      graphIndexed: number;
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

export interface ActivityItem {
  service: string;
  time: string;
  description: string;
  isNew: boolean;
}
