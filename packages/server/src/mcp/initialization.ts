import { jsonSchemaToZod } from 'json-schema-to-zod';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { connectMemgraph, MemgraphConnection } from '../connections/memgraph.js';
import { connectMongoose, MongooseConnection } from '../connections/mongoose.js';
import { connectQdrant, QdrantConnection } from '../connections/qdrant.js';
import { connectRedis, RedisConnection } from '../connections/redis.js';
import { resolveSerializedZodOutput } from '../utils/resolveSerializedZodOutput.js';
import { mcpClientManager } from './client.js';
import type { DataSource } from '../models/data-source.model.js';
import { DataSourceModel as DataSourceModelImpl } from '../models/data-source.model.js';
import { registerLightRAGTool } from '../services/search/lightrag-tool.js';
import { initWorkers } from '../services/queue/index.js';
import { VectorStore } from '../stores/vector.store.js';
import logger from '../utils/logger.js';

export async function initializeRemoteServers(
  dataSources: (DataSource & { _id: any })[],
  mcpSever: McpServer,
  skipMcpProxy = false,
): Promise<void> {
  await Promise.all(
    dataSources.map(async (dataSource) => {
      try {
        await mcpClientManager.connect(dataSource);

        if (skipMcpProxy) return;

        // Get tools only from the server we just connected to
        const tools = mcpClientManager.getServerTools(dataSource.name);

        tools.forEach((tool) => {
          try {
            let inputSchema: any;
            let outputSchema: any;

            try {
              const inputSchemaStr = jsonSchemaToZod(tool.inputSchema);
              inputSchema = resolveSerializedZodOutput(inputSchemaStr) as {};
            } catch (err) {
              logger.warn(
                {
                  err,
                  toolName: tool.name,
                  serverName: dataSource.name,
                },
                `Failed to parse inputSchema for tool ${tool.name}, using raw schema`,
              );
              inputSchema = tool.inputSchema;
            }

            if (tool.outputSchema) {
              try {
                const outputSchemaStr = jsonSchemaToZod(tool.outputSchema, {
                  module: 'esm',
                });
                outputSchema = resolveSerializedZodOutput(outputSchemaStr) as {};
              } catch (err) {
                logger.warn(
                  {
                    err,
                    toolName: tool.name,
                    serverName: dataSource.name,
                  },
                  `Failed to parse outputSchema for tool ${tool.name}, using raw schema`,
                );
                outputSchema = tool.outputSchema;
              }
            }

            mcpSever.registerTool(
              `${dataSource.name}__${tool.name}`,
              {
                description: `[${dataSource.name}] ${tool.description}`,
                title: tool.title,
                _meta: tool._meta,
                annotations: tool.annotations,
                inputSchema,
                outputSchema,
              },
              async (args: any, _extra: any) => {
                return await mcpClientManager.callTool(dataSource.name, tool.name, args);
              },
            );
          } catch (err) {
            logger.error(
              {
                err,
                toolName: tool.name,
                serverName: dataSource.name,
              },
              `Failed to register tool ${tool.name}`,
            );
          }
        });
      } catch (err) {
        logger.error(
          { err, configName: dataSource.name },
          `Failed to connect to ${dataSource.name}`,
        );
      }
    }),
  );

  const connectedServers = mcpClientManager.getConnectedServers();
  logger.info({
    msg: 'Connected to remote MCP servers',
    count: connectedServers.length,
    servers: connectedServers,
  });
}

const connectMcpServers = async (skipMcpProxy: boolean) => {
  const dataSources = await DataSourceModelImpl.loadMCPServers();
  if (dataSources.length > 0) {
    await initializeRemoteServers(dataSources, mcpServer, skipMcpProxy);
  } else {
    logger.info({ msg: 'No remote MCP servers configured' });
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
  name: 'almanac',
  version: '0.1.0',
});

export async function initializeServices(skipMcpProxy = false): Promise<ServiceConnections> {
  if (services) {
    return services;
  }

  const [mongoose, qdrant, memgraph, redis] = await Promise.all([
    connectMongoose(),
    connectQdrant(),
    connectMemgraph(),
    connectRedis(),
  ]);

  services = { mongoose, qdrant, memgraph, redis };
  logger.info({ msg: '✅ All services initialized successfully' });

  // Register LightRAG tool

  const vectorStore = new VectorStore(qdrant);

  await Promise.all([
    registerLightRAGTool(mcpServer, { memgraph, qdrant }),
    // Ensure Qdrant collection exists
    vectorStore.ensureCollection(),
    connectMcpServers(skipMcpProxy),
  ]);

  // start the bullmq workers. Don't wait for them, otherwise it'll hang
  initWorkers().catch((e) => logger.error({ err: e }, 'Worker initialization error'));

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
