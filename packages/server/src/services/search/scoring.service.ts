import {
  ExpandedResult,
  ScoredResult,
} from "../../contracts/search.contracts.js";

export interface ScoringWeights {
  vectorSimilarity: number; // 0-1, importance of semantic similarity
  graphConnectivity: number; // 0-1, importance of graph connections
  recency: number; // 0-1, importance of time
  popularity: number; // 0-1, importance of engagement
}

/**
 * Result Scoring Service
 * Combines multiple signals into final ranking
 */
export class ScoringService {
  private weights: ScoringWeights;

  constructor(weights?: Partial<ScoringWeights>) {
    // Default weights
    this.weights = {
      vectorSimilarity: 0.5,
      graphConnectivity: 0.2,
      recency: 0.2,
      popularity: 0.1,
      ...weights,
    };

    // Normalize weights to sum to 1.0
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (sum !== 1.0) {
      Object.keys(this.weights).forEach((key) => {
        this.weights[key as keyof ScoringWeights] /= sum;
      });
    }
  }

  /**
   * Score and rank results
   *
   * Implementation steps:
   * 1. For each result, calculate component scores
   * 2. Combine with configured weights
   * 3. Sort by final score
   */
  score(
    results: ExpandedResult[],
    queryDate: Date = new Date()
  ): ScoredResult[] {
    console.log(`[Scoring] Scoring ${results.length} results`);

    // Calculate scores for each result
    const scored = results.map((result) => {
      const vectorScore = result.score; // Already normalized 0-1
      const graphScore = result.graphScore;
      const recencyScore = this.calculateRecencyScore(
        result.primaryDate,
        queryDate
      );
      const popularityScore = this.calculatePopularityScore(result);

      // Weighted combination
      const finalScore =
        vectorScore * this.weights.vectorSimilarity +
        graphScore * this.weights.graphConnectivity +
        recencyScore * this.weights.recency +
        popularityScore * this.weights.popularity;

      return {
        ...result,
        finalScore,
        scoreBreakdown: {
          vector: vectorScore,
          graph: graphScore,
          recency: recencyScore,
          popularity: popularityScore,
        },
      };
    });

    // Sort by final score
    scored.sort((a, b) => b.finalScore - a.finalScore);

    console.log(
      `[Scoring] Top result score: ${scored[0]?.finalScore.toFixed(3)}`
    );
    return scored;
  }

  /**
   * Calculate recency score with exponential decay
   * Recent documents score higher
   */
  private calculateRecencyScore(
    resourceDate: Date | null | undefined,
    queryDate: Date
  ): number {
    if (!resourceDate) return 0.5; // Neutral for unknown dates

    // Calculate days difference
    const daysDiff = Math.abs(
      (queryDate.getTime() - resourceDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Exponential decay: 1.0 today → 0.5 at 30 days → 0.1 at 180 days
    return Math.exp(-daysDiff / 60);
  }

  /**
   * Calculate popularity score based on engagement signals
   */
  private calculatePopularityScore(result: ExpandedResult): number {
    // Score based on:
    // 1. Number of people involved
    const peopleScore = Math.min(result.people.length / 10, 1.0);

    // 2. Number of relationships (connectivity)
    const relationshipScore = Math.min(
      result.relatedResources.length / 20,
      1.0
    );

    return peopleScore * 0.5 + relationshipScore * 0.5;
  }

  /**
   * Update scoring weights dynamically
   */
  updateWeights(newWeights: Partial<ScoringWeights>) {
    this.weights = { ...this.weights, ...newWeights };

    // Re-normalize
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (sum !== 1.0) {
      Object.keys(this.weights).forEach((key) => {
        this.weights[key as keyof ScoringWeights] /= sum;
      });
    }
  }

  /**
   * Get current weights
   */
  getWeights(): ScoringWeights {
    return { ...this.weights };
  }
}
