import { MongoConnection } from "../shared/database/mongo.js";
import { QdrantConnection } from "../shared/database/qdrant.js";
import { MemgraphConnection } from "../shared/database/memgraph.js";
import { RedisConnection } from "../shared/database/redis.js";
import { MCPClientManager } from "../services/connector/mcp-clients/client.js";

export interface ServiceConnections {
  mongo: MongoConnection;
  qdrant: QdrantConnection;
  memgraph: MemgraphConnection;
  redis: RedisConnection;
}

/**
 * Handle local tool calls
 * Add more tool handlers as needed following this pattern
 */
export async function handleLocalTool(
  name: string,
  args: any,
  services: ServiceConnections
) {
  switch (name) {
    case "redis_get": {
      const { key } = args as { key: string };
      const value = await services.redis.client.get(key);
      return {
        content: [
          {
            type: "text",
            text: value || "null",
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Handle proxy management tool calls
 */
export async function handleProxyTool(
  name: string,
  args: any,
  mcpClientManager: MCPClientManager
) {
  switch (name) {
    case "proxy_list_servers": {
      const servers = mcpClientManager.getConnectedServers();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ servers }, null, 2),
          },
        ],
      };
    }

    case "proxy_refresh_tools": {
      const { serverName } = args as { serverName: string };
      await mcpClientManager.refreshTools(serverName);
      return {
        content: [
          {
            type: "text",
            text: `Tools refreshed for server: ${serverName}`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown proxy tool: ${name}`);
  }
}
