#!/usr/bin/env node

/**
 * Example: One-time Notion sync to MongoDB
 *
 * This script demonstrates how to sync all Notion entities to MongoDB
 * Run with: tsx src/examples/notion-sync-example.ts
 */

import "dotenv/config";
import { connectMongoose } from "../src/connections/mongoose.js";
import { MCPClientManager } from "../src/mcp/client.js";
import { NotionMCPClient } from "../src/services/indexing/sources/notion/mcpClient.js";
import { NotionAdapter } from "../src/services/sync/adapters/notion-adapter.js";
import { SimpleSyncService } from "../src/services/sync/simple-sync.service.js";
import { SyncedEntityStore } from "../src/stores/synced-entity.store.js";
import { loadProxyConfig } from "../src/mcp/config-loader.js";

async function main() {
  console.log("🚀 Starting Notion sync example\n");

  // 1. Connect to MongoDB
  console.log("📦 Connecting to MongoDB...");
  const mongoConnection = await connectMongoose();
  console.log("✅ MongoDB connected\n");

  try {
    // 2. Initialize stores
    const entityStore = new SyncedEntityStore();

    // 3. Initialize MCP client manager and connect to Notion
    console.log("🔌 Connecting to Notion MCP server...");
    const mcpManager = new MCPClientManager();

    const validConfigs = await loadProxyConfig();
    const c = validConfigs[0]!;

    // Connect to Notion MCP server
    await mcpManager.connect({
      ...c.toObject(),
      env: c.env ? Object.fromEntries(c.env.entries()) : undefined,
      headers: c.headers ? Object.fromEntries(c.headers.entries()) : undefined,
    });
    console.log("✅ Notion MCP server connected\n");

    // 4. Create Notion MCP client wrapper
    const notionClient = new NotionMCPClient(mcpManager);

    // 5. Create Notion adapter
    const notionAdapter = new NotionAdapter(notionClient);

    // 6. Create sync service
    const syncService = new SimpleSyncService(entityStore);

    // 7. Perform sync
    console.log("🔄 Starting full sync...\n");
    const result = await syncService.syncAll("notion", notionAdapter);

    // 8. Display results
    console.log("\n" + "=".repeat(60));
    console.log("📊 SYNC RESULTS");
    console.log("=".repeat(60));
    console.log(`Job ID: ${result.jobId}`);
    console.log(`Success: ${result.success ? "✅" : "❌"}`);
    console.log(`\nStatistics:`);
    console.log(`  Total Processed: ${result.stats.total}`);
    console.log(`  Created: ${result.stats.created}`);
    console.log(`  Updated: ${result.stats.updated}`);
    console.log(`  Failed: ${result.stats.failed}`);
    console.log(`  Duration: ${(result.stats.duration / 1000).toFixed(2)}s`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors (${result.errors.length}):`);
      result.errors.slice(0, 5).forEach((error) => {
        console.log(`  - ${error.entityId}: ${error.error}`);
      });
      if (result.errors.length > 5) {
        console.log(`  ... and ${result.errors.length - 5} more`);
      }
    }

    // 9. Get final stats
    console.log("\n" + "=".repeat(60));
    console.log("📈 DATABASE STATS");
    console.log("=".repeat(60));
    const stats = await syncService.getStats("notion");
    console.log(`Total Entities: ${stats.total}`);
    console.log(`Deleted: ${stats.deleted}`);
    console.log(`Last Synced: ${stats.lastSynced?.toISOString() || "Never"}`);
    console.log(`\nBy Type:`);
    Object.entries(stats.byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    console.log("\n✅ Sync completed successfully!");

    // Cleanup
    await mcpManager.disconnectAll();
    await mongoConnection.close();
  } catch (error) {
    console.error("\n❌ Sync failed:", error);
    await mongoConnection.close();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
