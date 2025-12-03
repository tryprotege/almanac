import { jsonSchemaToZod } from "json-schema-to-zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  connectMemgraph,
  MemgraphConnection,
} from "../connections/memgraph.js";
import {
  connectMongoose,
  MongooseConnection,
} from "../connections/mongoose.js";
import { connectQdrant, QdrantConnection } from "../connections/qdrant.js";
import { connectRedis, RedisConnection } from "../connections/redis.js";
import { resolveSerializedZodOutput } from "../utils/resolveSerializedZodOutput.js";
import { mcpClientManager, MCPServerConfig } from "./client.js";
import { loadProxyConfig } from "./config-loader.js";
import { registerLightRAGTool } from "../services/search/lightrag-tool.js";
import { initWorkers } from "../services/queue/index.js";
import { VectorStore } from "../stores/vector.store.js";
import logger from "../utils/logger.js";

export async function initializeRemoteServers(
  configs: MCPServerConfig[],
  mcpSever: McpServer
): Promise<void> {
  logger.info("Connecting to remote MCP servers...");

  for (const config of configs) {
    try {
      await mcpClientManager.connect(config);

      const tools = await mcpClientManager.getAllTools();

      tools.forEach(({ tool }) => {
        mcpSever.registerTool(
          tool.name,
          {
            description: tool.description,
            title: tool.title,
            _meta: tool._meta,
            annotations: tool.annotations,
            inputSchema: resolveSerializedZodOutput(
              jsonSchemaToZod(tool.inputSchema)
            ) as {},
            outputSchema: tool.outputSchema
              ? (resolveSerializedZodOutput(
                  jsonSchemaToZod(tool.outputSchema, { module: "esm" })
                ) as {})
              : undefined,
          },
          async (args, _extra) => {
            return await mcpClientManager.callTool(
              config.name,
              tool.name,
              args
            );
          }
        );
      });
    } catch (error) {
      logger.error(
        { error, configName: config.name },
        `Failed to connect to ${config.name}`
      );
    }
  }

  const connectedServers = mcpClientManager.getConnectedServers();
  logger.info(`Connected to ${connectedServers.length} remote MCP server(s)`);
}

const connectMcpServers = async () => {
  const validConfigs = await loadProxyConfig();
  if (validConfigs.length > 0) {
    await initializeRemoteServers(
      validConfigs.map((c) => ({
        ...c.toObject(),
        env: c.env ? Object.fromEntries(c.env.entries()) : undefined,
        headers: c.headers
          ? Object.fromEntries(c.headers.entries())
          : undefined,
      })),
      mcpServer
    );
  } else {
    logger.info("No remote MCP servers configured");
  }
};

export interface ServiceConnections {
  mongoose: MongooseConnection;
  qdrant: QdrantConnection;
  memgraph: MemgraphConnection;
  redis: RedisConnection;
}

let services: ServiceConnections | null = null;

// Create MCP server
export const mcpServer = new McpServer({
  name: "ebee-oss",
  version: "0.1.0",
});

export async function initializeServices(): Promise<ServiceConnections> {
  if (services) {
    return services;
  }

  logger.info("Initializing eBee services...");

  const [mongoose, qdrant, memgraph, redis] = await Promise.all([
    connectMongoose(),
    connectQdrant(),
    connectMemgraph(),
    connectRedis(),
  ]);

  services = { mongoose, qdrant, memgraph, redis };
  logger.info("All services initialized successfully!");

  // Register LightRAG tool

  const vectorStore = new VectorStore(qdrant);

  await Promise.all([
    registerLightRAGTool(mcpServer, { memgraph, qdrant }),
    // Ensure Qdrant collection exists
    vectorStore.ensureCollection(),
    connectMcpServers(),
  ]);

  // start the bullmq workers. Don't wait for them, otherwise it'll hang
  initWorkers().catch((e) =>
    logger.error({ error: e }, "Worker initialization error")
  );

  return services;
}

export async function shutdownServices(): Promise<void> {
  if (services) {
    await Promise.all([
      services.qdrant.close(),
      services.memgraph.close(),
      services.redis.close(),
      services.mongoose.close(),
    ]);
  }
}
