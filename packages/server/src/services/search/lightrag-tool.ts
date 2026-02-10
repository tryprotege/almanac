import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import OpenAI from 'openai';

import { lightragQuery, LightRAGDependencies } from './lightrag-query.js';
import { GraphStore } from '../../stores/graph.store.js';
import { VectorStore } from '../../stores/vector.store.js';
import { RecordStore } from '../../stores/record.store.js';
import { lightragQueryTool } from '../../types/lightrag.types.js';
import { env } from '../../env.js';
import { MemgraphConnection } from '../../connections/memgraph.js';
import { QdrantConnection } from '../../connections/qdrant.js';
import logger from '../../utils/logger.js';

/**
 * Register the LightRAG query tool with the MCP server
 */
export async function registerLightRAGTool(
  mcpServer: McpServer,
  connections: {
    memgraph: MemgraphConnection;
    qdrant: QdrantConnection;
  },
): Promise<void> {
  logger.info('� Registering Almanac Search tool...');

  // Initialize OpenAI client
  const openaiClient = new OpenAI({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL,
  });

  // Initialize dependencies
  const deps: LightRAGDependencies = {
    graphStore: new GraphStore(connections.memgraph),
    vectorStore: new VectorStore(connections.qdrant),
    recordStore: new RecordStore(),
    openaiClient,
    embeddingModel: env.LLM_EMBEDDING_MODEL,
  };

  const { name, description, inputSchema } = await lightragQueryTool();

  // Register the tool
  mcpServer.registerTool(
    name,
    {
      description,
      inputSchema,
    },
    async (args) => {
      try {
        // Apply defaults for optional parameters
        // Use mix mode if reranker is enabled, otherwise hybrid
        args.mode = env.RERANKER_ENABLED ? 'mix' : 'hybrid';

        const response = await lightragQuery(args, deps);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error({ err, query: (args as any).query }, 'LightRAG Tool Error');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
                query: (args as any).query,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  logger.info('✅ Almanac Search tool registered');
}
