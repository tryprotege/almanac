import { z } from "zod";

const envSchema = z.object({
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

  DB_INDEXING_CONCURRENCY: z.coerce.number().default(32),

  // Schema Learning Configuration
  SCHEMA_LEARNING_CONCURRENCY: z.coerce.number().default(32),
  SCHEMA_LEARNING_MAX_BATCH_CHARS: z.coerce.number().default(250000),

  // Vector Indexing Configuration
  VECTOR_INDEXING_CONCURRENCY: z.coerce.number().default(32),
  VECTOR_INDEXING_MAX_BATCH_SIZE: z.coerce.number().default(100),

  // Graph Extraction Configuration
  GRAPH_EXTRACTION_CONCURRENCY: z.coerce.number().default(32),
  ENABLE_TOXIC_DOCUMENT_FILTER: z.boolean().default(true),
  MAX_ENTITIES_PER_DOCUMENT: z.coerce.number().default(200),

  // Sync Configuration
  SYNC_CUTOFF_DATE: z.string().datetime().default("2025-12-01T00:00:00.000Z"), // datetime in ISO format eg. "2023-06-01T00:00:00.000Z"
  SYNC_MAX_RECORDS: z.coerce.number().optional(), // Maximum total number of records (per record type) to fetch during sync operations (optional, no limit if not set)

  // Encryption Configuration
  ENCRYPTION_KEY: z
    .string()
    .length(64, "Encryption key must be 64 hex characters (32 bytes)")
    .regex(/^[0-9a-f]{64}$/i, "Encryption key must be valid hexadecimal"),
});

const parsedEnv = envSchema.parse({
  ...process.env,
  RERANKER_ENABLED:
    process.env.RERANKER_ENABLED?.toLowerCase().trim() === "true",
  SYNC_MAX_RECORDS: process.env.SYNC_MAX_RECORDS
    ? parseInt(process.env.SYNC_MAX_RECORDS)
    : undefined,
} satisfies Partial<z.infer<typeof envSchema>>);

// TODO: Compute embedding dimensions based on model
// This ensures dimension consistency across the application

const EMBEDDING_DIMENSIONS = 2560;

export const env = {
  ...parsedEnv,
  EMBEDDING_DIMENSIONS,
};
