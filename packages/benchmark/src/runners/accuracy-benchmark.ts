/**
 * Accuracy Benchmark Runner - Functional Approach
 * Evaluates retrieval accuracy against ground truth
 */

import type {
  QueryBenchmarkConfig,
  BenchmarkQuery,
  LightRAGQuery,
  LightRAGResponse,
  AccuracyMetrics,
} from "../types/index.js";
import {
  evaluateAccuracy,
  calculateMAP,
  calculateHitRate,
  calculateCoverage,
  formatAccuracyMetrics,
} from "../utils/accuracy-metrics.js";
import { measureTime } from "../utils/metrics.js";
import { mean, calculateStatistics } from "../utils/statistics.js";

// ============================================
// Types
// ============================================

export interface AccuracyBenchmarkResult {
  readonly query: BenchmarkQuery;
  readonly retrieved: readonly string[];
  readonly metrics: AccuracyMetrics;
  readonly responseTime: number;
}

export interface AccuracyBenchmarkResults {
  readonly config: QueryBenchmarkConfig;
  readonly results: readonly AccuracyBenchmarkResult[];
  readonly aggregated: {
    readonly precision: number;
    readonly recall: number;
    readonly f1: number;
    readonly mrr: number;
    readonly ndcg: number;
    readonly map: number;
    readonly hitRate: Record<number, number>; // Hit rate at different K values
    readonly coverage: Record<number, number>; // Coverage at different K values
  };
  readonly timestamp: string;
}

// ============================================
// Core Functions
// ============================================

/**
 * Extract document IDs from LightRAG response
 */
export const extractDocumentIds = (
  response: LightRAGResponse
): readonly string[] => {
  return response.chunks.map((chunk) => chunk.document_id);
};

/**
 * Run accuracy evaluation for a single query
 */
export const runAccuracyEvaluation = async (
  query: BenchmarkQuery,
  queryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>
): Promise<AccuracyBenchmarkResult> => {
  if (!query.groundTruth) {
    throw new Error(
      `Query ${query.id} missing ground truth data for accuracy evaluation`
    );
  }

  // Execute query
  const { result: response, duration } = await measureTime(() =>
    queryFn({
      query: query.query,
      mode: "mix", // Use best mode for accuracy
    })
  );

  // Extract retrieved document IDs
  const retrieved = extractDocumentIds(response);
  const relevant = query.groundTruth.relevantDocuments;

  // Evaluate accuracy
  const metrics: AccuracyMetrics = {
    ...evaluateAccuracy(retrieved, relevant),
    queryId: query.id,
  };

  return {
    query,
    retrieved,
    metrics,
    responseTime: duration,
  };
};

/**
 * Run accuracy benchmark for all queries
 */
