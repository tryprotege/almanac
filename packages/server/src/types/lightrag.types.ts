/**
 * LightRAG Query Types
 * Structured retrieval without LLM generation
 */

import { z } from 'zod';
import { loadProxyConfig } from '../mcp/config-loader.js';
import { SourceType } from './index.js';

// ============================================
// Extracted Keywords (Internal)
// ============================================

export interface ExtractedKeywords {
  high_level: string[]; // Conceptual keywords for relationship retrieval
  low_level: string[]; // Specific entities for entity retrieval
}

// ============================================
// Internal Types (used for retrieval, not returned)
// ============================================

export interface LightRAGEntity {
  id: string;
  name: string;
  type: string;
  description?: string;
  source?: SourceType;
  sourceId?: string;
  url?: string;
  date?: string;
  relevanceScore: number;
}

export interface LightRAGRelationship {
  id: string;
  source: { id: string; name: string; type: string };
  target: { id: string; name: string; type: string };
  type: string;
  description?: string;
  confidence: number;
  weight: number;
  rank: number;
  relevanceScore?: number;
}

// ============================================
// Chunk Result (Agent-Friendly Response)
// ============================================

export interface LightRAGRecord {
  // Chunk identity
  id: string;

  // Document reference
  document_id: string; // Parent document ID
  title: string; // Document title

  // Source metadata
  source: SourceType;
  source_id: string; // Original source ID
  url?: string; // Link to source
  date?: string; // ISO date

  // Content (the actual relevant excerpt)
  snippet: string; // The chunk text itself (200-500 chars)

  // Relevance
  score: number; // 0-1, relevance score

  // Light metadata (minimal for compact mode)
  type?: string; // "page", "message", etc.
  people?: string[]; // People mentioned
}

export interface LightRAGChunkFull extends LightRAGRecord {
  // Full mode additions
  full_content: string; // Complete document text
  position?: {
    // Where this chunk is in the doc
    start: number;
    end: number;
  };
  metadata?: {
    // Rich metadata
    tags?: string[];
    created_by?: string;
    created_at?: string;
    updated_at?: string;
    rawData?: Record<string, any>;
  };
}

// ============================================
// Response Structure (Chunk-Based)
// ============================================

export type LightRAGResponse = {
  source: string;
  recordType: string;
  rawData: any;
  score: number;
  content: string;
}[];

// ============================================
// Zod Input Schema
// ============================================

/**
 * Build dynamic schema with descriptions that reflect current system settings
 */
export function buildLightragQueryInputSchema(settings: {
  rerankerEnabled: boolean;
  rerankerModel?: string;
  scoreThresholdVector: number;
  scoreThresholdReranker: number;
}) {
  const { rerankerEnabled, rerankerModel, scoreThresholdVector, scoreThresholdReranker } = settings;

  return z.object({
    query: z
      .string()
      .describe(
        "Your search query in natural language. Can be a question (e.g., 'Who is working on authentication?') or keywords (e.g., 'API documentation updates'). The system will extract entities and concepts automatically.",
      ),
    mode: z
      .enum(['naive', 'local', 'global', 'hybrid', 'mix'])
      .optional()
      .describe(
        rerankerEnabled
          ? "Retrieval strategy that determines how the knowledge graph and vector search are combined. 'naive': Pure vector similarity (fastest). 'local': Entity-focused with 1-hop graph expansion (best for who/what/where questions). 'global': Relationship-centric (best for how/why questions). 'hybrid': Combines local + global. 'mix': Parallel graph + vector with LLM reranking (most accurate, default)."
          : "Retrieval strategy that determines how the knowledge graph and vector search are combined. 'naive': Pure vector similarity (fastest). 'local': Entity-focused with 1-hop graph expansion (best for who/what/where questions). 'global': Relationship-centric (best for how/why questions). 'hybrid': Combines local + global (default, reranker disabled). 'mix': Same as hybrid since reranker is disabled.",
      ),
    response_format: z
      .enum(['compact', 'full'])
      .optional()
      .describe(
        "Output format for retrieved chunks. 'compact': Returns document snippets (200-500 characters) with minimal metadata (faster, smaller payload). 'full': Includes complete document content plus rich metadata (tags, dates, raw data). Default: 'compact'",
      ),
    top_k: z
      .number()
      .optional()
      .describe(
        'Maximum number of entities and relationships to retrieve from the knowledge graph during the search phase (before final ranking). Higher values provide more comprehensive results but increase processing time. Range: 10-100. Recommended: 20-40 for quick answers, 60-80 for comprehensive coverage, 100+ for exhaustive search. Default: 60',
      ),
    chunk_top_k: z
      .number()
      .optional()
      .describe(
        "Maximum number of document chunks (text excerpts) to return in the final results. This is the actual number of results you'll receive. Range: 5-50. Recommended: 10-20 for focused context, 30-50 for broad context. Default: 20",
      ),
    disable_rerank: z
      .boolean()
      .optional()
      .describe(
        rerankerEnabled
          ? `Reranker is ENABLED (model: ${rerankerModel || 'default'}). When false (default), reranking re-scores results using semantic understanding, significantly improving accuracy but adding ~200ms. Set to true to skip reranking for faster results. Only affects 'mix' mode.`
          : `Reranker is DISABLED globally. This parameter has no effect.`,
      ),
    score_threshold: z
      .number()
      .optional()
      .describe(
        `Optional override for relevance score filtering (0.0 to 1.0). Current server defaults: vector search=${scoreThresholdVector}, reranker=${scoreThresholdReranker}. When provided, applies to all search stages. Lower values = higher recall, higher values = higher precision.`,
      ),
  });
}

