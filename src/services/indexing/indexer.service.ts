import { MCPClientManager } from "../../mcp/client.js";
import { loadProxyConfig } from "../../mcp/config-loader.js";
import { getServices } from "../../mcp/initialization.js";
import { GraphStore } from "../../stores/graph.store.js";
import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { SourceType } from "../../types/index.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { NotionAdapter } from "./adapters/notion-adapter.js";
import { SimpleSyncService } from "./db-indexer.service.js";
import { GraphIndexerService } from "./graph-indexer.service.js";
import { insertAllRecordsToVectorDB } from "./vector-indexer.service.js";

export async function indexRecords() {
  const { qdrant, memgraph } = await getServices();

  const validConfigs = await loadProxyConfig();

  await Promise.all(
    validConfigs.map(async (config) => {
      const mcpManager = new MCPClientManager();

      await mcpManager.connect({
        ...config.toObject(),
        env: config.env ? Object.fromEntries(config.env.entries()) : undefined,
        headers: config.headers
          ? Object.fromEntries(config.headers.entries())
          : undefined,
      });

      const entityStore = new RecordStore();
      const vectorStore = new VectorStore(qdrant);
      const graphStore = new GraphStore(memgraph);

      if (config.name === "notion") {
        const notionClient = new NotionMCPClient(mcpManager);
        const notionAdapter = new NotionAdapter(notionClient);
        const syncService = new SimpleSyncService(entityStore);

        await syncService.syncAll("notion", notionAdapter);

        console.log("Saved records into document DB");

        await insertAllRecordsToVectorDB(entityStore, vectorStore, "notion", {
          batchSize: 50,
          maxChunkSize: 2000,
          overlapSize: 200,
        });

        console.log("Saved records into vector DB");

        const adapters = new Map<SourceType, any>();
        adapters.set("notion", notionAdapter);

        const graphIndexer = new GraphIndexerService(
          entityStore,
          graphStore,
          adapters
        );

        await graphIndexer.indexAll("notion", {
          batchSize: 100,
          includeRelationships: true,
        });

        console.log("Saved records into graph DB");
      }
    })
  );
}
