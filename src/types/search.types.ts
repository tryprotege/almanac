/**
 * Search Types
 * Consolidated from contracts - single-tenant (no workspace)
 */

import type { SourceType } from "./index.js";

export interface SearchQuery {
  text: string;
  filters?: {
    sources?: string[];
    types?: string[];
    people?: string[];
    dateRange?: { start: Date; end: Date };
  };
  limit?: number;
  scoreThreshold?: number;
}

export interface SearchResult {
  id: string;
  externalId?: string;
  score: number;
  title: string;
  snippet?: string;
  textContent: string;
  source: string | SourceType;
  type: string;
  url?: string;
  primaryDate?: Date;
  date?: string;
  people: string[];
  attributes: Record<string, any>;
}

export interface RelatedResource {
  id: string;
  relationshipType: string;
  confidence: number;
  title: string;
  type: string;
}

export interface ExpandedResult extends SearchResult {
  relatedResources: RelatedResource[];
  graphScore: number;
}

export interface ScoredResult extends ExpandedResult {
  finalScore: number;
  scoreBreakdown: {
    vector: number;
    graph: number;
    recency: number;
    popularity: number;
  };
}

export interface SearchResponse {
  query?: string;
  results: ScoredResult[];
  totalFound?: number;
  total?: number;
  processingTimeMs?: number;
  meta?: {
    total: number;
    latencyMs: number;
  };
}

// Smart Search Tool Definition
export const SMART_SEARCH_TOOL = {
  name: "smart_search",
  description:
    "Search across all connected sources (Notion, Slack, Calendar, Fathom, etc.) using natural language. Returns semantically relevant results.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Natural language search query",
      },
      sources: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "notion",
            "slack",
            "calendar",
            "fathom",
            "whatsapp",
            "codebase",
            "asana",
            "jira",
            "google_drive",
          ],
        },
        description: "Filter results to specific sources",
      },
      types: {
        type: "array",
        items: { type: "string" },
        description:
          "Filter by resource type (page, message, event, call, file)",
      },
      dateRange: {
        type: "object",
        properties: {
          start: { type: "string", description: "ISO date string" },
          end: { type: "string", description: "ISO date string" },
        },
      },
      limit: {
        type: "number",
        description: "Maximum results (default: 20)",
      },
    },
    required: ["query"],
  },
};

// Service Interface
export interface SearchService {
  search(args: {
    query: string;
    sources?: SourceType[];
    types?: string[];
    dateRange?: { start: string; end: string };
    limit?: number;
  }): Promise<SearchResponse>;
}
