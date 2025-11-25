import { Tool } from "@modelcontextprotocol/sdk/types.js";

// Example local tool - add more tools as needed
export const localTools: Tool[] = [
  {
    name: "redis_get",
    description: "Get a value from Redis by key",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Redis key to retrieve",
        },
      },
      required: ["key"],
    },
  },
];

// Proxy management tools
export const proxyTools: Tool[] = [
  {
    name: "proxy_list_servers",
    description: "List all connected remote MCP servers",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "proxy_refresh_tools",
    description: "Refresh tools from a specific remote MCP server",
    inputSchema: {
      type: "object",
      properties: {
        serverName: {
          type: "string",
          description: "Name of the server to refresh tools from",
        },
      },
      required: ["serverName"],
    },
  },
];
