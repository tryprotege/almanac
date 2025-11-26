#!/usr/bin/env node

/**
 * Example: Complete Sync Flow
 *
 * This script demonstrates the complete data synchronization pipeline:
 * 1. Sync Notion entities to MongoDB (source of truth)
 * 2. Index entities into Qdrant (vector search)
 * 3. Index entities into Memgraph (graph relationships)
 *
 * Prerequisites:
 * - MongoDB running
 * - Qdrant running
 * - Memgraph running
 * - Notion MCP server configured
 * - OpenAI-compatible embedding API configured
 *
 * Usage:
 *   npx tsx src/examples/complete-sync-flow.ts
 */

import "dotenv/config";
import { connectMongoose } from "../src/connections/mongoose.js";
import { connectQdrant } from "../src/connections/qdrant.js";
import { connectMemgraph } from "../src/connections/memgraph.js";
import { MCPClientManager } from "../src/mcp/client.js";
import { loadProxyConfig } from "../src/mcp/config-loader.js";
import { NotionMCPClient } from "../src/services/indexing/sources/notion/mcpClient.js";
import { NotionAdapter } from "../src/services/sync/adapters/notion-adapter.js";
import { SimpleSyncService } from "../src/services/sync/simple-sync.service.js";
import { VectorIndexerService } from "../src/services/sync/vector-indexer.service.js";
import { GraphIndexerService } from "../src/services/sync/graph-indexer.service.js";
import { RecordStore } from "../src/stores/record.store.js";
import { VectorStore } from "../src/stores/vector.store.js";
import { GraphStore } from "../src/stores/graph.store.js";
import { EmbedderService } from "../src/services/indexing/embedder.js";
import { env } from "../src/env.js";
import OpenAI from "openai";
import { SourceType } from "../src/types/index.js";

async function main() {
  console.log("🚀 Complete Sync Flow Example");
  console.log("=".repeat(60));
  console.log("This will sync Notion → MongoDB → Qdrant → Memgraph\n");

  // ============================================================================
  // STEP 1: Initialize Connections
  // ============================================================================
  console.log("📡 STEP 1: Connecting to services...\n");

  const mongoose = await connectMongoose();
  console.log("✅ MongoDB connected");

  const qdrant = await connectQdrant();
  console.log("✅ Qdrant connected");

  const memgraph = await connectMemgraph();
  console.log("✅ Memgraph connected");

  // Initialize MCP client
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
  console.log("✅ Notion MCP server connected\n");

  // Initialize stores
  const entityStore = new RecordStore();
  const vectorStore = new VectorStore(qdrant);
  const graphStore = new GraphStore(memgraph);

  try {
    // ============================================================================
    // STEP 2: Sync Notion to MongoDB
    // ============================================================================
    console.log("=".repeat(60));
    console.log("📦 STEP 2: Syncing Notion entities to MongoDB...\n");

    const notionClient = new NotionMCPClient(mcpManager);
    const notionAdapter = new NotionAdapter(notionClient);
    const syncService = new SimpleSyncService(entityStore);

    const syncResult = await syncService.syncAll("notion", notionAdapter);

    console.log("\n✅ MongoDB Sync Complete!");
    console.log(`   Total: ${syncResult.stats.total}`);
    console.log(`   Created: ${syncResult.stats.created}`);
    console.log(`   Updated: ${syncResult.stats.updated}`);
    console.log(`   Failed: ${syncResult.stats.failed}`);
    console.log(
      `   Duration: ${(syncResult.stats.duration / 1000).toFixed(2)}s`
    );

    if (syncResult.stats.total === 0) {
      console.log("\n⚠️  No entities found. Exiting...");
      return;
    }

    // ============================================================================
    // STEP 3: Index to Qdrant (Vector Search)
    // ============================================================================
    console.log("\n" + "=".repeat(60));
    console.log("🔍 STEP 3: Indexing entities to Qdrant...\n");

    // Initialize embedder
    const openai = new OpenAI({
      apiKey: env.LLM_API_KEY,
      baseURL: env.LLM_BASE_URL,
    });

    const embedder = new EmbedderService({
      client: openai,
      model: env.LLM_EMBEDDING_MODEL,
      dimension: env.EMBEDDING_DIMENSIONS,
    });

    const vectorIndexer = new VectorIndexerService(
      entityStore,
      vectorStore,
      embedder
    );

    const vectorResult = await vectorIndexer.indexAll("notion", {
      batchSize: 50,
      maxChunkSize: 2000,
      overlapSize: 200,
    });

    console.log("\n✅ Vector Indexing Complete!");
    console.log(`   Processed: ${vectorResult.processed} entities`);
    console.log(`   Chunks: ${vectorResult.chunks} vectors`);
    console.log(`   Errors: ${vectorResult.errors}`);

    // Get vector stats
    const vectorStats = await vectorIndexer.getStats("notion");
    console.log(
      `   Avg Chunks/Entity: ${vectorStats.averageChunksPerEntity.toFixed(2)}`
    );

    // ============================================================================
    // STEP 4: Index to Memgraph (Graph Relationships)
    // ============================================================================
    console.log("\n" + "=".repeat(60));
    console.log("🕸️  STEP 4: Indexing entities to Memgraph...\n");

    const adapters = new Map<SourceType, any>();
    adapters.set("notion", notionAdapter);

    const graphIndexer = new GraphIndexerService(
      entityStore,
      graphStore,
      adapters
    );

    const graphResult = await graphIndexer.indexAll("notion", {
      batchSize: 100,
      includeRelationships: true,
    });

    console.log("\n✅ Graph Indexing Complete!");
    console.log(`   Nodes: ${graphResult.nodes}`);
    console.log(`   Relationships: ${graphResult.relationships}`);
    console.log(`   Errors: ${graphResult.errors}`);

    // ============================================================================
    // STEP 5: Summary
    // ============================================================================
    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL SUMMARY");
    console.log("=".repeat(60));

    const finalStats = await syncService.getStats("notion");
    console.log("\nMongoDB:");
    console.log(`  Total Entities: ${finalStats.total}`);
    console.log(`  By Type:`);
    Object.entries(finalStats.byType).forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });

    console.log("\nQdrant:");
    console.log(`  Total Vectors: ${vectorStats.totalVectors}`);
    console.log(`  Indexed Entities: ${vectorStats.indexedEntities}`);

    console.log("\nMemgraph:");
    console.log(`  Total Nodes: ${graphResult.nodes}`);
    console.log(`  Total Relationships: ${graphResult.relationships}`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Complete sync flow finished successfully!");
    console.log("=".repeat(60));
    console.log("\nYour data is now available in:");
    console.log("  • MongoDB - Source of truth & metadata");
    console.log("  • Qdrant - Vector search & semantic similarity");
    console.log("  • Memgraph - Graph relationships & traversal\n");
  } catch (error) {
    console.error("\n❌ Error during sync flow:", error);
    throw error;
  } finally {
    // Cleanup
    console.log("🔌 Disconnecting from services...");
    await mcpManager.disconnectAll();
    await mongoose.close();
    await qdrant.close();
    await memgraph.close();
    console.log("✅ All connections closed");
  }
}

// Run the example
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
