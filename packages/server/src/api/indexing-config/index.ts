import { Router } from "express";
import {
  generateConfig,
  generateConfigIterative,
} from "../../services/indexing/config/config-generator.service.js";
import {
  indexAll,
  runIncrementalSync,
} from "../../services/indexing/config/config-indexer.service.js";
import { IndexingConfigModel } from "../../models/indexing-config.model.js";
import { RecordModel } from "../../models/record.model.js";
import { transformRecord } from "@ebee-oss/indexing-engine";
import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { insertRecordToVectorDB } from "../../services/indexing/embeddings/vector-indexer.service.js";
import { indexConfigEntities } from "../../services/indexing/graph/config-entity-indexer.js";
import { GraphStore } from "../../stores/graph.store.js";
import { connectMemgraph } from "../../connections/memgraph.js";
import { createHash } from "crypto";
import logger from "../../utils/logger.js";
import type {
  IndexingConfig,
  ValidationError,
  ValidationWarning,
} from "@ebee-oss/indexing-engine";
import { connectQdrant } from "../../connections/qdrant.js";

const router: Router = Router();

/**
 * POST /api/indexing-config/generate
 * Generate an IndexingConfig for an MCP server using LLM
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

    // Include classification breakdown for UI display
    const response = {
      ...result,
      toolClassifications: result.config.toolClassifications || {},
    };

    res.json({ data: response });
  } catch (err) {
    logger.error({ err, msg: "Failed to generate indexing config" });
    res.status(500).json({
      error: "Failed to generate config",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

/**
 * POST /api/indexing-config/validate
 * Validate an IndexingConfig schema
 */
