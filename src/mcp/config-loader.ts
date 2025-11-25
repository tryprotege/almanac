import { readFileSync } from "fs";
import { MCPServerConfig } from "../services/connector/mcp-clients/client.js";

export interface MCPProxyConfig {
  remoteServers: MCPServerConfig[];
}

/**
 * Load MCP proxy configuration from a file or environment variable
 */
export function loadProxyConfig(): MCPServerConfig[] {
  // First, try to load from environment variable
  const envConfig = process.env.MCP_REMOTE_SERVERS;
  if (envConfig) {
    try {
      const parsed = JSON.parse(envConfig);
      if (Array.isArray(parsed)) {
        return parsed as MCPServerConfig[];
      }
      if (parsed.remoteServers && Array.isArray(parsed.remoteServers)) {
        return parsed.remoteServers as MCPServerConfig[];
      }
    } catch (error) {
      console.error("Failed to parse MCP_REMOTE_SERVERS:", error);
    }
  }

  // Second, try to load from config file
  const configPath = process.env.MCP_CONFIG_PATH || "./mcp-config.json";
  try {
    const configContent = readFileSync(configPath, "utf-8");
    const config: MCPProxyConfig = JSON.parse(configContent);
    return config.remoteServers || [];
  } catch (error) {
    // Config file not found or invalid - return empty array
    if ((error as any).code !== "ENOENT") {
      console.error(`Failed to load config from ${configPath}:`, error);
    }
    return [];
  }
}

/**
 * Validate MCP server configuration
 */
export function validateConfig(config: MCPServerConfig): string | null {
  if (!config.name) {
    return "Server name is required";
  }

  if (!config.type || !["stdio", "sse"].includes(config.type)) {
    return "Server type must be 'stdio' or 'sse'";
  }

  if (config.type === "stdio" && !config.command) {
    return "stdio server requires 'command' field";
  }

  if (config.type === "sse" && !config.url) {
    return "sse server requires 'url' field";
  }

  return null;
}
