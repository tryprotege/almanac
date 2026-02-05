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

export const lightragQueryInputSchema = z.object({
  query: z
    .string()
    .describe(
      "Your search query in natural language. Can be a question (e.g., 'Who is working on authentication?') or keywords (e.g., 'API documentation updates'). The system will extract entities and concepts automatically.",
    ),
  mode: z
    .enum(['naive', 'local', 'global', 'hybrid', 'mix'])
    .optional()
    .describe(
      "Retrieval strategy that determines how the knowledge graph and vector search are combined. 'naive': Pure vector similarity (fastest). 'local': Entity-focused with 1-hop graph expansion (best for who/what/where questions). 'global': Relationship-centric (best for how/why questions). 'hybrid': Combines local + global. 'mix': Parallel graph + vector with reranking (most accurate, default).",
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
      "Whether to disable LLM-based reranking. When false (default), reranking re-scores the initial results using semantic understanding, significantly improving accuracy but adding ~200ms processing time. Set to true to skip reranking for faster results. Only has effect when mode is 'mix'. Default: false",
    ),
  score_threshold: z
    .number()
    .optional()
    .describe(
      'Minimum relevance score (0.0 to 1.0) for results to be included. Lower values return more results but with lower confidence. Higher values return fewer but more relevant results. Range: 0.0-1.0. Recommended: 0.5 for high recall, 0.7 for balanced, 0.8+ for high precision. Default: 0.6',
    ),
});

// Infer the type from the schema
export type LightRAGQueryInput = z.infer<typeof lightragQueryInputSchema>;

// ============================================
// MCP Tool Definition
// ============================================

export const lightragQueryTool = async () => {
  const validConfigs = await loadProxyConfig();

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

📚 INDEXED SOURCES:
${validConfigs.map((config) => `- ${config.name}`).join('\n')}

Query Modes:
- naive: Pure vector similarity search (⚡ FASTEST ~50ms, best for simple keyword lookups)
- local: Entity-focused with 1-hop graph expansion (medium speed, best for "who/what/where" questions)
- global: Relationship-centric using high-weight edges (medium speed, best for "how/why" and thematic queries)
- hybrid: Combines local + global strategies (slower but comprehensive)
- mix: Parallel graph + vector search with LLM reranking (most accurate, production default)

Returns structured JSON with relevant document chunks, each containing title, snippet, source, score, and metadata.`,

    inputSchema: lightragQueryInputSchema,
  };
};
