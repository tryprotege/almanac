/**
 * Search contracts and interfaces
 */

export interface SearchQuery {
  text: string;
  workspaceId: string;
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
  score: number;
  title: string;
  textContent: string;
  source: string;
  type: string;
  primaryDate?: Date;
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
  query: string;
  results: ScoredResult[];
  totalFound: number;
  processingTimeMs: number;
}