router.post("/validate", async (req, res) => {
  try {
    const config = req.body as IndexingConfig;

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
 * POST /api/indexing-config/preview
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
    const transformedRecords = await Promise.all(
      sampleRecords.map((record: any) =>
        transformRecord({ record, enrichments: {} }, recordType, config.source)
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
 * POST /api/indexing-config/save
 * Save an IndexingConfig to MongoDB
 */
router.post("/save", async (req, res) => {
  try {
    const { config, status = "active" } = req.body;

    if (!config || !config.source) {
      return res.status(400).json({ error: "Valid config is required" });
    }

    // Upsert config
    const configDoc = await IndexingConfigModel.findOneAndUpdate(
      { serverName: config.source },
      {
        serverName: config.source,
        config,
        status,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.info(`Saved IndexingConfig for ${config.source}`);

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
 * POST /api/indexing-config/sync
 * Trigger sync using a saved IndexingConfig
 *
 * Request body:
 * - serverName: string (required)
 * - incremental: boolean (optional, default: false)
 * - startingPoints: Record<string, string[]> (optional) - User-provided starting point values
 */
router.post("/sync", async (req, res) => {
  try {
    const { serverName, incremental = false, startingPoints } = req.body;

    if (!serverName) {
      return res.status(400).json({ error: "serverName is required" });
    }

    // Load config from MongoDB
    const configDoc = await IndexingConfigModel.findOne({
      serverName,
      status: "active",
    });

    if (!configDoc) {
      return res.status(404).json({
        error: `No active IndexingConfig found for ${serverName}`,
      });
    }

    // Start sync in background
    let recordsProcessed = 0;

    // Load starting point values from MongoDB if not provided in request
    let startingPointsToUse: Record<string, string[]> = startingPoints || {};
    if (!startingPoints && configDoc.startingPointValues) {
      startingPointsToUse = Object.entries(
        configDoc.startingPointValues
      ) as unknown as Record<string, string[]>;
      // Convert Mongoose Map to plain object
      logger.info(
        { serverName, startingPoints: startingPointsToUse },
        "Loaded starting point values from database"
      );
    }

    // Use incremental or full sync
    const syncGenerator = incremental
      ? runIncrementalSync(configDoc.config, serverName)
      : indexAll(configDoc.config, serverName, startingPointsToUse);

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
 * GET /api/indexing-config/:serverName
 * Get IndexingConfig for a specific server
 */
router.get("/:serverName", async (req, res) => {
  try {
    const { serverName } = req.params;

    const configDoc = await IndexingConfigModel.findOne({ serverName });

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
 * GET /api/indexing-config
 * List all IndexingConfigs
 */
router.get("/", async (req, res) => {
  try {
    const configs = await IndexingConfigModel.find({}).sort({ updatedAt: -1 });

    res.json({
      data: {
        configs: configs.map((c) => ({
          id: c._id,
          serverName: c.serverName,
          displayName: c.config.displayName,
          icon: c.config.icon,
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
 * POST /api/indexing-config/reset-sync
 * Reset sync state for a server to force full resync
 */
router.post("/reset-sync", async (req, res) => {
  try {
    const { serverName } = req.body;

    if (!serverName) {
      return res.status(400).json({ error: "serverName is required" });
    }

    // Import MCPSyncStateModel
    const { MCPSyncStateModel } = await import(
      "../../models/mcp-sync-state.model.js"
    );

    // Delete sync state to force full resync
    const result = await MCPSyncStateModel.deleteOne({ serverName });

    logger.info(
      `Reset sync state for ${serverName} (deleted: ${result.deletedCount})`
    );

    res.json({
      data: {
        success: true,
        serverName,
        stateCleared: result.deletedCount > 0,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to reset sync state");
    res.status(500).json({
      error: "Failed to reset sync state",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

/**
 * GET /api/indexing-config/:serverName/starting-points
 * Get required starting points for a config
 */
router.get("/:serverName/starting-points", async (req, res) => {
  try {
    const { serverName } = req.params;

    const configDoc = await IndexingConfigModel.findOne({
      serverName,
      status: "active",
    });

    if (!configDoc) {
      return res.status(404).json({
        error: `No active config found for ${serverName}`,
      });
    }

    const startingPoints = configDoc.config.startingPoints || [];

    // Convert Mongoose Map to plain object
    const userProvidedValues: Record<string, string[]> = {};
    if (configDoc.startingPointValues) {
      // Mongoose Map - need to convert to object
      if (configDoc.startingPointValues instanceof Map) {
        configDoc.startingPointValues.forEach((value, key) => {
          userProvidedValues[key] = value;
        });
      } else {
        // Already an object (shouldn't happen but handle gracefully)
        Object.assign(userProvidedValues, configDoc.startingPointValues);
      }
    }

    // Format response with current values
    const formattedStartingPoints = startingPoints.map((sp) => ({
      name: sp.name,
      description: sp.description,
      required: sp.required ?? false,
      userProvided: sp.userProvided ?? false,
      currentValue: userProvidedValues[sp.name]?.join(", ") || "",
      hasValue: !!userProvidedValues[sp.name]?.length,
    }));

    res.json({
      success: true,
      data: {
        serverName,
        startingPoints: formattedStartingPoints,
        allRequired: startingPoints.filter((sp) => sp.required).length,
        allProvided: formattedStartingPoints.filter(
          (sp) => sp.required && sp.hasValue
        ).length,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to get starting points");
    res.status(500).json({ error: "Failed to get starting points" });
  }
});

/**
 * PUT /api/indexing-config/:serverName/starting-points
 * Update user-provided starting point values
 *
 * Request body:
 * {
 *   values: {
 *     [name: string]: string  // comma-separated values
 *   }
 * }
 */
router.put("/:serverName/starting-points", async (req, res) => {
  try {
    const { serverName } = req.params;
    const { values } = req.body;

    if (!values || typeof values !== "object") {
      return res.status(400).json({
        error: "values object is required",
      });
    }

    const configDoc = await IndexingConfigModel.findOne({
      serverName,
      status: "active",
    });

    if (!configDoc) {
      return res.status(404).json({
        error: `No active config found for ${serverName}`,
      });
    }

    const startingPoints = configDoc.config.startingPoints || [];

    // Parse and validate input
    const parsedValues: Record<string, string[]> = {};
    const errors: string[] = [];

    for (const [name, value] of Object.entries(values)) {
      const spConfig = startingPoints.find((sp) => sp.name === name);

      if (!spConfig) {
        errors.push(`Unknown starting point: ${name}`);
        continue;
      }

      // Parse comma-separated values
      const valueStr = typeof value === "string" ? value : String(value);
      const parsed = valueStr
        .split(",")
        .map((v: string) => v.trim())
        .filter((v: string) => v.length > 0);

      parsedValues[name] = parsed;

      // Validate required fields
      if ((spConfig.required ?? false) && parsed.length === 0) {
        errors.push(`Required starting point '${name}' cannot be empty`);
      }
    }

    // Check all required starting points are provided
    for (const sp of startingPoints) {
      if (
        (sp.required ?? false) &&
        (sp.userProvided ?? false) &&
        !parsedValues[sp.name]
      ) {
        errors.push(`Required starting point '${sp.name}' is missing`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
    }

    // Update document
    await IndexingConfigModel.updateOne(
      { serverName, status: "active" },
      {
        $set: {
          startingPointValues: parsedValues,
          updatedAt: new Date(),
        },
      }
    );

    logger.info(
      { serverName, values: parsedValues },
      "Updated starting point values"
    );

    res.json({
      success: true,
      data: {
        serverName,
        values: parsedValues,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to update starting points");
    res.status(500).json({ error: "Failed to update starting points" });
  }
});

/**
 * DELETE /api/indexing-config/:serverName
 * Delete an IndexingConfig
 */
router.delete("/:serverName", async (req, res) => {
  try {
    const { serverName } = req.params;

    const result = await IndexingConfigModel.deleteOne({ serverName });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ error: `No config found for ${serverName}` });
    }

    logger.info(`Deleted IndexingConfig for ${serverName}`);

    res.json({ data: { success: true } });
  } catch (err) {
    logger.error({ err }, "Failed to delete config");
    res.status(500).json({ error: "Failed to delete config" });
  }
});

export default router;
