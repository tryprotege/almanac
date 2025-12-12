/**
 * Query Benchmark Runner - Functional Approach
 * Pure functions for running query performance benchmarks
 */

import type {
  QueryBenchmarkConfig,
  QueryBenchmarkResult,
  QueryBenchmarkResults,
  BenchmarkQuery,
  LightRAGMode,
  LightRAGQuery,
  LightRAGResponse,
  QueryMetrics,
  QueryStatistics,
  QueryCategory,
} from "../types/index.js";
import {
  estimateTokenUsage,
  calculateAverageScore,
  calculateScoreDistribution,
  aggregateQueryMetrics,
  measureTime,
} from "../utils/metrics.js";
import { groupBy, statisticsByGroup } from "../utils/statistics.js";

// ============================================
// Core Runner Functions
// ============================================

/**
 * Run a single query benchmark iteration
 */
export const runQueryIteration = async (
  query: BenchmarkQuery,
  mode: LightRAGMode,
  params: Partial<LightRAGQuery>,
  queryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>
): Promise<QueryMetrics> => {
  const { result: response, duration } = await measureTime(() =>
    queryFn({
      query: query.query,
      mode,
      ...params,
    })
  );

  return {
    queryId: query.id,
    mode,
    timestamp: new Date().toISOString(),
    totalTime: duration,
    breakdown: {
      keywordExtraction: 0, // Would need instrumentation
      vectorSearch: 0,
      graphTraversal: 0,
      reranking: 0,
      resultFormatting: 0,
    },
    tokenUsage: estimateTokenUsage(response),
    resultsReturned: response.chunks.length,
    uniqueDocuments: response.stats.unique_documents,
    vectorMatches: response.stats.retrieval_breakdown?.vector_matches || 0,
    graphExpanded: response.stats.retrieval_breakdown?.graph_expanded || 0,
    rerankingApplied: response.stats.retrieval_breakdown?.reranked || false,
    averageScore: calculateAverageScore(response.chunks),
    scoreDistribution: calculateScoreDistribution(response.chunks),
  };
};

/**
 * Run multiple iterations for a query/mode/params combination
 */
export const runQueryBenchmark = async (
  query: BenchmarkQuery,
  mode: LightRAGMode,
  params: Partial<LightRAGQuery>,
  iterations: number,
  queryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>
): Promise<QueryBenchmarkResult> => {
  const runs: QueryMetrics[] = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const metrics = await runQueryIteration(query, mode, params, queryFn);
      runs.push(metrics);
    } catch (error) {
      console.error(`Iteration ${i} failed:`, error);
    }
  }

  return {
    query,
    mode,
    params,
    runs,
    statistics: aggregateQueryMetrics(runs),
  };
};

// ============================================
// Parameter Generation
// ============================================

/**
 * Generate all parameter combinations from config
 */
export const generateParameterCombinations = (
  config: QueryBenchmarkConfig
): Array<Partial<LightRAGQuery>> => {
  const { parameters } = config;

  const topKValues = parameters.top_k || [60];
  const chunkTopKValues = parameters.chunk_top_k || [20];
  const rerankValues = parameters.enable_rerank || [true];
  const thresholdValues = parameters.score_threshold || [0.6];

  const combinations: Array<Partial<LightRAGQuery>> = [];

  for (const topK of topKValues) {
    for (const chunkTopK of chunkTopKValues) {
      for (const rerank of rerankValues) {
        for (const threshold of thresholdValues) {
          combinations.push({
            top_k: topK,
            chunk_top_k: chunkTopK,
            enable_rerank: rerank,
            score_threshold: threshold,
          });
        }
      }
    }
  }

  return combinations;
};

// ============================================
// Warmup
// ============================================

/**
 * Run warmup iterations to stabilize performance
 */
export const runWarmup = async (
  config: QueryBenchmarkConfig,
  queryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>
): Promise<void> => {
  if (!config.warmupRuns || config.warmupRuns === 0) return;

  console.log(`🔥 Running ${config.warmupRuns} warmup iterations...`);

  const warmupQuery = config.queries[0];
  const warmupMode = config.modes[0];

  for (let i = 0; i < config.warmupRuns; i++) {
    try {
      await queryFn({
        query: warmupQuery.query,
        mode: warmupMode,
      });
    } catch (error) {
      console.error(`Warmup iteration ${i} failed:`, error);
    }
  }

  console.log("✅ Warmup complete\n");
};

// ============================================
// Aggregation Functions
// ============================================

/**
 * Aggregate results by mode
 */
export const aggregateByMode = (
  results: readonly QueryBenchmarkResult[]
): Record<LightRAGMode, QueryStatistics> => {
  const grouped = groupBy(results, (r) => r.mode);

  return Object.entries(grouped).reduce((acc, [mode, group]) => {
    const allMetrics = (group as QueryBenchmarkResult[]).flatMap((r) => r.runs);
    acc[mode as LightRAGMode] = aggregateQueryMetrics(allMetrics);
    return acc;
  }, {} as Record<LightRAGMode, QueryStatistics>);
};

/**
 * Aggregate results by query category
 */
