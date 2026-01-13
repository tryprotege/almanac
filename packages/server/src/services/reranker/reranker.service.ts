import { env } from '../../env.js';
import logger from '../../utils/logger.js';

/**
 * Document to be reranked
 */
export interface RerankDocument {
  id: string;
  text: string;
}

/**
 * Reranked result with score
 */
export interface RerankResult {
  id: string;
  score: number; // Normalized 0.0 - 1.0
}

/**
 * Reranker options
 */
export interface RerankOptions {
  topK?: number; // Number of top results to return (default: 20)
  minScore?: number; // Minimum score threshold (0.0 - 1.0)
}

/**
 * Generic Reranker Service
 * Works with any OpenAI-compatible reranker API
 */
export class RerankerService {
  private baseUrl: string | undefined;
  private apiKey: string;
  private model: string | undefined;

  constructor() {
    this.baseUrl = env.RERANKER_BASE_URL;
    this.apiKey = env.RERANKER_API_KEY || '';
    this.model = env.RERANKER_MODEL;
  }

  /**
   * Check if reranker is enabled
   */
  isEnabled(): boolean {
    return env.RERANKER_ENABLED || true;
  }

  /**
   * Rerank documents based on query relevance
   */
  async rerank(
    query: string,
    documents: RerankDocument[],
    options?: RerankOptions,
  ): Promise<RerankResult[]> {
    if (!this.isEnabled()) {
      logger.warn('Reranker is disabled. Returning documents as-is.');
      return documents.map((doc, i) => ({
        id: doc.id,
        score: 1.0 - i * 0.01, // Simple descending score
      }));
    }

    if (documents.length === 0) {
      return [];
    }

    if (!this.apiKey) {
      throw new Error('RERANKER_API_KEY is required when RERANKER_ENABLED is true');
    }

    if (!this.baseUrl) {
      throw new Error('RERANKER_BASE_URL is required when RERANKER_ENABLED is true');
    }

    if (!this.model) {
      throw new Error('RERANKER_MODEL is required when RERANKER_ENABLED is true');
    }

    try {
      const url = this.baseUrl;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          query,
          documents: documents.map((d) => d.text),
          top_n: options?.topK,
          return_documents: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reranker API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      // Log the response for debugging
      logger.info({ data }, 'Reranker API response');

      // Handle different response formats
      const scores = this.extractScores(data);

      if (scores.length !== documents.length) {
        throw new Error(
          `Reranker returned ${scores.length} scores but expected ${documents.length}`,
        );
      }

      // Combine scores with document IDs
      let results = documents.map((doc, i) => ({
        id: doc.id,
        score: scores[i],
      }));

      // Filter by minimum score if specified
      if (options?.minScore !== undefined) {
        results = results.filter((r) => r.score >= options.minScore!);
      }

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      // Take top K if specified
      if (options?.topK !== undefined) {
        results = results.slice(0, options.topK);
      }

      return results;
    } catch (err) {
      logger.error({ err, query }, 'Reranker error');
      throw err;
    }
  }

  /**
   * Extract scores from different API response formats
   */
  private extractScores(data: any): number[] {
    // Fireworks API format - results include original index and are sorted by relevance
    // We need to re-sort by index to match original document order
    if (Array.isArray(data.data) && data.data[0]?.index !== undefined) {
      const sortedResults = [...data.data].sort((a, b) => a.index - b.index);
      return sortedResults.map((r: any) => r.relevance_score || 0);
    }

    // Try different common response formats
    if (Array.isArray(data.scores)) {
      return data.scores;
    }

    // Handle results array format
    if (Array.isArray(data.results)) {
      return data.results.map((r: any) => r.score || r.relevance_score || 0);
    }

    // Handle direct array response
    if (Array.isArray(data)) {
      return data.map((item: any) =>
        typeof item === 'number' ? item : item.score || item.relevance_score || 0,
      );
    }

    // Log unexpected format for debugging
    logger.error({ responseData: data }, 'Unexpected reranker response format');
    throw new Error('Could not extract scores from reranker response');
  }

  /**
   * Get reranker configuration
   */
  getConfig() {
    return {
      enabled: this.isEnabled(),
      model: this.model,
      baseUrl: this.baseUrl,
    };
  }
}
