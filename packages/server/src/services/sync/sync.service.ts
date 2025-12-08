import { loadProxyConfig } from "../../mcp/config-loader.js";
import { RecordStore } from "../../stores/record.store.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { NotionAdapter } from "./adapters/notion-adapter.js";
import { GitHubMCPClient } from "../sources/github/mcpClient.js";
import { GitHubAdapter } from "./adapters/github-adapter.js";
import { syncAllRecords } from "./record-sync.service.js";

import { MCPServerConfig } from "../../models/mcp-config.model.js";
import { BaseRecordAdapter } from "./adapters/base-adapter.js";
import { SlackAdapter } from "./adapters/slack-adapter.js";
import { FathomMCPClient } from "../sources/fathom/mcpClient.js";
import { FathomAdapter } from "./adapters/fathom-adapter.js";
import logger from "../../utils/logger.js";

export const syncMcpServer = async (mcpConfig: MCPServerConfig) => {
  const recordStore = new RecordStore();
  let adapter: BaseRecordAdapter | null = null;
  if (mcpConfig.name === "notion") {
    const notionClient = new NotionMCPClient();
    adapter = new NotionAdapter(notionClient);
    await syncAllRecords(recordStore, "notion", adapter);

    logger.info("✅ Saved records into document DB");
  } else if (mcpConfig.name === "github") {
    const githubClient = new GitHubMCPClient();
    // Get owner from environment or config
    adapter = new GitHubAdapter(githubClient, {
      includeArchived: false,
      includeForks: true,
      includePrivate: true,
    });
    await syncAllRecords(recordStore, "github", adapter);

    logger.info("✅ Saved GitHub records into document DB");
  } else if (mcpConfig.name === "fathom") {
    const fathomClient = new FathomMCPClient();
    // Get owner from environment or config
    adapter = new FathomAdapter(fathomClient, {
      includeActionItems: true,
      includeNotes: true,
      includeHighlights: true,
      includeTeamMembers: true,
      includeTeams: true,
      includeTranscripts: true,
    });
    await syncAllRecords(recordStore, "fathom", adapter);

    logger.info("✅ Saved Fathom records into document DB");
  } else if (mcpConfig.name === "slack") {
    adapter = new SlackAdapter(mcpConfig.env?.get("SLACK_BOT_TOKEN") as string);
  }

  if (!adapter) throw new Error("Unsupported MCP server: " + mcpConfig.name);

  await syncAllRecords(recordStore, mcpConfig.name, adapter);

  logger.info("✅ Saved records into document DB");
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
