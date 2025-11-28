import "dotenv/config";
import { initializeServices } from "../src/mcp/initialization.js";
import { RecordStore } from "../src/stores/record.store.js";
import { GraphStore } from "../src/stores/graph.store.js";
import { GraphIndexerService } from "../src/services/indexing/graph/graph-indexer.service.ts";
import { loadProxyConfig } from "../src/mcp/config-loader.js";
import { NotionMCPClient } from "../src/services/sources/notion/mcpClient.js";
import { NotionAdapter } from "../src/services/sync/adapters/notion-adapter.ts";
import { SourceType } from "../src/types/index.js";

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

    const graphIndexer = new GraphIndexerService(
      recordStore,
      graphStore,
      adapters
    );

    // Get statistics before indexing
    const statsBefore = await graphIndexer.getStats(config.name as SourceType);
    console.log(`\n📊 Current Statistics:`);
    console.log(`   Total Records: ${statsBefore.totalRecords}`);
    console.log(`   Already Indexed: ${statsBefore.indexedNodes}`);
    console.log(`   Unindexed: ${statsBefore.notIndexed}`);

    if (statsBefore.notIndexed === 0 && !options.force) {
      console.log(`\n✅ All records already indexed for ${config.name}`);
      continue;
    }

    if (options.force) {
      console.log(`\n🔄 Force mode: Re-indexing all records...`);
      const result = await graphIndexer.indexAll(config.name as SourceType, {
        batchSize: options.batchSize,
        includeRelationships: options.includeRelationships,
      });

      console.log(`\n✅ Indexing Complete for ${config.name}`);
      console.log(`   Nodes Created: ${result.nodes}`);
      console.log(`   Relationships Created: ${result.relationships}`);
      console.log(`   Errors: ${result.errors}`);
    } else {
      // Find unindexed records
      console.log(`\n🔍 Finding unindexed records...`);

      const allRecords = await recordStore.findBySourceAndType(
        config.name as SourceType,
        "",
        { includeDeleted: false }
      );

      const unindexedRecords = allRecords.filter(
        (record) => !record.lastGraphIndexDate
      );

      if (unindexedRecords.length === 0) {
        console.log(`\n✅ No unindexed records found for ${config.name}`);
        continue;
      }

      // Apply limit
      const recordsToProcess = unindexedRecords.slice(0, options.limit);

      console.log(`\n📝 Found ${unindexedRecords.length} unindexed records`);
      console.log(
        `🔄 Indexing ${recordsToProcess.length} records (limited)...`
      );

      const recordIds = recordsToProcess.map((r) => r._id);
      const result = await graphIndexer.indexByIds(recordIds, {
        includeRelationships: options.includeRelationships,
      });

      console.log(`\n✅ Indexing Complete for ${config.name}`);
      console.log(`   Nodes Created: ${result.nodes}`);
      console.log(`   Relationships Created: ${result.relationships}`);
      console.log(`   Errors: ${result.errors}`);
    }

    // Get statistics after indexing
    const statsAfter = await graphIndexer.getStats(config.name as SourceType);
    console.log(`\n📊 Final Statistics:`);
    console.log(`   Total Records: ${statsAfter.totalRecords}`);
    console.log(`   Indexed: ${statsAfter.indexedNodes}`);
    console.log(`   Remaining Unindexed: ${statsAfter.notIndexed}`);
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
