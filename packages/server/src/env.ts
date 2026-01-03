import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, "../.env");
const envExamplePath = path.join(__dirname, "../.env.example");

// Auto-create .env from .env.example if it doesn't exist
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log("📝 Created .env from .env.example");
}

dotenv.config({
  path: envPath,
});

import { z } from "zod";

// Infrastructure schema - REQUIRED for server to start (with defaults)
const infrastructureSchema = z.object({
  // Logging Configuration
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // MongoDB Configuration
  MONGO_HOST: z.string().default("localhost"),
  MONGO_PORT: z.string().default("27017"),
  MONGO_USERNAME: z.string().default("admin"),
  MONGO_PASSWORD: z.string().default("admin123"),
  MONGO_DB_NAME: z.string().default("ebee"),

  // Redis Configuration
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.string().default("6379"),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default("0"),

  // Memgraph Configuration
  MEMGRAPH_HOST: z.string().default("localhost"),
  MEMGRAPH_PORT: z.string().default("7687"),
  MEMGRAPH_USERNAME: z.string().optional(),
  MEMGRAPH_PASSWORD: z.string().optional(),

  // Qdrant Configuration
  QDRANT_HOST: z.string().default("localhost"),
  QDRANT_PORT: z.string().default("6333"),
  QDRANT_API_KEY: z.string().optional(),

  // OAuth Configuration
  OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3000/api/oauth/callback"),
  OAUTH_CLIENT_URL: z.string().url().default("http://localhost:5173"),
});

// Application schema - OPTIONAL at startup (can be configured via UI)
const applicationSchema = z.object({
  // LLM Configuration (provider-agnostic)
  LLM_PROVIDER: z
    .enum(["openai", "openrouter", "azure", "anthropic"])
    .optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),

  // Model Configuration - Separate for chat and embeddings
  LLM_CHAT_MODEL: z.string().optional(),
  LLM_EMBEDDING_MODEL: z.string().optional(),
  LLM_INDEXING_CONFIG_MODEL: z.string().optional(),

  // Reranker Configuration (generic - works with any provider)
  RERANKER_ENABLED: z.preprocess((val) => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
      const lower = val.toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
    }
    return val;
  }, z.boolean().optional()),
  RERANKER_API_KEY: z.string().optional(),
  RERANKER_BASE_URL: z.string().optional(),
  RERANKER_MODEL: z.string().optional(),

  DB_INDEXING_CONCURRENCY: z.coerce.number().optional(),

  // Schema Learning Configuration
  SCHEMA_LEARNING_CONCURRENCY: z.coerce.number().optional(),
  SCHEMA_LEARNING_MAX_BATCH_CHARS: z.coerce.number().optional(),

  // Vector Indexing Configuration
  VECTOR_INDEXING_CONCURRENCY: z.coerce.number().optional(),
  VECTOR_INDEXING_MAX_BATCH_SIZE: z.coerce.number().optional(),

  // Graph Extraction Configuration
  GRAPH_EXTRACTION_CONCURRENCY: z.coerce.number().optional(),
  ENABLE_TOXIC_DOCUMENT_FILTER: z.boolean().optional(),

  // Dynamic Entity Limit Configuration
  ENTITY_CHARS_PER_ENTITY: z.coerce.number().optional(),
  MAX_ENTITIES_PER_DOCUMENT: z.coerce.number().optional(),

  // Sync Configuration
  SYNC_CUTOFF_DATE: z.string().datetime().optional(),
  SYNC_MAX_RECORDS: z.coerce.number().optional(),

  // Encryption Configuration
  ENCRYPTION_KEY: z
    .string()
    .length(64, "Encryption key must be 64 hex characters (32 bytes)")
    .regex(/^[0-9a-f]{64}$/i, "Encryption key must be valid hexadecimal")
    .optional(),
});

// Parse infrastructure (will throw if missing required fields)
const infraEnv = infrastructureSchema.parse(process.env);

