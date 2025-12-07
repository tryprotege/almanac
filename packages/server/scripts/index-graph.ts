import "dotenv/config";
import { initializeServices } from "../src/mcp/initialization.js";
import { RecordStore } from "../src/stores/record.store.js";
import { GraphStore } from "../src/stores/graph.store.js";
import { VectorStore } from "../src/stores/vector.store.js";
import { indexAllRecords } from "../src/services/indexing/graph/graph-indexer.js";
import { cleanupDeletedRecords } from "../src/services/indexing/graph/graph-cleanup.js";
import {
  indexEntityEmbeddings,
  indexRelationshipEmbeddings,
} from "../src/services/indexing/graph/graph-embeddings.js";
import { createLLMClient } from "../src/services/llm/providers.js";
import { loadProxyConfig } from "../src/mcp/config-loader.js";
import { NotionMCPClient } from "../src/services/sources/notion/mcpClient.js";
import { NotionAdapter } from "../src/services/sync/adapters/notion-adapter.ts";
import { SourceType } from "../src/types/index.js";
import { env } from "../src/env.js";
import logger from "../src/utils/logger.js";

/**
 * Script to index unindexed records to the graph database
 *
 * Usage:
 *   pnpm tsx scripts/index-graph.ts
 *   pnpm tsx scripts/index-graph.ts --source=notion
 *   pnpm tsx scripts/index-graph.ts --batch-size=50
 *   pnpm tsx scripts/index-graph.ts --force
 */

interface ScriptOptions {
  source?: SourceType;
  batchSize?: number;
  limit?: number;
  force?: boolean;
  includeRelationships?: boolean;
  cleanup?: boolean;
  embeddings?: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    batchSize: 100,
    limit: 100,
    force: false,
    includeRelationships: true,
    cleanup: false,
    embeddings: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--source=")) {
      options.source = arg.split("=")[1] as SourceType;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--no-relationships") {
      options.includeRelationships = false;
    } else if (arg === "--cleanup") {
      options.cleanup = true;
    } else if (arg === "--embeddings") {
      options.embeddings = true;
    }
  }

  return options;
}

