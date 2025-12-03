import { MCPServerConfigModel } from "../models/mcp-config.model.js";
import { MCPServerConfig } from "./client.js";

/**
 * Load MCP proxy configuration from a file or environment variable
 */
export async function loadProxyConfig() {
  const remoteServerConfigs = await MCPServerConfigModel.find({
    isDisabled: false,
  });

  const validConfigs = remoteServerConfigs.filter((config) => {
    const error = validateConfig(config);
    if (error) {
      console.error(`Invalid config for ${config.name}: ${error}`);
      return false;
    }
    return true;
  });

  return validConfigs;
}

/**
 * Validate MCP server configuration
 */
export function validateConfig(
  config: Pick<MCPServerConfig, "name" | "type" | "command" | "url">
): string | null {
  if (!config.name) {
    return "Server name is required";
  }

  if (
    !config.type ||
    !["stdio", "sse", "streamable-http"].includes(config.type)
  ) {
    return "Server type must be 'stdio' or 'sse' or 'streamable-http'";
  }

  if (config.type === "stdio" && !config.command) {
    return "stdio server requires 'command' field";
  }

  if (["sse", "streamable-http"].includes(config.type) && !config.url) {
    return "sse server requires 'url' field";
  }

  return null;
}
