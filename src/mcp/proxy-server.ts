#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { connectMongo, MongoConnection } from "../shared/database/mongo.js";
import { connectQdrant, QdrantConnection } from "../shared/database/qdrant.js";
import {
  connectMemgraph,
  MemgraphConnection,
} from "../shared/database/memgraph.js";
import { connectRedis, RedisConnection } from "../shared/database/redis.js";
import {
  MCPClientManager,
  MCPServerConfig,
} from "../services/connector/mcp-clients/client.js";
import { loadProxyConfig, validateConfig } from "./config-loader.js";

interface ServiceConnections {
  mongo: MongoConnection;
  qdrant: QdrantConnection;
  memgraph: MemgraphConnection;
  redis: RedisConnection;
}

let services: ServiceConnections | null = null;
const mcpClientManager = new MCPClientManager();

// Initialize all services
const initializeServices = async (): Promise<ServiceConnections> => {
  if (services) {
    return services;
  }

  console.error("🚀 Initializing eBee services...");

  const [mongo, qdrant, memgraph, redis] = await Promise.all([
    connectMongo(),
    connectQdrant(),
    connectMemgraph(),
    connectRedis(),
  ]);

  services = { mongo, qdrant, memgraph, redis };
  console.error("✅ All services initialized successfully!");
  return services;
};

// Initialize remote MCP servers
const initializeRemoteServers = async (configs: MCPServerConfig[]) => {
  console.error("🔌 Connecting to remote MCP servers...");

  for (const config of configs) {
    try {
      await mcpClientManager.connect(config);
    } catch (error) {
      console.error(`Failed to connect to ${config.name}:`, error);
    }
  }

  const connectedServers = mcpClientManager.getConnectedServers();
  console.error(
    `✅ Connected to ${connectedServers.length} remote MCP server(s)`
  );
};

// Create MCP server
const server = new Server(
  {
    name: "ebee-proxy",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define local tools
const localTools: Tool[] = [
  {
    name: "mongo_query",
    description: "Execute a MongoDB query on a collection",
    inputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          description: "Name of the collection to query",
        },
        operation: {
          type: "string",
          enum: [
            "find",
            "findOne",
            "insertOne",
            "insertMany",
            "updateOne",
            "deleteOne",
          ],
          description: "MongoDB operation to perform",
        },
        query: {
          type: "object",
          description: "Query filter object",
        },
        data: {
          type: "object",
          description: "Data for insert/update operations",
        },
      },
      required: ["collection", "operation"],
    },
  },
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
  {
    name: "redis_set",
    description: "Set a value in Redis",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Redis key",
        },
        value: {
          type: "string",
          description: "Value to store",
        },
        ttl: {
          type: "number",
          description: "Time to live in seconds (optional)",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "memgraph_query",
    description: "Execute a Cypher query on Memgraph",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Cypher query to execute",
        },
        parameters: {
          type: "object",
          description: "Query parameters",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "qdrant_create_collection",
    description: "Create a new Qdrant collection",
    inputSchema: {
      type: "object",
      properties: {
        collectionName: {
          type: "string",
          description: "Name of the collection",
        },
        vectorSize: {
          type: "number",
          description: "Size of the vectors",
        },
        distance: {
          type: "string",
          enum: ["Cosine", "Euclid", "Dot"],
          description: "Distance metric to use",
          default: "Cosine",
        },
      },
      required: ["collectionName", "vectorSize"],
    },
  },
  {
    name: "qdrant_upsert",
    description: "Upsert points into a Qdrant collection",
    inputSchema: {
      type: "object",
      properties: {
        collectionName: {
          type: "string",
          description: "Name of the collection",
        },
        points: {
          type: "array",
          description: "Array of points to upsert",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["string", "number"],
                description: "Point ID",
              },
              vector: {
                type: "array",
                items: { type: "number" },
                description: "Vector values",
              },
              payload: {
                type: "object",
                description: "Point metadata",
              },
            },
            required: ["id", "vector"],
          },
        },
      },
      required: ["collectionName", "points"],
    },
  },
  {
    name: "qdrant_search",
    description: "Search for similar vectors in a Qdrant collection",
    inputSchema: {
      type: "object",
      properties: {
        collectionName: {
          type: "string",
          description: "Name of the collection",
        },
        vector: {
          type: "array",
          items: { type: "number" },
          description: "Query vector",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
          default: 10,
        },
      },
      required: ["collectionName", "vector"],
    },
  },
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

