import {
  connectMemgraph,
  MemgraphConnection,
} from "../shared/database/memgraph.js";
import { connectMongo, MongoConnection } from "../shared/database/mongo.js";
import { connectQdrant, QdrantConnection } from "../shared/database/qdrant.js";
import { connectRedis, RedisConnection } from "../shared/database/redis.js";
import {
  MCPClientManager,
  MCPServerConfig,
} from "../services/connector/mcp-clients/client.js";

export interface ServiceConnections {
  mongo: MongoConnection;
  qdrant: QdrantConnection;
  memgraph: MemgraphConnection;
  redis: RedisConnection;
}

let services: ServiceConnections | null = null;

export async function initializeServices(): Promise<ServiceConnections> {
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
}

export async function initializeRemoteServers(
  configs: MCPServerConfig[],
  mcpClientManager: MCPClientManager
): Promise<void> {
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
}

export async function shutdownServices(): Promise<void> {
  if (services) {
    await Promise.all([
      services.mongo.close(),
      services.qdrant.close(),
      services.memgraph.close(),
      services.redis.close(),
    ]);
  }
}
