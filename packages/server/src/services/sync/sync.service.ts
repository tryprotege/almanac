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
  let adapter: BaseRecordAdapter;

  // Create adapter based on source type
  if (mcpConfig.name === "notion") {
    const notionClient = new NotionMCPClient();
    adapter = new NotionAdapter(notionClient);
  } else if (mcpConfig.name === "github") {
    const githubClient = new GitHubMCPClient();
    adapter = new GitHubAdapter(githubClient, {
      includeArchived: false,
      includeForks: true,
      includePrivate: true,
    });
  } else if (mcpConfig.name === "fathom") {
    const fathomClient = new FathomMCPClient();
    adapter = new FathomAdapter(fathomClient, {
      includeActionItems: true,
      includeNotes: true,
      includeHighlights: true,
      includeTeamMembers: true,
      includeTeams: true,
      includeTranscripts: true,
    });
  } else if (mcpConfig.name === "slack") {
    adapter = new SlackAdapter(mcpConfig.env?.get("SLACK_BOT_TOKEN") as string);
  } else {
    throw new Error(`Unsupported MCP server: ${mcpConfig.name}`);
  }

  // Sync records for this source
  await syncAllRecords(recordStore, mcpConfig.name, adapter);
};

/**
 * Sync records from all configured sources to MongoDB (direct execution)
 * This bypasses the queue and runs synchronously - useful for testing or single-run scripts
 * @deprecated Use queueAllRemoteMcpServers() with the worker for production
 */
export async function syncAllRemoteMcpServers(): Promise<void> {
  const validConfigs = await loadProxyConfig();

  // Use allSettled to continue syncing even if one source fails
  const results = await Promise.allSettled(validConfigs.map(syncMcpServer));

  // Log results
  let successCount = 0;
  let failureCount = 0;

  const failures: Array<{ source: string; error: any }> = [];

  results.forEach((result, index) => {
    const config = validConfigs[index];
    if (result.status === "fulfilled") {
      successCount++;
    } else {
      failureCount++;
      failures.push({ source: config.name, error: result.reason });
      logger.error(
        { err: result.reason, source: config.name },
        `❌ Failed to sync source`
      );
    }
  });

  logger.info({
    msg: "📊 Sync Summary",
    successful: successCount,
    failed: failureCount,
    total: validConfigs.length,
    failures: failures.length > 0 ? failures.map((f) => f.source) : undefined,
  });
}
