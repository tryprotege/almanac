import { loadProxyConfig } from "../../mcp/config-loader.js";
import { RecordStore } from "../../stores/record.store.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { NotionAdapter } from "./adapters/notion-adapter.js";
import { GitHubMCPClient } from "../sources/github/mcpClient.js";
import { GitHubAdapter } from "./adapters/github-adapter.js";
import { syncAllRecords } from "./record-sync.service.js";
import { SourceType } from "../../types/index.js";

import { MCPServerConfig } from "../../models/mcp-config.model.js";

export const syncMcpServer = async (mcpConfig: MCPServerConfig) => {
  const recordStore = new RecordStore();

  if (mcpConfig.name === "notion") {
    const notionClient = new NotionMCPClient();
    const notionAdapter = new NotionAdapter(notionClient);
    await syncAllRecords(recordStore, "notion", notionAdapter);

    console.log("✅ Saved records into document DB");
  }

  if (mcpConfig.name === "github") {
    const githubClient = new GitHubMCPClient();
    // Get owner from environment or config
    const githubAdapter = new GitHubAdapter(githubClient, {
      includeArchived: false,
      includeForks: true,
      includePrivate: true,
    });
    await syncAllRecords(recordStore, "github", githubAdapter);

    console.log("✅ Saved GitHub records into document DB");
  }
};

/**
 * Sync records from all configured sources to MongoDB (direct execution)
 * This bypasses the queue and runs synchronously - useful for testing or single-run scripts
 * @deprecated Use queueAllRemoteMcpServers() with the worker for production
 */
export async function syncAllRemoteMcpServers(): Promise<void> {
  const validConfigs = await loadProxyConfig();

  await Promise.all(validConfigs.map(syncMcpServer));
}
