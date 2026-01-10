import { loadProxyConfig } from "../../mcp/config-loader.js";
import type { DataSource } from "../../models/data-source.model.js";
import { IndexingConfigModel } from "../../models/indexing-config.model.js";
import { RecordStore } from "../../stores/record.store.js";
import logger from "../../utils/logger.js";
import { indexAll } from "../indexing/config/config-indexer.service.js";
import { RecordModel } from "../../models/record.model.js";
import { VectorStore } from "../../stores/vector.store.js";
import { insertRecordToVectorDB } from "../indexing/embeddings/vector-indexer.service.js";
import { connectQdrant } from "../../connections/qdrant.js";
import { createHash } from "crypto";
import type { TransformedRecord } from "@ebee-oss/indexing-engine";

/**
 * Helper: Persist transformed records to MongoDB
 */
async function persistToMongo(records: TransformedRecord[]): Promise<void> {
  const mongoOps = records.map((record) => {
    const normalizedContent = `${record.title || ""}\n${
      record.content || ""
    }`.trim();
    const checksum = createHash("sha256")
      .update(normalizedContent)
      .digest("hex");

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
            childIds: record.childIds || [],
            isParentRecord: record.isParentRecord || false,
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
}

/**
 * Helper: Index records to vector store
 */
async function indexToVectors(
  records: TransformedRecord[],
  recordStore: RecordStore,
  vectorStore: VectorStore
): Promise<void> {
  for (const record of records) {
    try {
      const mongoRecord = await RecordModel.findById(record._id);
      if (mongoRecord) {
        await insertRecordToVectorDB(recordStore, vectorStore, mongoRecord);
      }
    } catch (error) {
      logger.error(
        { error, recordId: record.sourceId },
        "Failed to index record to vector store"
      );
    }
  }
}

/**
 * Sync a single MCP server data source
 * All sources must have an active IndexingConfig
 */
export const syncMcpServer = async (
  dataSource: DataSource & { _id: any },
  options?: { limit?: number }
) => {
  // 1. Get IndexingConfig (required - no fallback)
  const syncConfig = await IndexingConfigModel.findOne({
    serverName: dataSource.name,
    status: "active",
  });

  if (!syncConfig) {
    throw new Error(
      `No active IndexingConfig found for '${dataSource.name}'. Please create an indexing configuration first via the UI or config generation API.`
    );
  }

  logger.info({ serverName: dataSource.name }, "Starting config-based sync");

  // 2. Initialize stores
  const recordStore = new RecordStore();
  const qdrant = await connectQdrant();
  const vectorStore = new VectorStore(qdrant);

  let recordsProcessed = 0;

  // 3. Fetch & transform via config-indexer
  const syncGenerator = indexAll(
    syncConfig.config,
    dataSource.name,
    syncConfig.startingPointValues
      ? Object.fromEntries(syncConfig.startingPointValues)
      : undefined
  );

  // 4. Process records in batches
  for await (const { records } of syncGenerator) {
    // 4a. Persist to MongoDB
    await persistToMongo(records);

    // 4b. Index to vectors
    await indexToVectors(records, recordStore, vectorStore);

    recordsProcessed += records.length;
    logger.info(
      `Processed ${recordsProcessed} records from ${dataSource.name}`
    );
  }

  logger.info({
    msg: `✅ Sync completed for ${dataSource.name}`,
    recordsProcessed,
  });
};

/**
 * Sync records from all configured sources to MongoDB (direct execution)
 * This bypasses the queue and runs synchronously - useful for testing or single-run scripts
 * @deprecated Use queueAllRemoteMcpServers() with the worker for production
 */
export async function syncAllRemoteMcpServers(options?: {
  limit?: number;
}): Promise<void> {
  const validConfigs = await loadProxyConfig();

  // Use allSettled to continue syncing even if one source fails
  const results = await Promise.allSettled(
    validConfigs.map((config) => syncMcpServer(config, options))
  );

  // Log results
  let successCount = 0;
  let failureCount = 0;

  const failures: Array<{ source: string; error: any }> = [];

  results.forEach((result, index) => {
    const config = validConfigs[index];
    if (result.status === "fulfilled") {
      successCount++;
    } else {
      failureCount++;
      failures.push({ source: config.name, error: result.reason });
      logger.error(
        { err: result.reason, source: config.name },
        `❌ Failed to sync source`
      );
    }
  });

  logger.info({
    msg: "📊 Sync Summary",
    successful: successCount,
    failed: failureCount,
    total: validConfigs.length,
    failures: failures.length > 0 ? failures.map((f) => f.source) : undefined,
  });
}
