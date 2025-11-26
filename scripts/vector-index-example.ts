import { connectMongoose } from "../src/connections/mongoose.js";
import { connectQdrant } from "../src/connections/qdrant.js";
import { RecordStore } from "../src/stores/record.store.js";
import { VectorStore } from "../src/stores/vector.store.js";
import { VectorIndexerService } from "../src/services/sync/vector-indexer.service.js";
import { EmbedderService } from "../src/services/indexing/embedder.js";
import { env } from "../src/env.js";
import OpenAI from "openai";

/**
 * Example: Vector Indexing
 *
 * This example demonstrates how to index MongoDB entities into Qdrant
 * after they have been synced from a source (e.g., Notion).
 *
 * Prerequisites:
 * 1. MongoDB must be running and contain synced entities
 * 2. Qdrant must be running
 * 3. OpenAI-compatible embedding API must be configured
 *
 * Usage:
 *   npx tsx src/examples/vector-index-example.ts
 */

async function main() {
  console.log("🚀 Vector Indexing Example\n");

  // Initialize connections
  console.log("📡 Connecting to services...");
  const mongoose = await connectMongoose();
  const qdrant = await connectQdrant();

  // Initialize stores
  const entityStore = new RecordStore();
  const vectorStore = new VectorStore(qdrant);

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

  // Initialize vector indexer
  const vectorIndexer = new VectorIndexerService(
    entityStore,
    vectorStore,
    embedder
  );

  try {
    // Get current stats before indexing
    console.log("\n📊 Current Statistics:");
    const beforeStats = await vectorIndexer.getStats("notion");
    console.log(`   Total Entities: ${beforeStats.totalEntities}`);
    console.log(`   Already Indexed: ${beforeStats.indexedEntities}`);
    console.log(`   Not Indexed: ${beforeStats.notIndexed}`);
    console.log(`   Total Vectors: ${beforeStats.totalVectors}`);
    console.log(
      `   Avg Chunks/Entity: ${beforeStats.averageChunksPerEntity.toFixed(2)}`
    );

    // Index all Notion entities
    console.log("\n🔄 Starting vector indexing for Notion entities...");
    const result = await vectorIndexer.indexAll("notion", {
      batchSize: 50,
      maxChunkSize: 2000,
      overlapSize: 200,
    });

    console.log("\n✅ Vector Indexing Complete!");
    console.log(`   Processed: ${result.processed} entities`);
    console.log(`   Chunks Created: ${result.chunks} vectors`);
    console.log(`   Errors: ${result.errors}`);
    console.log(`   Skipped: ${result.skipped}`);

    // Get updated stats
    console.log("\n📊 Updated Statistics:");
    const afterStats = await vectorIndexer.getStats("notion");
    console.log(`   Total Entities: ${afterStats.totalEntities}`);
    console.log(`   Indexed: ${afterStats.indexedEntities}`);
    console.log(`   Not Indexed: ${afterStats.notIndexed}`);
    console.log(`   Total Vectors: ${afterStats.totalVectors}`);
    console.log(
      `   Avg Chunks/Entity: ${afterStats.averageChunksPerEntity.toFixed(2)}`
    );

    // Example: Index specific entities by ID
    console.log("\n📝 Example: Index specific entities");
    const entities = await entityStore.findBySourceAndType("notion", "page", {
      limit: 2,
    });
    if (entities.length > 0) {
      const ids = entities.map((e) => e._id);
      console.log(`   Indexing ${ids.length} specific entities...`);
      const specificResult = await vectorIndexer.indexByIds(ids);
      console.log(`   ✅ Indexed ${specificResult.processed} entities`);
      console.log(`   Created ${specificResult.chunks} vectors`);
    }

    // Example: Cleanup deleted entities
    console.log("\n🧹 Cleaning up vectors for deleted entities...");
    const cleaned = await vectorIndexer.cleanupDeletedEntities("notion");
    console.log(`   ✅ Cleaned up ${cleaned} vectors`);
  } catch (error) {
    console.error("\n❌ Error during vector indexing:", error);
    throw error;
  } finally {
    // Cleanup
    console.log("\n🔌 Disconnecting...");
    await mongoose.close();
    await qdrant.close();
    console.log("✅ Done!");
  }
}

// Run the example
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
