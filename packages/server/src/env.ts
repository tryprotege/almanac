import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../.env');

dotenv.config({
  path: envPath,
});

import { z } from 'zod';

// Infrastructure schema - REQUIRED for server to start (with defaults)
export const infrastructureSchema = z.object({
  // Logging Configuration
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  MCP_DEBUG_LOGS: z.boolean().default(false),
  DISABLE_WRITE_TOOLS: z.boolean().default(false),

  // MongoDB Configuration
  MONGO_HOST: z.string().default('localhost'),
  MONGO_PORT: z.string().default('27017'),
  MONGO_USERNAME: z.string().default('admin'),
  MONGO_PASSWORD: z.string().default('admin123'),
  MONGO_DB_NAME: z.string().default('almanac'),

  // Redis Configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0'),

  // Memgraph Configuration
  MEMGRAPH_HOST: z.string().default('localhost'),
  MEMGRAPH_PORT: z.string().default('7687'),
  MEMGRAPH_USERNAME: z.string().optional(),
  MEMGRAPH_PASSWORD: z.string().optional(),

  // Qdrant Configuration
  QDRANT_HOST: z.string().default('localhost'),
  QDRANT_PORT: z.string().default('6333'),
  QDRANT_API_KEY: z.string().optional(),

  // OAuth Configuration
  OAUTH_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/oauth/callback'),
  OAUTH_CLIENT_URL: z.string().url().default('http://localhost:5173'),
  IS_BENCHMARK: z.boolean().default(false),
});

// Application schema - OPTIONAL at startup (can be configured via UI)
export const applicationSchema = z.object({
  LLM_API_KEY: z.string(),
  LLM_BASE_URL: z.string(),

  // Model Configuration - Separate for chat and embeddings
  LLM_CHAT_MODEL: z.string(),
  LLM_EMBEDDING_MODEL: z.string(),
  LLM_EXTRACTION_MODEL: z.string(),

  // Reranker Configuration (generic - works with any provider)
  RERANKER_ENABLED: z.boolean().default(false),
  RERANKER_BASE_URL: z.string().optional(),
  RERANKER_API_KEY: z.string().optional(),
  RERANKER_MODEL: z.string().optional(),

  DB_INDEXING_CONCURRENCY: z.coerce.number().default(32),

  // Vector Indexing Configuration
  VECTOR_INDEXING_CONCURRENCY: z.coerce.number().default(32),

  // Graph Extraction Configuration
  GRAPH_EXTRACTION_CONCURRENCY: z.coerce.number().default(32),
  ENABLE_TOXIC_DOCUMENT_FILTER: z.boolean().default(false),

  // Dynamic Entity Limit Configuration
  ENTITY_CHARS_PER_ENTITY: z.coerce.number().optional(),
  MAX_ENTITIES_PER_DOCUMENT: z.coerce.number().optional(),

  // Sync Configuration
  SYNC_CUTOFF_DATE: z
    .string()
    .datetime()
    .default(() => {
      const date = new Date();
      date.setDate(date.getDate() - 60);
      date.setHours(0, 0, 0, 0); // Set to midnight
      return date.toISOString();
    }),
  SYNC_MAX_RECORDS: z.coerce.number().optional(),
  SYNC_CRON_SCHEDULE: z.string().default('0 0 * * *'),

  // Encryption Configuration
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'Encryption key must be 64 hex characters (32 bytes)')
    .regex(/^[0-9a-f]{64}$/i, 'Encryption key must be valid hexadecimal')
    .optional(),
});

const processEnv = {
  ...process.env,
  MCP_DEBUG_LOGS: process.env.MCP_DEBUG_LOGS?.toLowerCase().trim() === 'true',
  DISABLE_WRITE_TOOLS: process.env.DISABLE_WRITE_TOOLS?.toLowerCase().trim() === 'true',
  RERANKER_ENABLED: process.env.RERANKER_ENABLED?.toLowerCase().trim() === 'true',
  ENABLE_TOXIC_DOCUMENT_FILTER:
    process.env.ENABLE_TOXIC_DOCUMENT_FILTER?.toLowerCase().trim() === 'true',
  IS_BENCHMARK: process.env.IS_BENCHMARK?.toLowerCase().trim() === 'true',
  SYNC_MAX_RECORDS: process.env.SYNC_MAX_RECORDS
    ? parseInt(process.env.SYNC_MAX_RECORDS)
    : undefined,
};

function partialParse<T extends z.ZodRawShape>(schema: z.ZodObject<T>, input: unknown) {
  const shape = schema.shape;
  const result: Partial<z.infer<typeof schema>> = {};

  for (const key in shape) {
    const fieldSchema = shape[key];
    const parsed = fieldSchema.safeParse((input as any)?.[key]);
    result[key] = parsed.success ? parsed.data : undefined;
  }

  return result as z.infer<typeof schema>;
}

// Parse infrastructure (will throw if missing required fields)
const infraEnv = infrastructureSchema.parse(processEnv);

// Parse application (won't throw - just returns what's available)
export const appEnvResult = applicationSchema.safeParse(processEnv);

const appEnv = appEnvResult.data || partialParse(applicationSchema, processEnv);

// Determine if we're in setup mode
const isSetupMode = !appEnvResult.success;

// TODO: Compute embedding dimensions based on model
// This ensures dimension consistency across the application
const EMBEDDING_DIMENSIONS = 2560;

export const sourceEnv = {
  ...infraEnv,
  ...appEnv,
};

export const env = {
  ...sourceEnv,
  EMBEDDING_DIMENSIONS,
  isSetupMode,
};

// Log setup mode status and missing variables
if (isSetupMode) {
  console.log('\n' + '='.repeat(70));
  console.log('⚠️  Running in SETUP MODE - LLM features disabled until configured via UI');
  console.log('='.repeat(70));

  const invalidVars = appEnvResult.error?.issues.map((i) => i.path[0] as string);

  if (invalidVars && invalidVars.length > 0) {
    console.log('\n❌ Invalid Environment Variables:');
    invalidVars.forEach((varName) => {
      console.log(`   - ${varName}`);
    });
  }
  console.log('='.repeat(70) + '\n');
}
