import { loadProxyConfig } from "../../mcp/config-loader.js";
import { MCPServerConfig } from "../../models/mcp-config.model.js";
import { SyncConfigModel } from "../../models/sync-config.model.js";
import { RecordStore } from "../../stores/record.store.js";
import logger from "../../utils/logger.js";
import { FathomMCPClient } from "../sources/fathom/mcpClient.js";
import { GitHubMCPClient } from "../sources/github/mcpClient.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { SlackMCPClient } from "../sources/slack/mcpClient.js";
import { BaseRecordAdapter } from "./adapters/base-adapter.js";
import { FathomAdapter } from "./adapters/fathom-adapter.js";
import { GitHubAdapter } from "./adapters/github-adapter.js";
import { NotionAdapter } from "./adapters/notion-adapter.js";
import { SlackAdapter } from "./adapters/slack-adapter.js";
import { syncAllRecords } from "./record-sync.service.js";
import { indexAll } from "../indexing/config/config-indexer.service.js";
import { RecordModel } from "../../models/record.model.js";
import { VectorStore } from "../../stores/vector.store.js";
import { insertRecordToVectorDB } from "../indexing/embeddings/vector-indexer.service.js";
import { connectQdrant } from "../../connections/qdrant.js";
import { createHash } from "crypto";

export const syncMcpServer = async (
  mcpConfig: MCPServerConfig,
  options?: { limit?: number }
) => {
  const recordStore = new RecordStore();

  // Step 1: Check if there's a SyncConfig for this source
  const syncConfig = await SyncConfigModel.findOne({
    serverName: mcpConfig.name,
    status: "active",
  });

  if (syncConfig) {
    // Use config-based sync (works for Linear, custom sources, etc.)
    logger.info(
      { serverName: mcpConfig.name },
      "Using config-based sync with SyncConfig"
    );

    // Initialize stores
    const qdrant = await connectQdrant();
    const vectorStore = new VectorStore(qdrant);

    let recordsProcessed = 0;

    // Run config-based sync
    const syncGenerator = indexAll(syncConfig.config, mcpConfig.name);

    for await (const { records } of syncGenerator) {
      // 1. Save to MongoDB
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
            await insertRecordToVectorDB(recordStore, vectorStore, mongoRecord);
          }
        } catch (error) {
          logger.error(
            { error, recordId: record.sourceId },
            "Failed to index record to vector store"
          );
        }
      }

      recordsProcessed += records.length;
      logger.info(
        `Processed ${recordsProcessed} records from ${mcpConfig.name}`
      );
    }

    logger.info({
      msg: `✅ Config-based sync completed for ${mcpConfig.name}`,
      recordsProcessed,
    });
    return;
  }

  // Step 2: Fall back to legacy adapter-based sync
  logger.info(
    { serverName: mcpConfig.name },
    "Using legacy adapter-based sync"
  );

  let adapter: BaseRecordAdapter;

  // Create adapter based on source type
  if (mcpConfig.name === "notion") {
    const notionClient = new NotionMCPClient();
    adapter = new NotionAdapter(notionClient);
  } else if (mcpConfig.name === "github") {
    const githubClient = new GitHubMCPClient();
    adapter = new GitHubAdapter(githubClient, {
      includeArchived: false,
      includeForks: true,
      includePrivate: true,
    });
  } else if (mcpConfig.name === "fathom") {
    const fathomClient = new FathomMCPClient();
    adapter = new FathomAdapter(fathomClient, {
      includeActionItems: true,
      includeNotes: true,
      includeHighlights: true,
      includeTeamMembers: true,
      includeTeams: true,
      includeTranscripts: true,
    });
  } else if (mcpConfig.name === "slack") {
    const slackClient = new SlackMCPClient();
    adapter = new SlackAdapter(slackClient);
  } else {
    throw new Error(
      `No SyncConfig found and no legacy adapter available for: ${mcpConfig.name}. Please generate a SyncConfig first.`
    );
  }

  // Sync records for this source
  await syncAllRecords(recordStore, mcpConfig.name, adapter, options);

  logger.info({ msg: `✅ Saved ${mcpConfig.name} records into document DB` });
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
