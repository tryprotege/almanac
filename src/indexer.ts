#!/usr/bin/env node

import "dotenv/config";
import OpenAI from "openai";
import { IndexerService } from "./services/indexer/index.js";
import { IndexingService } from "./services/indexing/indexing.service.js";
import { EmbedderService } from "./services/indexing/embedder.js";
import { ChunkerService } from "./services/indexing/chunker.js";
import { MongoRepository } from "./repositories/mongo.repository.js";
import { QdrantRepository } from "./repositories/qdrant.repository.js";
import { MemgraphRepository } from "./repositories/memgraph.repository.js";
import { connectMongo } from "./shared/database/mongo.js";
import { connectQdrant } from "./shared/database/qdrant.js";
import { connectMemgraph } from "./shared/database/memgraph.js";
import { env } from "./env.js";

/**
 * Standalone Indexer Worker Entry Point
 * Runs the BullMQ-based indexing worker that processes indexing jobs from the queue
 */

async function startIndexer() {
  console.log("🚀 Starting eBee Indexer Worker...\n");

  // Validate required environment variables
  if (!process.env.LLM_API_KEY) {
    console.error("❌ Error: LLM_API_KEY not found in environment variables");
    console.error("Please set up your .env file based on .env.example");
    process.exit(1);
  }

  console.log("Configuration:");
  console.log(`  LLM Provider: ${env.LLM_PROVIDER || "openrouter"}`);
  console.log(`  Chat Model: ${env.LLM_CHAT_MODEL || "openai/gpt-oss-20b"}`);
  console.log(
    `  Embedding Model: ${
      env.LLM_EMBEDDING_MODEL || "qwen/qwen-3-embedding-0.6b"
    }`
  );
  console.log(`  Redis: ${env.REDIS_HOST}:${env.REDIS_PORT}`);
  console.log(`  MongoDB: ${env.MONGO_HOST}:${env.MONGO_PORT}`);
  console.log(`  Qdrant: ${env.QDRANT_HOST}:${env.QDRANT_PORT}`);
  console.log(`  Memgraph: ${env.MEMGRAPH_HOST}:${env.MEMGRAPH_PORT}\n`);

  try {
    // Initialize database connections
    const mongoConn = await connectMongo();
    const qdrantConn = await connectQdrant();
    const memgraphConn = await connectMemgraph();

    // Initialize OpenAI client
    const openaiClient = new OpenAI({
      apiKey: env.LLM_API_KEY,
      baseURL: env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
    });

    // Initialize repositories
    const mongoRepo = new MongoRepository(mongoConn);
    const qdrantRepo = new QdrantRepository(qdrantConn);
    const memgraphRepo = new MemgraphRepository(memgraphConn);

    console.log("✅ Repositories initialized");

    // Initialize services
    const chunker = new ChunkerService();
    const embedder = new EmbedderService({
      client: openaiClient,
      model: env.LLM_EMBEDDING_MODEL || "qwen/qwen-3-embedding-0.6b",
      dimension: 1024,
    });

    console.log("✅ Embedder and Chunker services initialized");

    // Initialize Indexing service
    const indexingService = new IndexingService(
      mongoRepo,
      qdrantRepo,
      memgraphRepo,
      chunker,
      embedder
    );

    console.log("✅ Indexing service initialized");

    // Initialize Indexer (worker + queue)
    const indexer = new IndexerService(indexingService, {
      host: env.REDIS_HOST || "localhost",
      port: Number(env.REDIS_PORT || 6379),
      password: env.REDIS_PASSWORD,
    });

    console.log("✅ Indexer worker started");
    console.log("\n🎯 Ready to process indexing jobs from the queue");
    console.log("   Press Ctrl+C to stop\n");

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\n🛑 Shutting down indexer worker...");
      await indexer.close();
      await mongoConn.close();
      await qdrantConn.close();
      await memgraphConn.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Log metrics periodically
    setInterval(async () => {
      const metrics = await indexer.getMetrics();
      console.log(
        `[Metrics] Active: ${metrics.active}, Waiting: ${metrics.waiting}, Completed: ${metrics.completed}, Failed: ${metrics.failed}`
      );
    }, 30000); // Every 30 seconds
  } catch (error) {
    console.error("❌ Failed to start indexer worker:", error);
    process.exit(1);
  }
}

startIndexer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
