import "dotenv/config";
import { initializeServices } from "../src/mcp/initialization.js";
import { RecordStore } from "../src/stores/record.store.js";
import { GraphStore } from "../src/stores/graph.store.js";
import { indexAllRecords } from "../src/services/indexing/graph/graph-indexer.js";
import { createLLMClient } from "../src/services/llm/providers.js";
import { loadProxyConfig } from "../src/mcp/config-loader.js";
import { NotionMCPClient } from "../src/services/sources/notion/mcpClient.js";
import { NotionAdapter } from "../src/services/sync/adapters/notion-adapter.ts";
import { SourceType } from "../src/types/index.js";
import { env } from "../src/env.js";

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
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    batchSize: 100,
    limit: 100,
    force: false,
    includeRelationships: true,
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
    }
  }

  return options;
}

async function indexGraphRecords() {
  const options = parseArgs();

  console.log("🚀 Graph Indexing Script");
  console.log("========================");
  console.log(`Source: ${options.source || "all"}`);
  console.log(`Limit: ${options.limit} records`);
  console.log(`Batch Size: ${options.batchSize}`);
  console.log(`Force Re-index: ${options.force ? "Yes" : "No"}`);
  console.log(
    `Include Relationships: ${options.includeRelationships ? "Yes" : "No"}`
  );
  console.log("");

  const { memgraph } = await initializeServices();
  const validConfigs = await loadProxyConfig();

  // Create OpenAI client for LLM extraction
  const openaiClient = createLLMClient();

  for (const config of validConfigs) {
    // Filter by source if specified
    if (options.source && config.name !== options.source) {
      continue;
    }

    console.log(`\n📦 Processing source: ${config.name}`);
    console.log("─".repeat(50));

    const recordStore = new RecordStore();
    const graphStore = new GraphStore(memgraph);

    // Set up adapters
    const adapters = new Map<SourceType, any>();

    if (config.name === "notion") {
      const notionClient = new NotionMCPClient();
      const notionAdapter = new NotionAdapter(notionClient);
      adapters.set("notion", notionAdapter);
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

    console.log(`\n📊 Current Statistics:`);
    console.log(`   Total Records: ${allRecords.length}`);
    console.log(`   Already Indexed: ${alreadyIndexed.length}`);
    console.log(`   Needs Indexing: ${needsIndexing.length}`);
    console.log(
      `     - Never indexed: ${
        allRecords.filter((r) => !r.lastGraphIndexDate).length
      }`
    );
    console.log(
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
      console.log(`\n✅ All records already indexed for ${config.name}`);
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

    console.log(`\n✅ Indexing Complete for ${config.name}`);
    console.log(`   Nodes Created: ${result.nodes}`);
    console.log(`   Relationships Created: ${result.relationships}`);
    console.log(`   Errors: ${result.errors}`);
    console.log(`   Skipped (toxic): ${result.skippedToxic}`);

    // Get statistics after indexing
    const allRecordsAfter = await recordStore.findBySourceAndType(
      config.name as SourceType,
      "",
      { includeDeleted: false }
    );

    const unindexedRecordsAfter = allRecordsAfter.filter(
      (record) => !record.lastGraphIndexDate
    );

    console.log(`\n📊 Final Statistics:`);
    console.log(`   Total Records: ${allRecordsAfter.length}`);
    console.log(
      `   Indexed: ${allRecordsAfter.length - unindexedRecordsAfter.length}`
    );
    console.log(`   Remaining Unindexed: ${unindexedRecordsAfter.length}`);
  }

  console.log(`\n✨ Graph indexing script completed`);
}

const run = async () => {
  await indexGraphRecords();
};

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  });
