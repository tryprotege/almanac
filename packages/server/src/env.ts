import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
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

  // LLM Configuration (provider-agnostic)
  LLM_PROVIDER: z
    .enum(["openai", "openrouter", "azure", "anthropic"])
    .default("openrouter"),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),

  // Model Configuration - Separate for chat and embeddings
  LLM_CHAT_MODEL: z.string().default("openai/gpt-oss-20b"),
  LLM_EMBEDDING_MODEL: z.string().default("qwen/qwen-3-embedding-0.6b"),

  // Reranker Configuration (generic - works with any provider)
  RERANKER_ENABLED: z.preprocess((val) => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
      const lower = val.toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
    }
    return val;
  }, z.boolean().default(false)),
  RERANKER_API_KEY: z.string().optional(),
  RERANKER_BASE_URL: z
    .string()
    .default("https://api.deepinfra.com/v1/inference"),
  RERANKER_MODEL: z.string().default("Qwen/Qwen3-Reranker-8B"),
});

const parsedEnv = envSchema.parse({
  ...process.env,
  RERANKER_ENABLED:
    process.env.RERANKER_ENABLED?.toLowerCase().trim() === "true",
});

// TODO: Compute embedding dimensions based on model
// This ensures dimension consistency across the application

const EMBEDDING_DIMENSIONS = 2560;

export const env = {
  ...parsedEnv,
  EMBEDDING_DIMENSIONS,
};
