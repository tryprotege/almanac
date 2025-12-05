import "dotenv/config";
import { syncAllRemoteMcpServers } from "../src/services/sync/sync.service.js";
import { initializeServices } from "../src/mcp/initialization.js";
import logger from "../src/utils/logger.js";

/**
 * Sync records from sources to MongoDB
 * This script only syncs records - it does NOT index to vector or graph databases.
 *
 * For indexing:
 * - Use scripts/index-graph.ts for graph indexing
 * - Use scripts/index-vectors.ts for vector indexing
 */

const run = async () => {
  logger.info("🔄 Starting record sync (MongoDB only)");
  logger.info("=======================================\n");

  // init db connections and mcp server
  await initializeServices();

  await syncAllRemoteMcpServers();

  logger.info("\n✨ Record sync completed");
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
