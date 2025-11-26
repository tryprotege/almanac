import { VectorSearchService } from "./vector-search.service.js";
import { GraphExpansionService } from "./graph-expansion.service.js";
import { ScoringService } from "./scoring.service.js";
import { RerankerService } from "../reranker/reranker.service.js";
import {
  SearchQuery,
  SearchResponse,
  ScoredResult,
} from "../../contracts/search.contracts.js";

/**
 * Main Search Service
 * Orchestrates the full search pipeline:
 * Vector Search → Graph Expansion → Scoring → LLM Reranking
 */
export class SearchService {
  constructor(
    private vectorSearch: VectorSearchService,
    private graphExpansion: GraphExpansionService,
    private scoring: ScoringService,
    private reranker: RerankerService
  ) {}

  /**
   * Main search method
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    console.log(`\n[Search Pipeline] Query: "${query.text}"`);

    // Step 1 - Vector search
    const vectorResults = await this.vectorSearch.search(query);
    console.log(
      `[Search Pipeline] ✓ Vector search: ${vectorResults.length} results`
    );

    if (vectorResults.length === 0) {
      return {
        query: query.text,
        results: [],
        totalFound: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 2 - Graph expansion
    const expandedResults = await this.graphExpansion.expand(
      query.workspaceId,
      vectorResults,
      {
        maxDepth: 2,
        maxRelated: 5,
        minConfidence: 0.6,
      }
    );
    console.log(`[Search Pipeline] ✓ Graph expansion complete`);

    // Step 3 - Scoring
    const scoredResults = this.scoring.score(expandedResults);
    console.log(`[Search Pipeline] ✓ Scoring complete`);

    // Step 4 - LLM reranking (optional)
    let finalResults = scoredResults;
    if (this.reranker.isEnabled() && scoredResults.length > 0) {
      finalResults = await this.applyReranking(query.text, scoredResults);
      console.log(`[Search Pipeline] ✓ LLM reranking applied`);
    }

    // Apply limit
    const limitedResults = finalResults.slice(0, query.limit || 20);

    const processingTimeMs = Date.now() - startTime;
    console.log(
      `[Search Pipeline] ✅ Complete in ${processingTimeMs}ms - ${limitedResults.length} results\n`
    );

    return {
      query: query.text,
      results: limitedResults,
      totalFound: vectorResults.length,
      processingTimeMs,
    };
  }

  /**
   * Apply LLM reranking to scored results
   */
  private async applyReranking(
    query: string,
    scoredResults: ScoredResult[]
  ): Promise<ScoredResult[]> {
    // Prepare documents for reranking
    const rerankDocs = scoredResults.map((r) => ({
      id: r.id,
      text: `${r.title}\n${r.textContent.substring(0, 500)}`, // Limit context
    }));

    // Call reranker
    const reranked = await this.reranker.rerank(query, rerankDocs, {
      topK: 50, // Rerank top 50
    });

    // Merge reranker scores with existing scores
    const rerankMap = new Map(reranked.map((r) => [r.id, r.score]));

    scoredResults.forEach((result) => {
      const rerankScore = rerankMap.get(result.id);
      if (rerankScore !== undefined) {
        // Blend: 40% original score + 60% rerank score
        result.finalScore = result.finalScore * 0.4 + rerankScore * 0.6;
      }
    });

    // Re-sort by updated scores
    scoredResults.sort((a, b) => b.finalScore - a.finalScore);

    return scoredResults;
  }
}
