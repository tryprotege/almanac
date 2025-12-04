import { loadProxyConfig } from "../../mcp/config-loader.js";
import { RecordStore } from "../../stores/record.store.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { NotionAdapter } from "./adapters/notion-adapter.js";
import { syncAllRecords } from "./record-sync.service.js";

import { MCPServerConfig } from "../../models/mcp-config.model.js";
import { BaseRecordAdapter } from "./adapters/base-adapter.js";
import { SlackAdapter } from "./adapters/slack-adapter.js";

export const syncMcpServer = async (mcpConfig: MCPServerConfig) => {
  const recordStore = new RecordStore();
  let adapter: BaseRecordAdapter;
  if (mcpConfig.name === "notion") {
    const notionClient = new NotionMCPClient();
    adapter = new NotionAdapter(notionClient);
  } else if (mcpConfig.name === "slack") {
    adapter = new SlackAdapter(mcpConfig.env?.get("SLACK_BOT_TOKEN") as string);
  } else {
    throw new Error("Unsupported MCP server: " + mcpConfig.name);
  }

  await syncAllRecords(recordStore, mcpConfig.name, adapter);

  console.log("✅ Saved records into document DB");
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
