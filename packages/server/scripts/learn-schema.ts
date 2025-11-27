/**
 * AI-Powered Schema Learning Script
 *
 * Scans synced entities in MongoDB and uses AI to automatically discover
 * and update the graph schema by extracting entity types and relationships
 * from content.
 *
 * Usage:
 *   npx tsx scripts/learn-schema.ts [--limit 100] [--source notion]
 */

import "dotenv/config";
import { connectMongoose } from "../src/connections/mongoose.js";
import { RecordStore } from "../src/stores/record.store.js";
import { runSchemaLearning } from "../src/services/schema/index.js";
import { SourceType } from "../src/types/index.js";
import OpenAI from "openai";
import { env } from "../src/env.js";

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const sourceArg = args.find((arg) => arg.startsWith("--source="));

const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 100;
const SOURCE = (sourceArg?.split("=")[1] as SourceType) || null;

async function main() {
  console.log("🧠 AI-Powered Schema Learning");
  console.log("=".repeat(60));
  console.log(`Learning from up to ${LIMIT} entities`);
  if (SOURCE) {
    console.log(`Source filter: ${SOURCE}`);
  }
  console.log();

  // Connect to MongoDB
  console.log("📦 Connecting to MongoDB...");
  const mongoConnection = await connectMongoose();
  console.log("✅ MongoDB connected\n");

  try {
    // Initialize services
    const recordStore = new RecordStore();
    const openai = new OpenAI({
      apiKey: env.LLM_API_KEY,
      baseURL: env.LLM_BASE_URL,
    });

    // Run schema learning with full display output
    await runSchemaLearning(openai, recordStore, {
      limit: LIMIT,
      source: SOURCE,
      aiSampleSize: 20,
      minContentLength: 100,
      verbose: true,
    });
  } catch (error) {
    console.error("\n❌ Error during schema learning:", error);
    throw error;
  } finally {
    await mongoConnection.close();
    console.log("🔌 MongoDB connection closed");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
