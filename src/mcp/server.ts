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
import { MongoRepository } from "../repositories/index.js";
import { QdrantRepository } from "../repositories/index.js";
import { MemgraphRepository } from "../repositories/index.js";
import { ChunkerService } from "../services/indexing/chunker.js";
import { EmbedderService } from "../services/indexing/embedder.js";
import { IndexingService } from "../services/indexing/indexing.service.js";
import { env } from "../env.js";

interface ServiceConnections {
  mongo: MongoConnection;
  qdrant: QdrantConnection;
  memgraph: MemgraphConnection;
  redis: RedisConnection;
}

let services: ServiceConnections | null = null;

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

// Create MCP server
const server = new Server(
  {
    name: "ebee-oss",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
const tools: Tool[] = [
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
    name: "index_mcp_resource",
    description:
      "Index data from an external MCP tool result into ebee's search system",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: {
          type: "string",
          description: "Workspace identifier",
        },
        source: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "notion",
                "slack",
                "calendar",
                "fathom",
                "whatsapp",
                "codebase",
                "asana",
                "jira",
                "google_drive",
              ],
              description: "Source type",
            },
            serverId: {
              type: "string",
              description: "MCP server identifier",
            },
          },
          required: ["type", "serverId"],
        },
        toolCall: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the tool that was called",
            },
            arguments: {
              type: "object",
              description: "Arguments passed to the tool",
            },
          },
          required: ["name", "arguments"],
        },
        toolResult: {
          type: "object",
          properties: {
            content: {
              type: "array",
              description: "Content returned from the MCP tool",
            },
            isError: {
              type: "boolean",
              description: "Whether the result is an error",
            },
          },
          required: ["content"],
        },
      },
      required: ["workspaceId", "source", "toolCall", "toolResult"],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Initialize services if not already done
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

      case "index_mcp_resource": {
        const { workspaceId, source, toolCall, toolResult } = args as any;

        // Initialize indexing service
        const mongoRepo = new MongoRepository(svc.mongo);
        const qdrantRepo = new QdrantRepository(svc.qdrant);
        const memgraphRepo = new MemgraphRepository(svc.memgraph);
        const chunker = new ChunkerService();

        // Create LLM client for embeddings
        const { createLLMClient } = await import(
          "../services/llm/providers.js"
        );
        const llmClient = createLLMClient(
          env.LLM_PROVIDER,
          env.LLM_API_KEY,
          env.LLM_BASE_URL
        );

        const embedder = new EmbedderService({
          client: llmClient,
          model: env.LLM_EMBEDDING_MODEL,
        });

        const indexingService = new IndexingService(
          mongoRepo,
          qdrantRepo,
          memgraphRepo,
          chunker,
          embedder
        );

        // Process the index request
        const response = await indexingService.index({
          workspaceId,
          source,
          toolCall,
          toolResult,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("eBee MCP server running on stdio");
};

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down MCP server...");
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
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