// List tools handler - combines local and remote tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Get remote tools
  const remoteToolsData = mcpClientManager.getAllTools();
  const remoteTools = remoteToolsData.map((t) => t.tool);

  // Combine local and remote tools
  const allTools = [...localTools, ...remoteTools];

  return { tools: allTools };
});

// Call tool handler - routes to local or remote handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Check if this is a proxied tool (prefixed with serverName__)
    const proxyMatch = name.match(/^(.+?)__(.+)$/);

    if (proxyMatch) {
      // This is a remote tool call
      const [, serverName, actualToolName] = proxyMatch;

      if (!mcpClientManager.isConnected(serverName)) {
        throw new Error(`Server ${serverName} is not connected`);
      }

      const response = await mcpClientManager.callTool(
        serverName,
        actualToolName,
        args as Record<string, unknown>
      );

      return response;
    }

    // Handle local tools
    const svc = await initializeServices();

    switch (name) {
      case "mongo_query": {
        const { collection, operation, query = {}, data } = args as any;
        const col = svc.mongo.db.collection(collection);

        let result;
        switch (operation) {
          case "find":
            result = await col.find(query).toArray();
            break;
          case "findOne":
            result = await col.findOne(query);
            break;
          case "insertOne":
            result = await col.insertOne(data);
            break;
          case "insertMany":
            result = await col.insertMany(data);
            break;
          case "updateOne":
            result = await col.updateOne(query, { $set: data });
            break;
          case "deleteOne":
            result = await col.deleteOne(query);
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "redis_get": {
        const { key } = args as { key: string };
        const value = await svc.redis.client.get(key);
        return {
          content: [
            {
              type: "text",
              text: value || "null",
            },
          ],
        };
      }

      case "redis_set": {
        const { key, value, ttl } = args as {
          key: string;
          value: string;
          ttl?: number;
        };
        if (ttl) {
          await svc.redis.client.setex(key, ttl, value);
        } else {
          await svc.redis.client.set(key, value);
        }
        return {
          content: [
            {
              type: "text",
              text: "OK",
            },
          ],
        };
      }

      case "memgraph_query": {
        const { query, parameters } = args as {
          query: string;
          parameters?: Record<string, any>;
        };
        const result = await svc.memgraph.executeQuery(query, parameters);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "qdrant_create_collection": {
        const { collectionName, vectorSize, distance = "Cosine" } = args as any;
        await svc.qdrant.createCollection(collectionName, vectorSize, distance);
        return {
          content: [
            {
              type: "text",
              text: `Collection "${collectionName}" created successfully`,
            },
          ],
        };
      }

      case "qdrant_upsert": {
        const { collectionName, points } = args as any;
        await svc.qdrant.client.upsert(collectionName, {
          wait: true,
          points,
        });
        return {
          content: [
            {
              type: "text",
              text: `Upserted ${points.length} points to "${collectionName}"`,
            },
          ],
        };
      }

      case "qdrant_search": {
        const { collectionName, vector, limit = 10 } = args as any;
        const results = await svc.qdrant.client.search(collectionName, {
          vector,
          limit,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

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
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
const runServer = async () => {
  // Load remote MCP server configurations from environment or config file
  const remoteServerConfigs = loadProxyConfig();

  // Validate configurations
  const validConfigs: MCPServerConfig[] = [];
  for (const config of remoteServerConfigs) {
    const error = validateConfig(config);
    if (error) {
      console.error(`Invalid config for ${config.name}: ${error}`);
    } else {
      validConfigs.push(config);
    }
  }

  // Connect to remote servers
  if (validConfigs.length > 0) {
    await initializeRemoteServers(validConfigs);
  } else {
    console.error("ℹ️ No remote MCP servers configured");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("eBee Proxy MCP server running on stdio");
};

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down MCP proxy server...");

  await mcpClientManager.disconnectAll();

  if (services) {
    await Promise.all([
      services.mongo.close(),
      services.qdrant.close(),
      services.memgraph.close(),
      services.redis.close(),
    ]);
  }
  process.exit(0);
});

runServer().catch((error) => {
  console.error("Fatal error in MCP proxy server:", error);
  process.exit(1);
});
