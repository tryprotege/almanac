import { jsonSchemaToZod } from "json-schema-to-zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import OpenAI from "openai";

import { lightragQuery, LightRAGDependencies } from "./lightrag-query.js";
import { GraphStore } from "../../stores/graph.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { RecordStore } from "../../stores/record.store.js";
import {
  lightragQueryTool,
  LightRAGQuery,
} from "../../types/lightrag.types.js";
import { resolveSerializedZodOutput } from "../../utils/resolveSerializedZodOutput.js";
import { env } from "../../env.js";
import { MemgraphConnection } from "../../connections/memgraph.js";
import { QdrantConnection } from "../../connections/qdrant.js";
import logger from "../../utils/logger.js";

/**
 * Register the LightRAG query tool with the MCP server
 */
export async function registerLightRAGTool(
  mcpServer: McpServer,
  connections: {
    memgraph: MemgraphConnection;
    qdrant: QdrantConnection;
  }
): Promise<void> {
  logger.info("� Registering eBee Search tool...");

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
      inputSchema: resolveSerializedZodOutput(
        jsonSchemaToZod(inputSchema)
      ) as {},
    },
    async (args) => {
      try {
        const query = args as unknown as LightRAGQuery;

        // Apply defaults for optional parameters
        query.mode = "mix";
        // query.response_format = query.response_format ?? "compact";
        // query.top_k = query.top_k ?? 60;
        // query.chunk_top_k = query.chunk_top_k ?? 20;
        query.enable_rerank = true;
        query.score_threshold = 0.5;
        query.filters = {};

        const response = await lightragQuery(query, deps);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error(
          { err, query: (args as any).query },
          "LightRAG Tool Error"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
                query: (args as any).query,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info("✅ eBee Search tool registered");
}
