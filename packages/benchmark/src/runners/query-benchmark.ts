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
 * Returns empty array if parameters not provided (let LLM auto-select)
 */
export const generateParameterCombinations = (
  config: QueryBenchmarkConfig
): Array<Partial<LightRAGQuery>> => {
  const { parameters } = config;

  // If no parameters provided, return empty object (LLM will auto-select)
  if (!parameters || Object.keys(parameters).length === 0) {
    return [{}];
  }

  const topKValues = parameters.top_k || [];
  const chunkTopKValues = parameters.chunk_top_k || [];
  const rerankValues = parameters.enable_rerank || [];
  const thresholdValues = parameters.score_threshold || [];

  // If all parameter arrays are empty, return empty object
  if (
    topKValues.length === 0 &&
    chunkTopKValues.length === 0 &&
    rerankValues.length === 0 &&
    thresholdValues.length === 0
  ) {
    return [{}];
  }

  const combinations: Array<Partial<LightRAGQuery>> = [];

  // Use at least one value for each parameter if specified
  const topKs = topKValues.length > 0 ? topKValues : [undefined];
  const chunkTopKs = chunkTopKValues.length > 0 ? chunkTopKValues : [undefined];
  const reranks = rerankValues.length > 0 ? rerankValues : [undefined];
  const thresholds = thresholdValues.length > 0 ? thresholdValues : [undefined];

  for (const topK of topKs) {
    for (const chunkTopK of chunkTopKs) {
      for (const rerank of reranks) {
        for (const threshold of thresholds) {
          const combo: Partial<LightRAGQuery> = {};
          if (topK !== undefined) combo.top_k = topK;
          if (chunkTopK !== undefined) combo.chunk_top_k = chunkTopK;
          if (rerank !== undefined) combo.enable_rerank = rerank;
          if (threshold !== undefined) combo.score_threshold = threshold;
          combinations.push(combo);
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
  const warmupMode = config.modes && config.modes[0] ? config.modes[0] : "mix";

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

  // If modes not provided, use "mix" mode and let LLM auto-select
  const modes =
    config.modes && config.modes.length > 0
      ? config.modes
      : ["mix" as LightRAGMode];
  const autoSelectMode = !config.modes || config.modes.length === 0;

  if (autoSelectMode) {
    console.log(`   Mode: Auto-select (using "mix")`);
  } else {
    console.log(`   Modes: ${modes.join(", ")}`);
  }

  console.log(`   Iterations: ${config.iterations}\n`);

  // Warmup
  await runWarmup(config, queryFn);

  // Generate parameter combinations
  const paramCombinations = generateParameterCombinations(config);
  const autoSelectParams =
    paramCombinations.length === 1 &&
    Object.keys(paramCombinations[0]).length === 0;

  if (autoSelectParams) {
    console.log(
      `📊 Parameters: Auto-select (letting LLM choose optimal settings)\n`
    );
  } else {
    console.log(
      `📊 Testing ${paramCombinations.length} parameter combinations\n`
    );
  }

  // Run all benchmarks
  const queryResults: QueryBenchmarkResult[] = [];
  let completed = 0;
  const total = config.queries.length * modes.length * paramCombinations.length;

  for (const query of config.queries) {
    for (const mode of modes) {
      for (const params of paramCombinations) {
        const paramStr = autoSelectParams
          ? "auto-select"
          : `top_k=${params.top_k ?? "auto"}, chunk_top_k=${
              params.chunk_top_k ?? "auto"
            }`;

        console.log(
          `[${++completed}/${total}] Running: ${
            query.id
          } (${mode}) - ${paramStr}`
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
