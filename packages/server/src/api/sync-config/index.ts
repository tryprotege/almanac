import { Router } from "express";
import {
  generateConfig,
  generateConfigIterative,
} from "../../services/indexing/config/config-generator.service.js";
import {
  indexAll,
  runIncrementalSync,
} from "../../services/indexing/config/config-indexer.service.js";
import { SyncConfigModel } from "../../models/sync-config.model.js";
import { RecordModel } from "../../models/record.model.js";
import { RecordTransformer } from "@ebee-oss/indexing-engine";
import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { insertRecordToVectorDB } from "../../services/indexing/embeddings/vector-indexer.service.js";
import { indexConfigEntities } from "../../services/indexing/graph/config-entity-indexer.js";
import { GraphStore } from "../../stores/graph.store.js";
import { connectMemgraph } from "../../connections/memgraph.js";
import { createHash } from "crypto";
import logger from "../../utils/logger.js";
import type {
  SyncConfig,
  ValidationError,
  ValidationWarning,
} from "@ebee-oss/indexing-engine";
import { connectQdrant } from "../../connections/qdrant.js";
import { DataSourceModel } from "../../models/data-source.model.js";
import { mcpClientManager } from "../../mcp/client.js";

const router: Router = Router();

/**
 * POST /api/sync-config/generate
 * Generate a SyncConfig for a data source using LLM
 *
 * Options:
 * - iterative: boolean (default: true) - Enable self-healing with dry run testing
 * - maxIterations: number (default: 3) - Max debug iterations
 */