// Static schema for backward compatibility and type inference
export const lightragQueryInputSchema = z.object({
  query: z.string(),
  mode: z.enum(['naive', 'local', 'global', 'hybrid', 'mix']).optional(),
  response_format: z.enum(['compact', 'full']).optional(),
  top_k: z.number().optional(),
  chunk_top_k: z.number().optional(),
  disable_rerank: z.boolean().optional(),
  score_threshold: z.number().optional(),
});

// Infer the type from the schema
export type LightRAGQueryInput = z.infer<typeof lightragQueryInputSchema>;

// ============================================
// MCP Tool Definition
// ============================================

export const lightragQueryTool = async () => {
  const validConfigs = await loadProxyConfig();
  const { env } = await import('../env.js');

  // Build reranker status info
  const rerankerStatus = env.RERANKER_ENABLED
    ? `✅ Reranker: ENABLED (model: ${env.RERANKER_MODEL || 'default'})`
    : `⚠️ Reranker: DISABLED (mix mode behaves like hybrid)`;

  // Build threshold info
  const thresholdInfo = `Score thresholds: vector=${env.SCORE_THRESHOLD_VECTOR ?? 0.3}, reranker=${env.SCORE_THRESHOLD_RERANKER ?? 0.2}`;

  // Build mode descriptions based on reranker state
  const defaultMode = env.RERANKER_ENABLED ? 'mix' : 'hybrid';
  const modeDescriptions = env.RERANKER_ENABLED
    ? `Query Modes:
- naive: Pure vector similarity search (⚡ FASTEST, best for simple keyword lookups)
- local: Entity-focused with 1-hop graph expansion (best for "who/what/where" questions)
- global: Relationship-centric (best for "how/why" and thematic queries)
- hybrid: Combines local + global strategies
- mix: Parallel graph + vector + LLM reranking (most accurate, default)`
    : `Query Modes:
- naive: Pure vector similarity search (⚡ FASTEST, best for simple keyword lookups)
- local: Entity-focused with 1-hop graph expansion (best for "who/what/where" questions)
- global: Relationship-centric (best for "how/why" and thematic queries)
- hybrid: Combines local + global strategies (default, reranker disabled)
- mix: Same as hybrid (reranker disabled)`;

  // Build dynamic input schema
  const dynamicInputSchema = buildLightragQueryInputSchema({
    rerankerEnabled: env.RERANKER_ENABLED,
    rerankerModel: env.RERANKER_MODEL,
    scoreThresholdVector: env.SCORE_THRESHOLD_VECTOR ?? 0.3,
    scoreThresholdReranker: env.SCORE_THRESHOLD_RERANKER ?? 0.2,
  });

  return {
    name: 'almanac_search',
    description: `📚 Almanac Fast Search - YOUR PRIMARY TOOL FOR INTERNAL KNOWLEDGE

⚠️ ALWAYS USE THIS FIRST for questions about:
- Internal documentation, wikis, and knowledge bases
- Team communications (Slack, emails)
- Project data (GitHub issues, PRs, code)
- Analytics and metrics (Fathom, dashboards)
- Calendars, meetings, and schedules
- Any indexed company/project data

❌ DO NOT use web search or direct MCP tools (github, fathom, notion, slack) for indexed data.
Only use those for EXTERNAL information not in Almanac or for WRITE operations (creating issues, sending messages).

⚡ PERFORMANCE: 10-100x faster than individual MCP calls due to unified graph+vector architecture.

🔧 SYSTEM SETTINGS:
${rerankerStatus}
${thresholdInfo}
Default mode: ${defaultMode}

📚 INDEXED SOURCES:
${validConfigs.map((config) => `- ${config.name}`).join('\n')}

${modeDescriptions}

Returns structured JSON with relevant document chunks, each containing title, snippet, source, score, and metadata.`,

    inputSchema: dynamicInputSchema,
  };
};
