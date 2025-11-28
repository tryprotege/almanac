#!/usr/bin/env tsx
/**
 * Re-indexing CLI Script
 * Smart re-indexing for graph extraction with schema-driven change detection
 */

import "dotenv/config";
import OpenAI from "openai";
import { connectMongoose } from "../src/connections/mongoose.js";
import { connectMemgraph } from "../src/connections/memgraph.js";
import { RecordStore } from "../src/stores/record.store.js";
import { GraphStore } from "../src/stores/graph.store.js";
import { SourceType } from "../src/types/index.js";
import { BaseRecordAdapter } from "../src/services/indexing/adapters/base-adapter.js";
import { NotionAdapter } from "../src/services/indexing/adapters/notion-adapter.js";
import { NotionMCPClient } from "../src/services/sources/notion/mcpClient.js";
import {
  smartReindex,
  ReindexStats,
} from "../src/services/indexing/graph-reindexer.js";
import { env } from "../src/env.js";

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface ScriptOptions {
  source?: SourceType;
  recordType?: string;
  force?: boolean;
  dryRun?: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--source=")) {
      options.source = arg.split("=")[1] as SourceType;
    } else if (arg.startsWith("--record-type=")) {
      options.recordType = arg.split("=")[1];
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function printUsage() {
  console.log(`
📖 Usage: pnpm reindex-graph [options]

Options:
  --source=<source>        Source to re-index (notion, slack, etc.)
  --record-type=<type>     Optional: Filter by record type (e.g., page, task)
  --force                  Force full re-index (ignore checksums/versions)
  --dry-run                Preview what would be re-indexed without making changes

Examples:
  # Preview what would be re-indexed for Notion
  pnpm reindex-graph --source=notion --dry-run

  # Re-index only changed Notion records
  pnpm reindex-graph --source=notion

  # Force full re-index of all Notion pages
  pnpm reindex-graph --source=notion --record-type=page --force

  # Re-index all sources (if no source specified)
  pnpm reindex-graph
  `);
}

// ============================================================================
// Display Formatting
// ============================================================================

function displayStats(
  source: SourceType,
  stats: ReindexStats,
  dryRun: boolean
) {
  const mode = dryRun ? "Dry Run Results" : "Re-indexing Results";
  const action = dryRun ? "Would re-index" : "Re-indexed";
  const skipAction = dryRun ? "Would skip" : "Skipped";

  console.log(`
┌─────────────────────────────────────────────────────────────────┐
│ 📊 ${mode} for ${source}
├─────────────────────────────────────────────────────────────────┤
│ Total Records:        ${stats.totalRecords.toLocaleString().padStart(10)}
│ ${action}:         ${stats.reindexed.toLocaleString().padStart(10)}
│ ${skipAction}:            ${stats.skipped.toLocaleString().padStart(10)}
├─────────────────────────────────────────────────────────────────┤
│ Reasons for Re-indexing:
│   - Never indexed:      ${stats.reasons.neverIndexed
    .toLocaleString()
    .padStart(10)}
│   - Content changed:    ${stats.reasons.contentChanged
    .toLocaleString()
    .padStart(10)}
│   - Schema changed:     ${stats.reasons.schemaChanged
    .toLocaleString()
    .padStart(10)}
│   - No graph node:      ${stats.reasons.noGraphNode
    .toLocaleString()
    .padStart(10)}
└─────────────────────────────────────────────────────────────────┘
  `);
}

// ============================================================================
// Main Re-indexing Function
// ============================================================================

async function reindexGraph() {
  const options = parseArgs();

  // Show usage if no source specified
  if (!options.source) {
    printUsage();
    console.error("❌ Error: --source is required");
    process.exit(1);
  }

  console.log("🚀 eBee Graph Re-indexing Tool\n");
  console.log(`   Source: ${options.source}`);
  if (options.recordType) {
    console.log(`   Record Type: ${options.recordType}`);
  }
  if (options.force) {
    console.log(`   Mode: FORCE (re-index all)`);
  } else {
    console.log(`   Mode: SMART (only changed records)`);
  }
  if (options.dryRun) {
    console.log(`   Dry Run: Yes (no changes will be made)`);
  }
  console.log("");

  try {
    // Connect to MongoDB
    console.log("📡 Connecting to MongoDB...");
    await connectMongoose();
    console.log("✅ Connected to MongoDB\n");

    // Connect to Memgraph
    console.log("📡 Connecting to Memgraph...");
    const memgraphConnection = await connectMemgraph();
    console.log("✅ Connected to Memgraph\n");

    // Initialize stores
    const recordStore = new RecordStore();
    const graphStore = new GraphStore(memgraphConnection);

    // Initialize OpenAI client
    const openaiClient = new OpenAI({
      apiKey: env.LLM_API_KEY,
      baseURL: env.LLM_BASE_URL,
    });

    // Initialize adapters
    const adapters = new Map<SourceType, BaseRecordAdapter>();

    // Add Notion adapter
    if (options.source === "notion") {
      const notionClient = new NotionMCPClient();
      adapters.set("notion", new NotionAdapter(notionClient));
    }

    // TODO: Add other adapters as needed
    // adapters.set("slack", new SlackAdapter());
    // adapters.set("asana", new AsanaAdapter());

    // Ensure source is defined (we already checked above)
    const source = options.source!;

    // Run smart re-indexing
    console.log("🔄 Starting re-indexing...\n");
    const stats = await smartReindex(
      source,
      recordStore,
      graphStore,
      adapters,
      openaiClient,
      {
        force: options.force,
        recordType: options.recordType,
        dryRun: options.dryRun,
      }
    );

    // Display results
    displayStats(source, stats, options.dryRun || false);

    if (options.dryRun) {
      console.log("💡 Tip: Remove --dry-run to perform the re-indexing\n");
    } else {
      console.log("✅ Re-indexing complete!\n");
    }

    // Cleanup
    await memgraphConnection.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error during re-indexing:");
    console.error(error);
    process.exit(1);
  }
}

// ============================================================================
// Run Script
// ============================================================================

reindexGraph().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
