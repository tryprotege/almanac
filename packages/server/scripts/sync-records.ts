import "dotenv/config";
import { syncMcpServer } from "../src/services/sync/sync.service.js";
import { initializeServices } from "../src/mcp/initialization.js";
import { loadProxyConfig } from "../src/mcp/config-loader.js";
import { SourceType } from "../src/types/index.js";
import logger from "../src/utils/logger.js";

/**
 * Sync records from sources to MongoDB
 * This script only syncs records - it does NOT index to vector or graph databases.
 *
 * Usage:
 *   pnpm tsx scripts/sync-records.ts
 *   pnpm tsx scripts/sync-records.ts --source=fathom
 *   pnpm tsx scripts/sync-records.ts --source=notion
 *   pnpm tsx scripts/sync-records.ts --limit=100
 *
 * For indexing:
 * - Use scripts/index-graph.ts for graph indexing
 * - Use scripts/index-vectors.ts for vector indexing
 */

interface ScriptOptions {
  source?: SourceType;
  limit?: number;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--source=")) {
      options.source = arg.split("=")[1] as SourceType;
    } else if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.split("=")[1], 10);
    }
  }

  return options;
}

const run = async () => {
  const options = parseArgs();

  logger.info({
    msg: "🔄 Starting record sync (MongoDB only)",
    source: options.source,
    limit: options.limit,
  });

  // init db connections and mcp server
  await initializeServices();

  const validConfigs = await loadProxyConfig();

  // Use allSettled to continue syncing even if one source fails
  const results = await Promise.allSettled(
    validConfigs
      .filter((config) => !options.source || config.name === options.source)
      .map((config) => syncMcpServer(config, { limit: options.limit }))
  );

  // Log results
  let successCount = 0;
  let failureCount = 0;
  const filteredConfigs = validConfigs.filter(
    (config) => !options.source || config.name === options.source
  );

  results.forEach((result, index) => {
    const config = filteredConfigs[index];
    if (result.status === "fulfilled") {
      successCount++;
      logger.info(`✅ Successfully synced ${config.name}`);
    } else {
      failureCount++;
      logger.error(
        { err: result.reason, source: config.name },
        `❌ Failed to sync ${config.name}`
      );
    }
  });

  logger.info({
    msg: `\n📊 Sync Summary: ${successCount}/${filteredConfigs.length} source(s) synced successfully`,
  });

  if (failureCount > 0) {
    logger.warn(`⚠️  ${failureCount} source(s) failed to sync`);
  }

  logger.info("\nNext steps:");
  logger.info("  - Run 'pnpm tsx scripts/index-graph.ts' to index to graph DB");
  logger.info(
    "  - Run 'pnpm tsx scripts/index-vectors.ts' to index to vector DB"
  );
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Error during sync");
    process.exit(1);
  });
