import "dotenv/config";
import { SyncService } from "../src/services/sync/sync.service.js";
import { getServices } from "../src/mcp/initialization.js";

/**
 * Sync records from sources to MongoDB
 * This script only syncs records - it does NOT index to vector or graph databases.
 *
 * For indexing:
 * - Use scripts/index-graph.ts for graph indexing
 * - Use scripts/index-vectors.ts for vector indexing
 */

const run = async () => {
  console.log("🔄 Starting record sync (MongoDB only)");
  console.log("=======================================\n");

  // init db connections and mcp server
  await getServices();

  const syncService = new SyncService();
  await syncService.syncAll();

  console.log("\n✨ Record sync completed");
  console.log("\nNext steps:");
  console.log("  - Run 'pnpm tsx scripts/index-graph.ts' to index to graph DB");
  console.log(
    "  - Run 'pnpm tsx scripts/index-vectors.ts' to index to vector DB"
  );
};

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ Error during sync:", e);
    process.exit(1);
  });
