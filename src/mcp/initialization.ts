import {
  connectMemgraph,
  MemgraphConnection,
} from "../connections/memgraph.js";
import { connectQdrant, QdrantConnection } from "../connections/qdrant.js";
import { connectRedis, RedisConnection } from "../connections/redis.js";
import { MCPClientManager, MCPServerConfig } from "./client.js";
import {
  connectMongoose,
  MongooseConnection,
} from "../connections/mongoose.js";
import { SchemaInitializer } from "../connections/initializer.js";

export interface ServiceConnections {
  mongoose: MongooseConnection;
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

  const [mongoose, qdrant, memgraph, redis] = await Promise.all([
    connectMongoose(),
    connectQdrant(),
    connectMemgraph(),
    connectRedis(),
  ]);

  services = { mongoose, qdrant, memgraph, redis };
  console.error("✅ All services initialized successfully!");

  // Initialize database schemas
  const schemaInitializer = new SchemaInitializer(services);
  await schemaInitializer.initializeAll();

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
      services.qdrant.close(),
      services.memgraph.close(),
      services.redis.close(),
    ]);
  }
}
