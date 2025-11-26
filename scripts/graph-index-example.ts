import "dotenv/config";
import { connectMongoose } from "../src/connections/mongoose.js";
import { connectMemgraph } from "../src/connections/memgraph.js";
import { SyncedEntityStore } from "../src/stores/synced-entity.store.js";
import { GraphStore } from "../src/stores/graph.store.js";
import { GraphIndexerService } from "../src/services/sync/graph-indexer.service.js";
import { NotionAdapter } from "../src/services/sync/adapters/notion-adapter.js";
import { NotionMCPClient } from "../src/services/indexing/sources/notion/mcpClient.js";
import { MCPClientManager } from "../src/mcp/client.js";
import { loadProxyConfig } from "../src/mcp/config-loader.js";
import { SourceType } from "../src/types/index.js";

/**
 * Example: Graph Indexing
 *
 * This example demonstrates how to index MongoDB entities into Memgraph
 * after they have been synced from a source (e.g., Notion).
 *
 * Prerequisites:
 * 1. MongoDB must be running and contain synced entities
 * 2. Memgraph must be running
 * 3. Notion MCP server must be configured (for relationship extraction)
 *
 * Usage:
 *   npx tsx src/examples/graph-index-example.ts
 */

async function main() {
  console.log("🚀 Graph Indexing Example\n");

  // Initialize connections
  console.log("📡 Connecting to services...");
  const mongoose = await connectMongoose();
  const memgraph = await connectMemgraph();

  // Initialize stores
  const entityStore = new SyncedEntityStore();
  const graphStore = new GraphStore(memgraph);

  // Initialize Notion MCP client for relationship extraction
  console.log("🔌 Connecting to Notion MCP server...");
  const mcpManager = new MCPClientManager();

  const validConfigs = await loadProxyConfig();
  const config = validConfigs[0]!;

  await mcpManager.connect({
    ...config.toObject(),
    env: config.env ? Object.fromEntries(config.env.entries()) : undefined,
    headers: config.headers
      ? Object.fromEntries(config.headers.entries())
      : undefined,
  });

  const notionClient = new NotionMCPClient(mcpManager);
  const notionAdapter = new NotionAdapter(notionClient);

  // Create adapter map
  const adapters = new Map<SourceType, any>();
  adapters.set("notion", notionAdapter);

  // Initialize graph indexer
  const graphIndexer = new GraphIndexerService(
    entityStore,
    graphStore,
    adapters
  );

  try {
    // Get current stats before indexing
    console.log("\n📊 Current Statistics:");
    const beforeStats = await graphIndexer.getStats("notion");
    console.log(`   Total Entities: ${beforeStats.totalEntities}`);
    console.log(`   Indexed Nodes: ${beforeStats.indexedNodes}`);
    console.log(`   Not Indexed: ${beforeStats.notIndexed}`);

    // Index all Notion entities into graph
    console.log("\n🔄 Starting graph indexing for Notion entities...");
    const result = await graphIndexer.indexAll("notion", {
      batchSize: 100,
      includeRelationships: true,
    });

    console.log("\n✅ Graph Indexing Complete!");
    console.log(`   Nodes Created: ${result.nodes}`);
    console.log(`   Relationships Created: ${result.relationships}`);
    console.log(`   Errors: ${result.errors}`);

    // Get updated stats
    console.log("\n📊 Updated Statistics:");
    const afterStats = await graphIndexer.getStats("notion");
    console.log(`   Total Entities: ${afterStats.totalEntities}`);
    console.log(`   Indexed Nodes: ${afterStats.indexedNodes}`);
    console.log(`   Not Indexed: ${afterStats.notIndexed}`);

    // Example: Index specific entities by ID
    console.log("\n📝 Example: Index specific entities");
    const entities = await entityStore.findBySourceAndType("notion", "page", {
      limit: 2,
    });
    if (entities.length > 0) {
      const ids = entities.map((e) => e._id);
      console.log(`   Indexing ${ids.length} specific entities...`);
      const specificResult = await graphIndexer.indexByIds(ids, {
        includeRelationships: true,
      });
      console.log(`   ✅ Created ${specificResult.nodes} nodes`);
      console.log(
        `   ✅ Created ${specificResult.relationships} relationships`
      );
    }

    // Example: Rebuild relationships
    console.log("\n🔄 Example: Rebuild relationships");
    const rebuildResult = await graphIndexer.rebuildRelationships("notion", {
      batchSize: 100,
    });
    console.log(`   ✅ Rebuilt ${rebuildResult.relationships} relationships`);
    console.log(`   Errors: ${rebuildResult.errors}`);

    // Example: Cleanup deleted entities
    console.log("\n🧹 Cleaning up nodes for deleted entities...");
    const cleaned = await graphIndexer.cleanupDeletedEntities("notion");
    console.log(`   ✅ Cleaned up ${cleaned} nodes`);

    // Example: Query graph relationships
    console.log("\n🔍 Example: Query relationships for a node");
    if (entities.length > 0) {
      const entityId = entities[0]._id;
      const relationships = await graphStore.getNodeRelationships(entityId, {
        direction: "both",
      });
      console.log(
        `   Found ${relationships.length} relationships for ${entityId}`
      );
      relationships.slice(0, 3).forEach((rel) => {
        console.log(
          `   - ${rel.relationship.type}: ${rel.relatedNode.title} (confidence: ${rel.relationship.confidence})`
        );
      });
    }
  } catch (error) {
    console.error("\n❌ Error during graph indexing:", error);
    throw error;
  } finally {
    // Cleanup
    console.log("\n🔌 Disconnecting...");
    await mcpManager.disconnectAll();
    await mongoose.close();
    await memgraph.close();
    console.log("✅ Done!");
  }
}

// Run the example
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