// Parse application (won't throw - just returns what's available)
const appEnvResult = applicationSchema.safeParse({
  ...process.env,
  RERANKER_ENABLED:
    process.env.RERANKER_ENABLED?.toLowerCase().trim() === "true",
  SYNC_MAX_RECORDS: process.env.SYNC_MAX_RECORDS
    ? parseInt(process.env.SYNC_MAX_RECORDS)
    : undefined,
});

const appEnv = appEnvResult.success ? appEnvResult.data : {};

// Determine if we're in setup mode
// Setup mode is active if critical LLM config is missing
const isSetupMode =
  !appEnv.LLM_API_KEY ||
  appEnv.LLM_API_KEY === "your_llm_api_key_here" ||
  !appEnv.LLM_INDEXING_CONFIG_MODEL;

// Apply defaults for application config
// Always apply performance/concurrency defaults, even in setup mode
const appEnvWithDefaults = {
  LLM_PROVIDER: appEnv.LLM_PROVIDER || "openrouter",
  LLM_CHAT_MODEL: appEnv.LLM_CHAT_MODEL || "openai/gpt-oss-20b",
  LLM_EMBEDDING_MODEL: appEnv.LLM_EMBEDDING_MODEL || "qwen/qwen3-embedding-4b",
  LLM_INDEXING_CONFIG_MODEL:
    appEnv.LLM_INDEXING_CONFIG_MODEL || "openai/gpt-oss-120b",
  RERANKER_ENABLED: appEnv.RERANKER_ENABLED || false,
  RERANKER_BASE_URL:
    appEnv.RERANKER_BASE_URL || "https://api.fireworks.ai/inference/v1/rerank",
  RERANKER_MODEL: appEnv.RERANKER_MODEL || "fireworks/qwen3-reranker-8b",
  DB_INDEXING_CONCURRENCY: appEnv.DB_INDEXING_CONCURRENCY || 32,
  SCHEMA_LEARNING_CONCURRENCY: appEnv.SCHEMA_LEARNING_CONCURRENCY || 32,
  SCHEMA_LEARNING_MAX_BATCH_CHARS:
    appEnv.SCHEMA_LEARNING_MAX_BATCH_CHARS || 250000,
  VECTOR_INDEXING_CONCURRENCY: appEnv.VECTOR_INDEXING_CONCURRENCY || 32,
  VECTOR_INDEXING_MAX_BATCH_SIZE: appEnv.VECTOR_INDEXING_MAX_BATCH_SIZE || 100,
  GRAPH_EXTRACTION_CONCURRENCY: appEnv.GRAPH_EXTRACTION_CONCURRENCY || 32,
  ENABLE_TOXIC_DOCUMENT_FILTER: appEnv.ENABLE_TOXIC_DOCUMENT_FILTER || false,
  ...appEnv,
};

// TODO: Compute embedding dimensions based on model
// This ensures dimension consistency across the application
const EMBEDDING_DIMENSIONS = 2560;

export const env = {
  ...infraEnv,
  ...appEnvWithDefaults,
  EMBEDDING_DIMENSIONS,
  isSetupMode,
};

// Log setup mode status and missing variables
if (isSetupMode) {
  console.log("\n" + "=".repeat(70));
  console.log(
    "⚠️  Running in SETUP MODE - LLM features disabled until configured via UI"
  );
  console.log("=".repeat(70));

  // List missing required variables
  const missingVars: string[] = [];
  if (!appEnv.LLM_API_KEY || appEnv.LLM_API_KEY === "your_llm_api_key_here") {
    missingVars.push("LLM_API_KEY");
  }
  if (!appEnv.LLM_INDEXING_CONFIG_MODEL) {
    missingVars.push("LLM_INDEXING_CONFIG_MODEL");
  }

  if (missingVars.length > 0) {
    console.log("\n❌ Missing Required Environment Variables:");
    missingVars.forEach((varName) => {
      console.log(`   - ${varName}`);
    });
  }

  console.log("\n📝 How to configure:");
  console.log("   1. Visit the application at http://localhost:5173");
  console.log("   2. Navigate to Settings → Environment Configuration");
  console.log("   3. Fill in the required LLM API credentials");
  console.log("   4. Save and restart the server");
  console.log("\n   Or manually edit packages/server/.env file");
  console.log("=".repeat(70) + "\n");
}
