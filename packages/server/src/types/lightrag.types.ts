/**
 * LightRAG Query Types
 * Structured retrieval without LLM generation
 */

import { SourceType } from "./index.js";

// ============================================
// Query Modes
// ============================================

export type LightRAGMode = "naive" | "local" | "global" | "hybrid" | "mix";

// ============================================
// Query Input
// ============================================

export interface LightRAGQuery {
  query: string;
  mode?: LightRAGMode;

  // Response format
  response_format?: "compact" | "full"; // default: "compact"

  // Retrieval parameters
  top_k?: number; // Entities/relations to retrieve (default: 60)
  chunk_top_k?: number; // Text chunks to retrieve (default: 20)

  // Options
  enable_rerank?: boolean; // Use reranker (default: true)
  score_threshold?: number; // Minimum relevance score (default: 0.6)

  // Filters
  filters?: {
    sources?: SourceType[];
    dateRange?: {
      start: string; // ISO date
      end: string; // ISO date
    };
  };
}

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
  degree: number;
  rank: number;
  source?: SourceType;
  sourceId?: string;
  url?: string;
  date?: string;
  relevance_score: number;
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
  extracted_by: "explicit" | "llm" | "heuristic";
  relevance_score?: number;
}

// ============================================
// Chunk Result (Agent-Friendly Response)
// ============================================

export interface LightRAGChunk {
  // Chunk identity
  id: string;
  chunk_index?: number; // Which chunk of the document (0, 1, 2...)

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

export interface LightRAGChunkFull extends LightRAGChunk {
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

export interface LightRAGResponse {
  // Query metadata
  query: string;
  mode: LightRAGMode;
  processing_time_ms: number;

  // Retrieved chunks
  chunks: LightRAGChunk[] | LightRAGChunkFull[];

  // Statistics
  stats: {
    total_chunks: number;
    unique_documents: number; // How many distinct docs represented
    processing_time_ms: number;

    // Breakdown by retrieval method
    retrieval_breakdown?: {
      vector_matches: number;
      graph_expanded: number;
      reranked: boolean;
    };
  };

  // Metadata for debugging
  metadata?: {
    keywords_extracted?: ExtractedKeywords;
    filters_applied?: boolean;
  };
}

// ============================================
// MCP Tool Definition
// ============================================

export const LIGHTRAG_QUERY_TOOL = {
  name: "ebee_search",
  description: `🐝 eBee Fast Search - Advanced knowledge retrieval using LightRAG architecture. Returns structured document chunks without LLM generation.

⚡ FASTEST SEARCH METHOD: Combines vector similarity + knowledge graph expansion + LLM reranking for optimal speed and accuracy.

Query Modes:
- naive: Pure vector similarity search (⚡ FASTEST ~50ms, best for simple keyword lookups)
- local: Entity-focused with 1-hop graph expansion (medium speed, best for "who/what/where" questions)
- global: Relationship-centric using high-weight edges (medium speed, best for "how/why" and thematic queries)
- hybrid: Combines local + global strategies (slower but comprehensive)
- mix: Parallel graph + vector search with LLM reranking (most accurate, production default)

Returns structured JSON with relevant document chunks, each containing title, snippet, source, score, and metadata.`,

  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "Your search query in natural language. Can be a question (e.g., 'Who is working on authentication?') or keywords (e.g., 'API documentation updates'). The system will extract entities and concepts automatically.",
      },
      mode: {
        type: "string",
        enum: ["naive", "local", "global", "hybrid", "mix"],
        description:
          "Retrieval strategy that determines how the knowledge graph and vector search are combined. 'naive': Pure vector similarity (fastest). 'local': Entity-focused with 1-hop graph expansion (best for who/what/where questions). 'global': Relationship-centric (best for how/why questions). 'hybrid': Combines local + global. 'mix': Parallel graph + vector with reranking (most accurate, default).",
      },
      response_format: {
        type: "string",
        enum: ["compact", "full"],
        description:
          "Output format for retrieved chunks. 'compact': Returns document snippets (200-500 characters) with minimal metadata (faster, smaller payload). 'full': Includes complete document content plus rich metadata (tags, dates, raw data). Default: 'compact'",
      },
      top_k: {
        type: "number",
        description:
          "Maximum number of entities and relationships to retrieve from the knowledge graph during the search phase (before final ranking). Higher values provide more comprehensive results but increase processing time. Range: 10-100. Recommended: 20-40 for quick answers, 60-80 for comprehensive coverage, 100+ for exhaustive search. Default: 60",
      },
      chunk_top_k: {
        type: "number",
        description:
          "Maximum number of document chunks (text excerpts) to return in the final results. This is the actual number of results you'll receive. Range: 5-50. Recommended: 10-20 for focused context, 30-50 for broad context. Default: 20",
      },
      enable_rerank: {
        type: "boolean",
        description:
          "Whether to use LLM-based reranking to improve result relevance. Reranking re-scores the initial results using semantic understanding, significantly improving accuracy but adding ~200ms processing time. Highly recommended for production. Only has effect when mode is 'mix'. Default: true",
      },
      score_threshold: {
        type: "number",
        description:
          "Minimum relevance score (0.0 to 1.0) for results to be included. Lower values return more results but with lower confidence. Higher values return fewer but more relevant results. Range: 0.0-1.0. Recommended: 0.5 for high recall, 0.7 for balanced, 0.8+ for high precision. Default: 0.6",
      },
      filters: {
        type: "object",
        description:
          "Optional filters to narrow down search results by source or date range.",
        properties: {
          sources: {
            type: "array",
            items: {
              type: "string",
              enum: ["notion", "slack", "calendar", "jira"],
            },
            description:
              "Filter results to specific data sources. Example: ['notion', 'slack']. Available sources: notion, slack, calendar, jira",
          },
          dateRange: {
            type: "object",
            description:
              "Filter results to documents within a specific date range (based on document creation/update time)",
            properties: {
              start: {
                type: "string",
                description:
                  "Filter results to documents created/updated after this date. ISO 8601 format. Example: '2024-01-01T00:00:00Z'",
              },
              end: {
                type: "string",
                description:
                  "Filter results to documents created/updated before this date. ISO 8601 format. Example: '2024-12-31T23:59:59Z'",
              },
            },
          },
        },
      },
    },
    required: ["query"],
  },
};
