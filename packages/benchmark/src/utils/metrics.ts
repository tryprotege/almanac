/**
 * Metrics Collection Utilities - Functional Approach
 * Pure functions for collecting and aggregating metrics
 */

import type {
  QueryMetrics,
  AgentMetrics,
  ComparisonMetrics,
  AccuracyMetrics,
  TokenUsage,
  ScoreDistribution,
  LightRAGResponse,
  LightRAGChunk,
  QueryStatistics,
} from '../types/index.js';
import { calculateStatistics, mean, sum } from './statistics.js';

// ============================================
// Token Estimation
// ============================================

/**
 * Estimate tokens from text (rough approximation: 1 token ≈ 4 characters)
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/**
 * Estimate token usage from LightRAG response
 */
export const estimateTokenUsage = (response: LightRAGResponse): TokenUsage => {
  const queryTokens = estimateTokens(response.query);

  const keywordTokens = response.metadata?.keywords_extracted
    ? estimateTokens(
        [
          ...response.metadata.keywords_extracted.high_level,
          ...response.metadata.keywords_extracted.low_level,
        ].join(' '),
      )
    : 0;

  const embeddingTokens = queryTokens + keywordTokens;

  const rerankingTokens = response.stats.retrieval_breakdown?.reranked
    ? sum(response.chunks.map((chunk) => estimateTokens(chunk.title + chunk.snippet)))
    : 0;

  return {
    embedding: embeddingTokens,
    reranking: rerankingTokens,
    total: embeddingTokens + rerankingTokens,
  };
};

// ============================================
// Score Analysis
// ============================================

/**
 * Calculate average score from chunks
 */
export const calculateAverageScore = (chunks: readonly LightRAGChunk[]): number => {
  if (chunks.length === 0) return 0;
  return mean(chunks.map((c) => c.score));
};

/**
 * Calculate score distribution
 */
export const calculateScoreDistribution = (chunks: readonly LightRAGChunk[]): ScoreDistribution => {
  const high = chunks.filter((c) => c.score > 0.8).length;
  const medium = chunks.filter((c) => c.score >= 0.6 && c.score <= 0.8).length;
  const low = chunks.filter((c) => c.score < 0.6).length;

  return { high, medium, low };
};

// ============================================
// Query Metrics Aggregation
// ============================================

/**
 * Aggregate query metrics into statistics
 */
export const aggregateQueryMetrics = (metrics: readonly QueryMetrics[]): QueryStatistics => {
  if (metrics.length === 0) {
    return {
      totalTime: {
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        stdDev: 0,
        p95: 0,
        p99: 0,
      },
      tokenUsage: { mean: 0, total: 0 },
      resultsQuality: { meanScore: 0, meanResults: 0 },
    };
  }

  return {
    totalTime: calculateStatistics(metrics.map((m) => m.totalTime)),
    tokenUsage: {
      mean: mean(metrics.map((m) => m.tokenUsage.total)),
      total: sum(metrics.map((m) => m.tokenUsage.total)),
    },
    resultsQuality: {
      meanScore: mean(metrics.map((m) => m.averageScore)),
      meanResults: mean(metrics.map((m) => m.resultsReturned)),
    },
  };
};

// ============================================
// Timing Utilities
// ============================================

/**
 * Create a timer function that returns elapsed time
 */
export const createTimer = (): (() => number) => {
  const startTime = Date.now();
  return () => Date.now() - startTime;
};

/**
 * Measure execution time of an async function
 */
export const measureTime = async <T>(
  fn: () => Promise<T>,
): Promise<{ result: T; duration: number }> => {
  const timer = createTimer();
  const result = await fn();
  const duration = timer();
  return { result, duration };
};

/**
 * Measure execution time with breakdown tracking
 */
export const measureWithBreakdown = async <T>(
  fn: (markPhase: (phase: string) => void) => Promise<T>,
): Promise<{
  result: T;
  duration: number;
  breakdown: Record<string, number>;
}> => {
  const startTime = Date.now();
  const phases: Record<string, number> = {};
  let lastPhaseTime = startTime;

  const markPhase = (phase: string): void => {
    const now = Date.now();
    phases[phase] = now - lastPhaseTime;
    lastPhaseTime = now;
  };

  const result = await fn(markPhase);
  const duration = Date.now() - startTime;

  return { result, duration, breakdown: phases };
};

// ============================================
// Metrics Formatting
// ============================================

/**
 * Format metrics for display
 */
export const formatMetrics = (metrics: QueryMetrics): string => {
  return `
Query: ${metrics.queryId}
Mode: ${metrics.mode}
Time: ${metrics.totalTime}ms
Tokens: ${metrics.tokenUsage.total}
Results: ${metrics.resultsReturned} (${metrics.uniqueDocuments} docs)
Avg Score: ${metrics.averageScore.toFixed(3)}
  `.trim();
};

/**
 * Format statistics for display
 */
export const formatStatistics = (stats: QueryStatistics): string => {
  return `
Mean: ${stats.totalTime.mean.toFixed(2)}ms
Median: ${stats.totalTime.median.toFixed(2)}ms
P95: ${stats.totalTime.p95.toFixed(2)}ms
P99: ${stats.totalTime.p99.toFixed(2)}ms
Tokens: ${stats.tokenUsage.mean.toFixed(0)} avg, ${stats.tokenUsage.total} total
Quality: ${stats.resultsQuality.meanScore.toFixed(
    3,
  )} score, ${stats.resultsQuality.meanResults.toFixed(1)} results
  `.trim();
};

// ============================================
// Comparison Utilities
// ============================================

/**
 * Calculate speedup factor
 */
export const calculateSpeedup = (baselineTime: number, optimizedTime: number): number => {
  if (optimizedTime === 0) return 0;
  return baselineTime / optimizedTime;
};

/**
 * Calculate token efficiency (savings percentage)
 */
export const calculateTokenEfficiency = (
  baselineTokens: number,
  optimizedTokens: number,
): number => {
  if (baselineTokens === 0) return 0;
  return ((baselineTokens - optimizedTokens) / baselineTokens) * 100;
};

/**
 * Calculate quality delta
 */
export const calculateQualityDelta = (
  baselineQuality: number,
  optimizedQuality: number,
): number => {
  return optimizedQuality - baselineQuality;
};

// ============================================
// Export Utilities
// ============================================

/**
 * Convert metrics to CSV row
 */
export const metricsToCSV = (metrics: QueryMetrics): string => {
  return [
    metrics.queryId,
    metrics.mode,
    metrics.totalTime,
    metrics.tokenUsage.total,
    metrics.resultsReturned,
    metrics.uniqueDocuments,
    metrics.averageScore,
    metrics.vectorMatches,
    metrics.graphExpanded,
    metrics.rerankingApplied,
  ].join(',');
};

/**
 * Get CSV header
 */
export const getCSVHeader = (): string => {
  return [
    'queryId',
    'mode',
    'totalTime',
    'tokens',
    'results',
    'uniqueDocs',
    'avgScore',
    'vectorMatches',
    'graphExpanded',
    'reranked',
  ].join(',');
};