export const runAccuracyBenchmark = async (
  config: QueryBenchmarkConfig,
  queryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>
): Promise<AccuracyBenchmarkResults> => {
  console.log(`🎯 Starting accuracy benchmark: ${config.name}`);
  console.log(`   Queries: ${config.queries.length}\n`);

  // Filter queries that have ground truth
  const queriesWithGroundTruth = config.queries.filter((q) => q.groundTruth);

  if (queriesWithGroundTruth.length === 0) {
    throw new Error(
      "No queries with ground truth found. Add groundTruth data to queries in config."
    );
  }

  console.log(
    `   Evaluating ${queriesWithGroundTruth.length} queries with ground truth\n`
  );

  // Run evaluations
  const results: AccuracyBenchmarkResult[] = [];

  for (const query of queriesWithGroundTruth) {
    console.log(`Evaluating: ${query.id}`);

    try {
      const result = await runAccuracyEvaluation(query, queryFn);
      results.push(result);

      console.log(
        `   Precision: ${(result.metrics.precision * 100).toFixed(1)}%`
      );
      console.log(`   Recall:    ${(result.metrics.recall * 100).toFixed(1)}%`);
      console.log(`   F1:        ${result.metrics.f1.toFixed(3)}\n`);
    } catch (error) {
      console.error(`   Error: ${error}\n`);
    }
  }

  // Calculate aggregated metrics
  const aggregated = aggregateAccuracyResults(results);

  console.log("✅ Accuracy benchmark complete!\n");
  console.log("Overall Results:");
  console.log(`   Precision: ${(aggregated.precision * 100).toFixed(1)}%`);
  console.log(`   Recall:    ${(aggregated.recall * 100).toFixed(1)}%`);
  console.log(`   F1:        ${aggregated.f1.toFixed(3)}`);
  console.log(`   NDCG:      ${aggregated.ndcg.toFixed(3)}`);
  console.log(`   MAP:       ${aggregated.map.toFixed(3)}\n`);

  return {
    config,
    results,
    aggregated,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Aggregate accuracy results across all queries
 */
export const aggregateAccuracyResults = (
  results: readonly AccuracyBenchmarkResult[]
): AccuracyBenchmarkResults["aggregated"] => {
  if (results.length === 0) {
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      mrr: 0,
      ndcg: 0,
      map: 0,
      hitRate: {},
      coverage: {},
    };
  }

  // Calculate mean metrics
  const precision = mean(results.map((r) => r.metrics.precision));
  const recall = mean(results.map((r) => r.metrics.recall));
  const f1 = mean(results.map((r) => r.metrics.f1));
  const mrr = mean(results.map((r) => r.metrics.mrr));
  const ndcg = mean(results.map((r) => r.metrics.ndcg));

  // Calculate MAP
  const queries = results.map((r) => ({
    retrieved: r.retrieved,
    relevant: r.query.groundTruth!.relevantDocuments,
  }));

  const map = calculateMAP(queries);

  // Calculate hit rate and coverage at different K values
  const kValues = [1, 3, 5, 10, 20];
  const hitRate: Record<number, number> = {};
  const coverage: Record<number, number> = {};

  for (const k of kValues) {
    hitRate[k] = calculateHitRate(queries, k);
    coverage[k] = calculateCoverage(queries, k);
  }

  return {
    precision,
    recall,
    f1,
    mrr,
    ndcg,
    map,
    hitRate,
    coverage,
  };
};

/**
 * Generate accuracy report
 */
export const generateAccuracyReport = (
  results: AccuracyBenchmarkResults
): string => {
  const lines: string[] = [];

  lines.push("=".repeat(60));
  lines.push(`ACCURACY BENCHMARK RESULTS`);
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`Benchmark: ${results.config.name}`);
  lines.push(`Timestamp: ${results.timestamp}`);
  lines.push(`Queries Evaluated: ${results.results.length}`);
  lines.push("");

  lines.push("Overall Metrics:");
  lines.push("-".repeat(60));
  lines.push(
    `Precision:  ${(results.aggregated.precision * 100).toFixed(
      1
    )}% (${results.aggregated.precision.toFixed(3)})`
  );
  lines.push(
    `Recall:     ${(results.aggregated.recall * 100).toFixed(
      1
    )}% (${results.aggregated.recall.toFixed(3)})`
  );
  lines.push(`F1 Score:   ${results.aggregated.f1.toFixed(3)}`);
  lines.push(`MRR:        ${results.aggregated.mrr.toFixed(3)}`);
  lines.push(`NDCG:       ${results.aggregated.ndcg.toFixed(3)}`);
  lines.push(`MAP:        ${results.aggregated.map.toFixed(3)}`);
  lines.push("");

  lines.push("Hit Rate @ K:");
  lines.push("-".repeat(60));
  Object.entries(results.aggregated.hitRate).forEach(([k, rate]) => {
    lines.push(`  @${k.padStart(2)}:  ${(rate * 100).toFixed(1)}%`);
  });
  lines.push("");

  lines.push("Coverage @ K:");
  lines.push("-".repeat(60));
  Object.entries(results.aggregated.coverage).forEach(([k, coverage]) => {
    lines.push(`  @${k.padStart(2)}:  ${(coverage * 100).toFixed(1)}%`);
  });
  lines.push("");

  lines.push("Per-Query Results:");
  lines.push("-".repeat(60));

  results.results.forEach((result) => {
    lines.push(`\n${result.query.id}:`);
    lines.push(`  Query:     "${result.query.query}"`);
    lines.push(`  Category:  ${result.query.category}`);
    lines.push(`  Precision: ${(result.metrics.precision * 100).toFixed(1)}%`);
    lines.push(`  Recall:    ${(result.metrics.recall * 100).toFixed(1)}%`);
    lines.push(`  F1:        ${result.metrics.f1.toFixed(3)}`);
    lines.push(`  NDCG:      ${result.metrics.ndcg.toFixed(3)}`);
    lines.push(`  Retrieved: ${result.retrieved.length} documents`);
    lines.push(
      `  Relevant:  ${
        result.query.groundTruth!.relevantDocuments.length
      } documents`
    );
    lines.push(`  Time:      ${result.responseTime}ms`);
  });

  lines.push("");
  lines.push("=".repeat(60));

  return lines.join("\n");
};

/**
 * Export accuracy results to JSON
 */
export const exportAccuracyResults = (
  results: AccuracyBenchmarkResults,
  filepath: string
): void => {
  // Implementation would use fs.writeFileSync
  console.log(`Exporting accuracy results to ${filepath}`);
};
