import { loadProxyConfig } from "../../mcp/config-loader.js";
import { RecordStore } from "../../stores/record.store.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { NotionAdapter } from "../indexing/adapters/notion-adapter.js";
import { connectMongoose } from "../../connections/mongoose.js";
import { syncAllRecords } from "../indexing/db-indexer.service.js";

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
        const recordStore = new RecordStore();

        if (config.name === "notion") {
          const notionClient = new NotionMCPClient();
          const notionAdapter = new NotionAdapter(notionClient);
          await syncAllRecords(recordStore, "notion", notionAdapter);

          console.log("✅ Saved records into document DB");
        }
      })
    );
  }
}