export const aggregateByCategory = (
  results: readonly QueryBenchmarkResult[]
): Record<QueryCategory, QueryStatistics> => {
  const grouped = groupBy(results, (r) => r.query.category);

  return Object.entries(grouped).reduce((acc, [category, group]) => {
    const allMetrics = (group as QueryBenchmarkResult[]).flatMap((r) => r.runs);
    acc[category as QueryCategory] = aggregateQueryMetrics(allMetrics);
    return acc;
  }, {} as Record<QueryCategory, QueryStatistics>);
};

/**
 * Calculate overall statistics
 */
export const calculateOverallStatistics = (
  results: readonly QueryBenchmarkResult[]
): QueryStatistics => {
  const allMetrics = results.flatMap((r) => r.runs);
  return aggregateQueryMetrics(allMetrics);
};

// ============================================
// Main Runner
// ============================================

/**
 * Run complete query benchmark
 */
export const runQueryBenchmarks = async (
  config: QueryBenchmarkConfig,
  queryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>
): Promise<QueryBenchmarkResults> => {
  console.log(`🚀 Starting query benchmark: ${config.name}`);
  console.log(`   Queries: ${config.queries.length}`);
  console.log(`   Modes: ${config.modes.join(", ")}`);
  console.log(`   Iterations: ${config.iterations}\n`);

  // Warmup
  await runWarmup(config, queryFn);

  // Generate parameter combinations
  const paramCombinations = generateParameterCombinations(config);
  console.log(
    `📊 Testing ${paramCombinations.length} parameter combinations\n`
  );

  // Run all benchmarks
  const queryResults: QueryBenchmarkResult[] = [];
  let completed = 0;
  const total =
    config.queries.length * config.modes.length * paramCombinations.length;

  for (const query of config.queries) {
    for (const mode of config.modes) {
      for (const params of paramCombinations) {
        console.log(
          `[${++completed}/${total}] Running: ${query.id} (${mode}) - ` +
            `top_k=${params.top_k}, chunk_top_k=${params.chunk_top_k}`
        );

        const result = await runQueryBenchmark(
          query,
          mode,
          params,
          config.iterations,
          queryFn
        );

        queryResults.push(result);

        // Show quick stats
        const stats = result.statistics;
        console.log(
          `   ⏱️  ${stats.totalTime.mean.toFixed(0)}ms avg, ` +
            `${stats.tokenUsage.mean.toFixed(0)} tokens, ` +
            `${stats.resultsQuality.meanScore.toFixed(3)} score\n`
        );
      }
    }
  }

  // Aggregate results
  const aggregated = {
    byMode: aggregateByMode(queryResults),
    byCategory: aggregateByCategory(queryResults),
    overall: calculateOverallStatistics(queryResults),
  };

  console.log("✅ Benchmark complete!\n");

  return {
    config,
    queryResults,
    aggregated,
    timestamp: new Date().toISOString(),
  };
};

// ============================================
// Result Filtering & Analysis
// ============================================

/**
 * Find best performing mode
 */
export const findBestMode = (
  results: QueryBenchmarkResults,
  metric: "speed" | "quality" | "efficiency" = "speed"
): { mode: LightRAGMode; score: number } => {
  const modes = Object.entries(results.aggregated.byMode);

  if (metric === "speed") {
    const [mode, stats] = modes.reduce((best, current) =>
      current[1].totalTime.mean < best[1].totalTime.mean ? current : best
    );
    return { mode: mode as LightRAGMode, score: stats.totalTime.mean };
  }

  if (metric === "quality") {
    const [mode, stats] = modes.reduce((best, current) =>
      current[1].resultsQuality.meanScore > best[1].resultsQuality.meanScore
        ? current
        : best
    );
    return {
      mode: mode as LightRAGMode,
      score: stats.resultsQuality.meanScore,
    };
  }

  // efficiency = quality / (time * tokens)
  const [mode, stats] = modes.reduce((best, current) => {
    const currentEfficiency =
      current[1].resultsQuality.meanScore /
      (current[1].totalTime.mean * current[1].tokenUsage.mean);
    const bestEfficiency =
      best[1].resultsQuality.meanScore /
      (best[1].totalTime.mean * best[1].tokenUsage.mean);
    return currentEfficiency > bestEfficiency ? current : best;
  });

  const efficiency =
    stats.resultsQuality.meanScore /
    (stats.totalTime.mean * stats.tokenUsage.mean);

  return { mode: mode as LightRAGMode, score: efficiency };
};

/**
 * Find optimal parameters for a mode
 */
export const findOptimalParameters = (
  results: QueryBenchmarkResults,
  mode: LightRAGMode,
  optimizeFor: "speed" | "quality" = "speed"
): { params: Partial<LightRAGQuery>; score: number } => {
  const modeResults = results.queryResults.filter((r) => r.mode === mode);

  if (modeResults.length === 0) {
    throw new Error(`No results found for mode: ${mode}`);
  }

  const best = modeResults.reduce((best, current) => {
    const currentScore =
      optimizeFor === "speed"
        ? current.statistics.totalTime.mean
        : current.statistics.resultsQuality.meanScore;

    const bestScore =
      optimizeFor === "speed"
        ? best.statistics.totalTime.mean
        : best.statistics.resultsQuality.meanScore;

    if (optimizeFor === "speed") {
      return currentScore < bestScore ? current : best;
    } else {
      return currentScore > bestScore ? current : best;
    }
  });

  const score =
    optimizeFor === "speed"
      ? best.statistics.totalTime.mean
      : best.statistics.resultsQuality.meanScore;

  return { params: best.params, score };
};
