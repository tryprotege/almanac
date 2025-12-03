import { env } from "../../env.js";

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
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.baseUrl = env.RERANKER_BASE_URL;
    this.apiKey = env.RERANKER_API_KEY || "";
    this.model = env.RERANKER_MODEL;
  }

  /**
   * Check if reranker is enabled
   */
  isEnabled(): boolean {
    return env.RERANKER_ENABLED;
  }

  /**
   * Rerank documents based on query relevance
   */
  async rerank(
    query: string,
    documents: RerankDocument[],
    options?: RerankOptions
  ): Promise<RerankResult[]> {
    if (!this.isEnabled()) {
      console.warn("Reranker is disabled. Returning documents as-is.");
      return documents.map((doc, i) => ({
        id: doc.id,
        score: 1.0 - i * 0.01, // Simple descending score
      }));
    }

    if (documents.length === 0) {
      return [];
    }

    if (!this.apiKey) {
      throw new Error(
        "RERANKER_API_KEY is required when RERANKER_ENABLED is true"
      );
    }

    try {
      const url = `${this.baseUrl}/${this.model}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          documents: documents.map((d) => d.text),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Reranker API error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();

      // Handle different response formats
      const scores = this.extractScores(data);

      if (scores.length !== documents.length) {
        throw new Error(
          `Reranker returned ${scores.length} scores but expected ${documents.length}`
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
    } catch (error) {
      console.error("Reranker error:", error);
      throw error;
    }
  }

  /**
   * Extract scores from different API response formats
   */
  private extractScores(data: any): number[] {
    // Try different common response formats
    if (Array.isArray(data.scores)) {
      return data.scores;
    }

    if (Array.isArray(data.results)) {
      return data.results.map((r: any) => r.score || r.relevance_score || 0);
    }

    if (Array.isArray(data)) {
      return data.map((item: any) => item.score || item.relevance_score || 0);
    }

    throw new Error("Could not extract scores from reranker response");
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