async function indexGraphRecords() {
  const options = parseArgs();

  logger.info("🚀 Graph Indexing Script");
  logger.info("========================");
  logger.info(`Source: ${options.source || "all"}`);
  logger.info(`Limit: ${options.limit} records`);
  logger.info(`Batch Size: ${options.batchSize}`);
  logger.info(`Force Re-index: ${options.force ? "Yes" : "No"}`);
  logger.info(
    `Include Relationships: ${options.includeRelationships ? "Yes" : "No"}`
  );
  logger.info("");

  const { memgraph, qdrant } = await initializeServices();
  const validConfigs = await loadProxyConfig();

  // Create OpenAI client for LLM extraction
  const openaiClient = createLLMClient();

  for (const config of validConfigs) {
    // Filter by source if specified
    if (options.source && config.name !== options.source) {
      continue;
    }

    logger.info(`\n📦 Processing source: ${config.name}`);
    logger.info("─".repeat(50));

    const recordStore = new RecordStore();
    const graphStore = new GraphStore(memgraph);
    const vectorStore = options.embeddings
      ? new VectorStore(qdrant)
      : undefined;

    // Set up adapters
    const adapters = new Map<SourceType, any>();

    if (config.name === "notion") {
      const notionClient = new NotionMCPClient();
      const notionAdapter = new NotionAdapter(notionClient);
      adapters.set("notion", notionAdapter);
    }

    // 1. Cleanup deleted records first (if requested)
    if (options.cleanup) {
      logger.info(`\n🧹 Cleaning up deleted records...`);
      const cleanupStats = await cleanupDeletedRecords(
        config.name as SourceType,
        recordStore,
        graphStore,
        vectorStore,
        { cleanupEmbeddings: options.embeddings }
      );

      logger.info(`   ✅ Cleaned up ${cleanupStats.nodes} nodes`);
      if (cleanupStats.entityEmbeddings !== undefined) {
        logger.info(
          `   ✅ Cleaned up ${cleanupStats.entityEmbeddings} entity embeddings`
        );
      }
      if (cleanupStats.relationshipEmbeddings !== undefined) {
        logger.info(
          `   ✅ Cleaned up ${cleanupStats.relationshipEmbeddings} relationship embeddings`
        );
      }
    }

    // Get statistics before indexing
    const allRecords = await recordStore.findBySourceAndType(
      config.name as SourceType,
      "",
      { includeDeleted: false }
    );

    // Records need indexing if:
    // 1. Never indexed (lastGraphIndexDate is null)
    // 2. Updated after last indexing (updatedAt > lastGraphIndexDate)
    const needsIndexing = allRecords.filter(
      (record) =>
        !record.lastGraphIndexDate ||
        (record.updatedAt && record.updatedAt > record.lastGraphIndexDate)
    );

    const alreadyIndexed = allRecords.filter(
      (record) =>
        record.lastGraphIndexDate &&
        record.updatedAt &&
        record.updatedAt <= record.lastGraphIndexDate
    );

    logger.info(`\n📊 Current Statistics:`);
    logger.info(`   Total Records: ${allRecords.length}`);
    logger.info(`   Already Indexed: ${alreadyIndexed.length}`);
    logger.info(`   Needs Indexing: ${needsIndexing.length}`);
    logger.info(
      `     - Never indexed: ${
        allRecords.filter((r) => !r.lastGraphIndexDate).length
      }`
    );
    logger.info(
      `     - Updated since last index: ${
        allRecords.filter(
          (r) =>
            r.lastGraphIndexDate &&
            r.updatedAt &&
            r.updatedAt > r.lastGraphIndexDate
        ).length
      }`
    );

    if (needsIndexing.length === 0 && !options.force) {
      logger.info(`\n✅ All records already indexed for ${config.name}`);
      continue;
    }

    // Run LLM-powered indexing
    const result = await indexAllRecords(
      config.name as SourceType,
      recordStore,
      graphStore,
      adapters,
      openaiClient,
      {
        batchSize: options.batchSize,
        concurrency: env.GRAPH_EXTRACTION_CONCURRENCY,
        enableToxicFilter: env.ENABLE_TOXIC_DOCUMENT_FILTER,
        maxEntitiesPerDoc: env.MAX_ENTITIES_PER_DOCUMENT,
        force: options.force,
      }
    );

    logger.info(`\n✅ Indexing Complete for ${config.name}`);
    logger.info(`   Nodes Created: ${result.nodes}`);
    logger.info(`   Relationships Created: ${result.relationships}`);
    logger.info(`   Errors: ${result.errors}`);
    logger.info(`   Skipped (toxic): ${result.skippedToxic}`);

    // Get statistics after indexing
    const allRecordsAfter = await recordStore.findBySourceAndType(
      config.name as SourceType,
      "",
      { includeDeleted: false }
    );

    const unindexedRecordsAfter = allRecordsAfter.filter(
      (record) => !record.lastGraphIndexDate
    );

    logger.info(`\n📊 Final Statistics:`);
    logger.info(`   Total Records: ${allRecordsAfter.length}`);
    logger.info(
      `   Indexed: ${allRecordsAfter.length - unindexedRecordsAfter.length}`
    );
    logger.info(`   Remaining Unindexed: ${unindexedRecordsAfter.length}`);

    // 2. Create embeddings (if requested)
    if (options.embeddings && vectorStore) {
      logger.info(`\n🔮 Creating embeddings...`);

      const deps = { vectorStore, recordStore, graphStore };

      const entityStats = await indexEntityEmbeddings(
        config.name as SourceType,
        deps
      );
      const relStats = await indexRelationshipEmbeddings(
        config.name as SourceType,
        deps
      );

      logger.info(
        `   ✅ Entity embeddings: ${entityStats.indexed} indexed, ${entityStats.skipped} skipped`
      );
      logger.info(
        `   ✅ Relationship embeddings: ${relStats.indexed} indexed, ${relStats.skipped} skipped`
      );
    }
  }

  logger.info(`\n✨ Graph indexing script completed`);
}

const run = async () => {
  await indexGraphRecords();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Script error");
    process.exit(1);
  });
