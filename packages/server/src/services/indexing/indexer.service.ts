import OpenAI from "openai";

import { env } from "../../env.js";
import { loadProxyConfig } from "../../mcp/config-loader.js";
import { getServices } from "../../mcp/initialization.js";
import { GraphStore } from "../../stores/graph.store.js";
import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { SourceType } from "../../types/index.js";
import { runSchemaLearning, shouldRunSchemaLearning } from "../schema/index.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { NotionAdapter } from "./adapters/notion-adapter.js";
import { syncAllRecords } from "./db-indexer.service.js";
import { GraphIndexerService } from "./graph-indexer.service.js";
import { insertAllRecordsToVectorDB } from "./vector-indexer.service.js";

export async function indexRecords() {
  const { qdrant, memgraph } = await getServices();

  const validConfigs = await loadProxyConfig();

  await Promise.all(
    validConfigs.map(async (config) => {
      const recordStore = new RecordStore();
      const vectorStore = new VectorStore(qdrant);
      const graphStore = new GraphStore(memgraph);

      if (config.name === "notion") {
        const notionClient = new NotionMCPClient();
        const notionAdapter = new NotionAdapter(notionClient);

        await syncAllRecords(recordStore, "notion", notionAdapter);

        console.log("✅ Saved records into document DB");

        // Check if schema learning is needed
        const { shouldRun, reason } = await shouldRunSchemaLearning();

        if (shouldRun) {
          console.log(`\n🧠 Schema learning needed: ${reason}`);
          const openai = new OpenAI({
            apiKey: env.LLM_API_KEY,
            baseURL: env.LLM_BASE_URL,
          });

          await runSchemaLearning(openai, recordStore, {
            limit: 100,
            source: "notion",
            aiSampleSize: 20,
            minContentLength: 100,
            verbose: true,
          });

          console.log("✅ Schema learning complete\n");
        } else {
          console.log(`ℹ️  Schema learning skipped: ${reason}\n`);
        }

        await insertAllRecordsToVectorDB(recordStore, vectorStore, "notion", {
          batchSize: 50,
          maxChunkSize: 2000,
          overlapSize: 200,
        });

        console.log("✅ Saved records into vector DB");

        const adapters = new Map<SourceType, any>();
        adapters.set("notion", notionAdapter);

        const graphIndexer = new GraphIndexerService(
          recordStore,
          graphStore,
          adapters
        );

        await graphIndexer.indexAll("notion", {
          batchSize: 100,
          includeRelationships: true,
        });

        console.log("✅ Saved records into graph DB");
      }
    })
  );
}
