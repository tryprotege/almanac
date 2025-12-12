import { jsonSchemaToZod } from "json-schema-to-zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import OpenAI from "openai";

import { lightragQuery, LightRAGDependencies } from "./lightrag-query.js";
import { GraphStore } from "../../stores/graph.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { RecordStore } from "../../stores/record.store.js";
import { LLMService } from "../llm/llm.service.js";
import { RerankerService } from "../reranker/reranker.service.js";
import {
  LIGHTRAG_QUERY_TOOL,
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
export function registerLightRAGTool(
  mcpServer: McpServer,
  connections: {
    memgraph: MemgraphConnection;
    qdrant: QdrantConnection;
  }
): void {
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
    llm: new LLMService(openaiClient),
    reranker: new RerankerService(),
    openaiClient,
    embeddingModel: env.LLM_EMBEDDING_MODEL,
  };

  // Register the tool
  mcpServer.registerTool(
    LIGHTRAG_QUERY_TOOL.name,
    {
      description: LIGHTRAG_QUERY_TOOL.description,
      inputSchema: resolveSerializedZodOutput(
        jsonSchemaToZod(LIGHTRAG_QUERY_TOOL.inputSchema)
      ) as {},
    },
    async (args) => {
      try {
        const query = args as unknown as LightRAGQuery;

        logger.info({
          msg: "?:???????????",
          query,
        });
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