router.post("/generate", async (req, res) => {
  try {
    const {
      serverName,
      displayName,
      sampleLimit,
      iterative = true,
      maxIterations = 3,
      userGuidance,
    } = req.body;

    if (!serverName) {
      return res.status(400).json({ error: "serverName is required" });
    }

    let result;

    if (iterative) {
      logger.info(
        `Starting iterative config generation for ${serverName} (max ${maxIterations} attempts)${
          userGuidance ? " with user guidance" : ""
        }`
      );
      result = await generateConfigIterative({
        serverName,
        displayName,
        sampleLimit,
        maxIterations,
        userGuidance,
      });

      logger.info(
        `Config generation completed for ${serverName}: ${
          result.totalAttempts
        } attempts, success: ${result.finalTestResult?.success ?? "unknown"}`
      );
    } else {
      result = await generateConfig({
        serverName,
        displayName,
        sampleLimit,
      });
      logger.info(`Successfully generated config for ${serverName}`);
    }

    res.json({ data: result });
  } catch (err) {
    logger.error({ err, msg: "Failed to generate sync config" });
    res.status(500).json({
      error: "Failed to generate config",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

/**
 * POST /api/sync-config/validate
 * Validate a SyncConfig schema
 */
router.post("/validate", async (req, res) => {
  try {
    const config = req.body as SyncConfig;

    // TODO: Implement Zod schema validation
    // For now, basic validation
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!config.version) {
      errors.push({
        path: "version",
        message: "Missing version field",
        code: "MISSING_VERSION",
      });
    }

    if (!config.source) {
      errors.push({
        path: "source",
        message: "Missing source field",
        code: "MISSING_SOURCE",
      });
    }

    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
    });
  } catch (err) {
    logger.error({ err }, "Failed to validate config");
    res.status(500).json({ error: "Validation failed" });
  }
});

/**
 * POST /api/sync-config/preview
 * Transform sample records using a config (for testing)
 */
router.post("/preview", async (req, res) => {
  try {
    const { config, sampleRecords, recordTypeName } = req.body;

    if (!config || !sampleRecords) {
      return res
        .status(400)
        .json({ error: "config and sampleRecords are required" });
    }

    if (!recordTypeName) {
      return res.status(400).json({ error: "recordTypeName is required" });
    }

    const recordType = config.recordTypes[recordTypeName];

    if (!recordType) {
      return res
        .status(404)
        .json({ error: `Record type '${recordTypeName}' not found in config` });
    }

    // Transform sample records
    const transformer = new RecordTransformer(recordType, config.source);

    const transformedRecords = await Promise.all(
      sampleRecords.map((record: any) =>
        transformer.transform({ record, enrichments: {} })
      )
    );

    res.json({
      transformedRecords,
      recordTypeName,
      recordCount: transformedRecords.length,
    });
  } catch (err) {
    logger.error({ err }, "Failed to preview config");
    res.status(500).json({
      error: "Preview failed",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

/**
 * POST /api/sync-config/save
 * Save a SyncConfig to MongoDB
 */
router.post("/save", async (req, res) => {
  try {
    const { config, status = "active" } = req.body;

    if (!config || !config.source) {
      return res.status(400).json({ error: "Valid config is required" });
    }

    // Upsert config
    const configDoc = await SyncConfigModel.findOneAndUpdate(
      { serverName: config.source },
      {
        serverName: config.source,
        config,
        status,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.info(`Saved SyncConfig for ${config.source}`);

    res.json({
      data: {
        success: true,
        configId: configDoc._id,
        serverName: configDoc.serverName,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to save config");
    res.status(500).json({ error: "Failed to save config" });
  }
});

/**
 * POST /api/sync-config/sync
 * Trigger sync using a saved SyncConfig
 */
router.post("/sync", async (req, res) => {
  try {
    const { serverName, incremental = false } = req.body;

    if (!serverName) {
      return res.status(400).json({ error: "serverName is required" });
    }

    // Load config from MongoDB
    const configDoc = await SyncConfigModel.findOne({
      serverName,
      status: "active",
    });

    if (!configDoc) {
      return res.status(404).json({
        error: `No active SyncConfig found for ${serverName}`,
      });
    }

    // Ensure MCP server is connected before syncing
    if (!mcpClientManager.isConnected(serverName)) {
      logger.info(
        { serverName },
        "MCP server not connected, attempting connection before sync"
      );

      // Load data source config
      const dataSource = await DataSourceModel.findOne({ name: serverName });

      if (!dataSource) {
        return res.status(404).json({
          error: `Data source ${serverName} not found`,
        });
      }

      try {
        // Convert MongoDB document to MCPServerConfig with proper types
        const serverConfig = {
          _id: dataSource._id?.toString(),
          name: dataSource.name,
          type: dataSource.type,
          command: dataSource.command || undefined,
          args: dataSource.args || undefined,
          env: dataSource.env ? Object.fromEntries(dataSource.env) : undefined,
          url: dataSource.url || undefined,
          headers: dataSource.headers
            ? Object.fromEntries(dataSource.headers)
            : undefined,
          authType: dataSource.authType,
          oauth: dataSource.oauth
            ? {
                authorizationUrl:
                  dataSource.oauth.authorizationUrl || undefined,
                tokenUrl: dataSource.oauth.tokenUrl || undefined,
                clientId: dataSource.oauth.clientId || undefined,
                scopes: dataSource.oauth.scopes,
                clientMetadataUrl: dataSource.oauth.metadataUrl || undefined,
              }
            : undefined,
          isDisabled: dataSource.isDisabled,
        };

        await mcpClientManager.connect(serverConfig);
        logger.info({ serverName }, "MCP server connected successfully");
      } catch (connectError) {
        logger.error(
          { err: connectError, serverName },
          "Failed to connect to MCP server"
        );
        return res.status(500).json({
          error: "Failed to connect to MCP server",
          message:
            connectError instanceof Error
              ? connectError.message
              : "Unknown error",
        });
      }
    }

    // Start sync in background
    let recordsProcessed = 0;

    // Use incremental or full sync
    const syncGenerator = incremental
      ? runIncrementalSync(configDoc.config, serverName)
      : indexAll(configDoc.config, serverName);

    // Initialize stores for persistence
    const recordStore = new RecordStore();
    const qdrant = await connectQdrant();
    const vectorStore = new VectorStore(qdrant);

    // Initialize graph store (optional - fails gracefully if Memgraph unavailable)
    let graphStore: GraphStore | null = null;
    try {
      const memgraphConnection = await connectMemgraph();
      graphStore = new GraphStore(memgraphConnection);
      logger.info("Memgraph connected for entity indexing");
    } catch (err) {
      logger.warn("Memgraph not available, skipping entity indexing");
    }

    let vectorChunks = 0;
    let entitiesIndexed = 0;

    // Process batches
    for await (const { records } of syncGenerator) {
      // 1. Save to MongoDB
      const mongoOps = records.map((record) => {
        // Calculate checksum
        const normalizedContent = `${record.title || ""}\n${
          record.content || ""
        }`.trim();
        const checksum = createHash("sha256")
          .update(normalizedContent)
          .digest("hex");

        // Extract sourceUpdatedAt from rawData if available
        const sourceUpdatedAt = record.rawData?.updated_time
          ? new Date(record.rawData.updated_time)
          : record.rawData?.last_edited_time
          ? new Date(record.rawData.last_edited_time)
          : new Date();

        return {
          updateOne: {
            filter: { _id: record._id },
            update: {
              $set: {
                _id: record._id,
                source: record.source,
                sourceId: record.sourceId,
                recordType: record.recordType,
                parentId: record.parentId,
                title: record.title || "",
                content: record.content || "",
                people: record.people || [],
                primaryDate: record.primaryDate || new Date(),
                tags: record.tags || [],
                rawData: record.rawData || {},
                checksum,
                sourceUpdatedAt,
                syncedAt: new Date(),
              },
              $inc: { version: 1 },
            },
            upsert: true,
          },
        };
      });

      await RecordModel.bulkWrite(mongoOps);

      // 2. Index to vector store
      for (const record of records) {
        try {
          const mongoRecord = await RecordModel.findById(record._id);

          if (mongoRecord) {
            const vectorIds = await insertRecordToVectorDB(
              recordStore,
              vectorStore,
              mongoRecord
            );
            vectorChunks += vectorIds.length;
          }
        } catch (error) {
          logger.error(
            { error, recordId: record.sourceId },
            `Failed to index record to vector store`
          );
        }

        // 3. Index entities to graph store (if available and record has entities)
        if (
          graphStore &&
          (record.extractedEntities?.length ||
            record.extractedRelationships?.length)
        ) {
          try {
            await indexConfigEntities(
              record._id,
              record.title || "",
              serverName,
              record.extractedEntities || [],
              record.extractedRelationships || [],
              graphStore
            );
            entitiesIndexed += record.extractedEntities?.length || 0;
          } catch (error) {
            logger.error(
              { error, recordId: record._id },
              `Failed to index entities to graph store`
            );
          }
        }
      }

      recordsProcessed += records.length;

      logger.info(
        `Processed ${recordsProcessed} records from ${serverName} (${vectorChunks} vectors, ${entitiesIndexed} entities)`
      );
    }

    res.json({
      success: true,
      recordsProcessed,
      vectorChunks,
      entitiesIndexed,
      syncType: incremental ? "incremental" : "full",
    });
  } catch (err) {
    logger.error({ err }, "Failed to sync with config");
    res.status(500).json({ error: "Sync failed" });
  }
});

/**
 * GET /api/sync-config/:serverName
 * Get SyncConfig for a specific server
 */
router.get("/:serverName", async (req, res) => {
  try {
    const { serverName } = req.params;

    const configDoc = await SyncConfigModel.findOne({ serverName });

    if (!configDoc) {
      return res
        .status(404)
        .json({ error: `No config found for ${serverName}` });
    }

    res.json({ data: configDoc });
  } catch (err) {
    logger.error({ err }, "Failed to get config");
    res.status(500).json({ error: "Failed to get config" });
  }
});

/**
 * GET /api/sync-config
 * List all SyncConfigs
 */
router.get("/", async (req, res) => {
  try {
    const configs = await SyncConfigModel.find({}).sort({ updatedAt: -1 });

    res.json({
      data: {
        configs: configs.map((c) => ({
          id: c._id,
          serverName: c.serverName,
          displayName: c.config.displayName,
          status: c.status,
          updatedAt: c.updatedAt,
          fetcherCount: Object.keys(c.config.fetchers).length,
          recordTypeCount: Object.keys(c.config.recordTypes).length,
        })),
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to list configs");
    res.status(500).json({ error: "Failed to list configs" });
  }
});

/**
 * DELETE /api/sync-config/:serverName
 * Delete a SyncConfig
 */
router.delete("/:serverName", async (req, res) => {
  try {
    const { serverName } = req.params;

    const result = await SyncConfigModel.deleteOne({ serverName });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ error: `No config found for ${serverName}` });
    }

    logger.info(`Deleted SyncConfig for ${serverName}`);

    res.json({ data: { success: true } });
  } catch (err) {
    logger.error({ err }, "Failed to delete config");
    res.status(500).json({ error: "Failed to delete config" });
  }
});

export default router;
