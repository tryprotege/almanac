import { MCPClientManager } from "../../mcp/client.js";
import { loadProxyConfig } from "../../mcp/config-loader.js";
import { RecordStore } from "../../stores/record.store.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { NotionAdapter } from "../indexing/adapters/notion-adapter.js";
import { SimpleSyncService } from "../indexing/db-indexer.service.js";
import { connectMongoose } from "../../connections/mongoose.js";

/**
 * Sync Service
 * Handles syncing records from external sources to MongoDB
 */
export class SyncService {
  /**
   * Sync records from all configured sources to MongoDB
   */
  async syncAll(): Promise<void> {
    // Connect to MongoDB before any database operations
    await connectMongoose();

    const validConfigs = await loadProxyConfig();

    await Promise.all(
      validConfigs.map(async (config) => {
        const mcpManager = new MCPClientManager();

        await mcpManager.connect({
          ...config.toObject(),
          env: config.env
            ? Object.fromEntries(config.env.entries())
            : undefined,
          headers: config.headers
            ? Object.fromEntries(config.headers.entries())
            : undefined,
        });

        const recordStore = new RecordStore();

        if (config.name === "notion") {
          const notionClient = new NotionMCPClient(mcpManager);
          const notionAdapter = new NotionAdapter(notionClient);
          const syncService = new SimpleSyncService(recordStore);

          await syncService.syncAll("notion", notionAdapter);

          console.log("✅ Saved records into document DB");
        }
      })
    );
  }
}
