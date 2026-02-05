import { jsonSchemaToZod } from 'json-schema-to-zod';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { connectMemgraph, MemgraphConnection } from '../connections/memgraph.js';
import { connectMongoose, MongooseConnection } from '../connections/mongoose.js';
import { connectQdrant, QdrantConnection } from '../connections/qdrant.js';
import { connectRedis, RedisConnection } from '../connections/redis.js';
import { env } from '../env.js';
import { resolveSerializedZodOutput } from '../utils/resolveSerializedZodOutput.js';
import { mcpClientManager } from './client.js';
import type { DataSource } from '../models/data-source.model.js';
import { DataSourceModel as DataSourceModelImpl } from '../models/data-source.model.js';
import { registerLightRAGTool } from '../services/search/lightrag-tool.js';
import { initWorkers } from '../services/queue/index.js';
import { VectorStore } from '../stores/vector.store.js';
import logger from '../utils/logger.js';

/**
 * Register tools from a connected data source on the MCP server
 * This function can be called both at startup and when manually connecting via API
 */
export async function registerDataSourceTools(
  dataSourceName: string,
  mcpSever: McpServer,
): Promise<number> {
  const tools = mcpClientManager.getServerTools(dataSourceName);

  if (tools.length === 0) {
    logger.warn(
      { serverName: dataSourceName },
      'No tools available to register - tool cache may be empty',
    );
    return 0;
  }

  let registeredCount = 0;
  let skippedWriteTools = 0;

  tools.forEach((tool) => {
    // Filter out write tools if DISABLE_WRITE_TOOLS is enabled (default: false)
    if (env.DISABLE_WRITE_TOOLS && mcpClientManager.isWriteTool(dataSourceName, tool.name)) {
      logger.info(
        {
          serverName: dataSourceName,
          toolName: tool.name,
        },
        `Skipping write tool ${tool.name} - write operations are disabled via DISABLE_WRITE_TOOLS`,
      );
      skippedWriteTools++;
      return;
    }

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
            serverName: dataSourceName,
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
              serverName: dataSourceName,
            },
            `Failed to parse outputSchema for tool ${tool.name}, using raw schema`,
          );
          outputSchema = tool.outputSchema;
        }
      }

      mcpSever.registerTool(
        `${dataSourceName}__${tool.name}`,
        {
          description: `[${dataSourceName}] ${tool.description}`,
          title: tool.title,
          _meta: tool._meta,
          annotations: tool.annotations,
          inputSchema,
          outputSchema,
        },
        async (args: any, _extra: any) => {
          return await mcpClientManager.callTool(dataSourceName, tool.name, args);
        },
      );

      registeredCount++;
    } catch (err) {
      logger.error(
        {
          err,
          toolName: tool.name,
          serverName: dataSourceName,
        },
        `Failed to register tool ${tool.name}`,
      );
    }
  });

  logger.info(
    {
      serverName: dataSourceName,
      toolCount: registeredCount,
      skippedWriteTools,
    },
    `Registered ${registeredCount} tools for ${dataSourceName} (skipped ${skippedWriteTools} write tools)`,
  );

  return registeredCount;
}

export async function initializeRemoteServers(
  dataSources: DataSource[],
  mcpSever: McpServer,
  skipMcpProxy = false,
): Promise<void> {
  // Import preset loader to access tool classifications
  const { presetLoader } = await import('../services/presets/preset-loader.service.js');

  await Promise.all(
    dataSources.map(async (dataSource) => {
      try {
        await mcpClientManager.connect(dataSource);

        if (skipMcpProxy) return;

        // Load tool classifications from preset before registering tools
        if (dataSource.presetId) {
          const preset = presetLoader.getPreset(dataSource.presetId);
          if (preset?.indexingConfig?.toolClassifications) {
            mcpClientManager.setToolClassifications(
              dataSource.name,
              preset.indexingConfig.toolClassifications,
            );
            logger.info(
              {
                serverName: dataSource.name,
                presetId: dataSource.presetId,
                count: Object.keys(preset.indexingConfig.toolClassifications).length,
              },
              'Loaded tool classifications from preset before tool registration',
            );
          }
        }

        // Register tools for this data source
        await registerDataSourceTools(dataSource.name, mcpSever);
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
    await Promise.allSettled([
      services.qdrant.close(),
      services.memgraph.close(),
      services.redis.close(),
      services.mongoose.close(),
    ]);
  }
}
