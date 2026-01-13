/**
 * Environment Configuration for Benchmark Package
 * Validates and provides access to environment variables
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file from benchmark package directory
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const envSchema = z.object({
  // API Keys - Each platform has its own key (no defaults)
  AMP_API_KEY: z.string().min(1, 'AMP_API_KEY is required'),
  CLAUDE_API_KEY: z.string().min(1, 'CLAUDE_API_KEY is required'),

  // eBee Configuration
  EBEE_URL: z.string().url(),

  // Benchmark Configuration
  BENCHMARK_OUTPUT_DIR: z.string(),
  BENCHMARK_ITERATIONS: z.coerce.number().positive(),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Environment validation failed:');
  console.error(error);
  console.error('\n💡 Make sure you have a .env file in packages/benchmark/');
  console.error('   Copy .env.example to .env and fill in your API keys.\n');
  process.exit(1);
}

/**
 * Get API key for specific agent
 * Each agent must have its own configured API key
 */
export function getApiKeyForAgent(agentName: string): string {
  const normalizedName = agentName.toLowerCase();

  switch (normalizedName) {
    case 'amp':
      return env.AMP_API_KEY;
    case 'claude-cli':
    case 'claude':
      return env.CLAUDE_API_KEY;
    default:
      throw new Error(`Unknown agent: ${agentName}. Supported agents: amp, claude-cli`);
  }
}

export { env };
