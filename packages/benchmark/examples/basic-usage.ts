/**
 * Basic Usage Example
 * Demonstrates how to use the benchmark framework
 */

import {
  runQueryBenchmarks,
  exportResults,
  findBestMode,
} from "../src/index.js";
import type {
  QueryBenchmarkConfig,
  LightRAGQuery,
  LightRAGResponse,
} from "../src/index.js";

// ============================================
// Mock Query Function (for demonstration)
// ============================================

/**
 * Mock implementation of lightragQuery for testing
 * In real usage, import from @ebee-oss/server
 */
const mockLightragQuery = async (
  query: LightRAGQuery
): Promise<LightRAGResponse> => {
  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 50));

  return {
    query: query.query,
    mode: query.mode || "mix",
    processing_time_ms: Math.random() * 100 + 50,
    chunks: [
      {
        id: "chunk_1",
        document_id: "doc_1",
        title: "Example Document",
        source: "notion",
        source_id: "notion_123",
        snippet: "This is an example snippet...",
        score: Math.random() * 0.3 + 0.7,
        type: "page",
        people: ["John Doe"],
      },
      {
        id: "chunk_2",
        document_id: "doc_2",
        title: "Another Document",
        source: "slack",
        source_id: "slack_456",
        snippet: "Another example snippet...",
        score: Math.random() * 0.3 + 0.6,
        type: "message",
        people: ["Jane Smith"],
      },
    ],
    stats: {
      total_chunks: 2,
      unique_documents: 2,
      processing_time_ms: Math.random() * 100 + 50,
      retrieval_breakdown: {
        vector_matches: 10,
        graph_expanded: 5,
        reranked: query.enable_rerank !== false,
      },
    },
    metadata: {
      keywords_extracted: {
        high_level: ["authentication", "security"],
        low_level: ["user", "password", "token"],
      },
      filters_applied: false,
    },
  };
};

// ============================================
// Example 1: Basic Query Benchmark
// ============================================

async function example1_basicBenchmark() {
  console.log("\n=== Example 1: Basic Query Benchmark ===\n");

  const config: QueryBenchmarkConfig = {
    name: "Basic Performance Test",
    description: "Testing query performance with minimal configuration",
    type: "query",
    iterations: 5,
    warmupRuns: 1,
    outputDir: "./benchmark-results/basic",
    queries: [
      {
        id: "simple_query",
        query: "Who is working on authentication?",
        category: "entity_focused",
      },
    ],
    modes: ["mix"],
    parameters: {
      top_k: [60],
      chunk_top_k: [20],
      enable_rerank: [true],
    },
  };

  const results = await runQueryBenchmarks(config, mockLightragQuery);

  console.log("\n📊 Results:");
  console.log(
    `   Mean time: ${results.aggregated.overall.totalTime.mean.toFixed(2)}ms`
  );
  console.log(
    `   P95 time: ${results.aggregated.overall.totalTime.p95.toFixed(2)}ms`
  );
  console.log(
    `   Avg tokens: ${results.aggregated.overall.tokenUsage.mean.toFixed(0)}`
  );
  console.log(
    `   Avg score: ${results.aggregated.overall.resultsQuality.meanScore.toFixed(
      3
    )}`
  );

  exportResults(results, config.outputDir);
}

// ============================================
// Example 2: Compare All Modes
// ============================================

async function example2_compareAllModes() {
  console.log("\n=== Example 2: Compare All Modes ===\n");

  const config: QueryBenchmarkConfig = {
    name: "Mode Comparison",
    description: "Compare performance across all LightRAG modes",
    type: "query",
    iterations: 3,
    outputDir: "./benchmark-results/modes",
    queries: [
      {
        id: "test_query",
        query: "How does the payment system work?",
        category: "relationship",
      },
    ],
    modes: ["naive", "local", "global", "hybrid", "mix"],
    parameters: {},
  };

  const results = await runQueryBenchmarks(config, mockLightragQuery);

  console.log("\n📊 Results by Mode:");
  Object.entries(results.aggregated.byMode).forEach(([mode, stats]) => {
    console.log(`\n   ${mode.toUpperCase()}:`);
    console.log(`     Time: ${stats.totalTime.mean.toFixed(2)}ms`);
    console.log(`     Tokens: ${stats.tokenUsage.mean.toFixed(0)}`);
    console.log(`     Score: ${stats.resultsQuality.meanScore.toFixed(3)}`);
  });

  // Find best mode
  const fastest = findBestMode(results, "speed");
  const bestQuality = findBestMode(results, "quality");
  const mostEfficient = findBestMode(results, "efficiency");

  console.log("\n🏆 Best Modes:");
  console.log(`   Fastest: ${fastest.mode} (${fastest.score.toFixed(2)}ms)`);
  console.log(
    `   Best Quality: ${bestQuality.mode} (${bestQuality.score.toFixed(3)})`
  );
  console.log(`   Most Efficient: ${mostEfficient.mode}`);

  exportResults(results, config.outputDir);
}

// ============================================
// Example 3: Parameter Optimization
// ============================================

async function example3_parameterOptimization() {
  console.log("\n=== Example 3: Parameter Optimization ===\n");

  const config: QueryBenchmarkConfig = {
    name: "Parameter Optimization",
    description: "Find optimal parameters for mix mode",
    type: "query",
    iterations: 3,
    outputDir: "./benchmark-results/params",
    queries: [
      {
        id: "optimization_query",
        query: "What are the latest updates?",
        category: "exploratory",
      },
    ],
    modes: ["mix"],
    parameters: {
      top_k: [20, 40, 60, 80],
      chunk_top_k: [10, 15, 20, 25],
      enable_rerank: [true, false],
      score_threshold: [0.5, 0.6, 0.7],
    },
  };

  const results = await runQueryBenchmarks(config, mockLightragQuery);

  console.log("\n📊 Testing parameter combinations...");
  console.log(`   Total combinations tested: ${results.queryResults.length}`);

  // Find best parameters
  const bestForSpeed = results.queryResults.reduce((best, current) =>
    current.statistics.totalTime.mean < best.statistics.totalTime.mean
      ? current
      : best
  );

  const bestForQuality = results.queryResults.reduce((best, current) =>
    current.statistics.resultsQuality.meanScore >
    best.statistics.resultsQuality.meanScore
      ? current
      : best
  );

  console.log("\n🎯 Optimal Parameters:");
  console.log("\n   For Speed:");
  console.log(`     top_k: ${bestForSpeed.params.top_k}`);
  console.log(`     chunk_top_k: ${bestForSpeed.params.chunk_top_k}`);
  console.log(`     enable_rerank: ${bestForSpeed.params.enable_rerank}`);
  console.log(
    `     Time: ${bestForSpeed.statistics.totalTime.mean.toFixed(2)}ms`
  );

  console.log("\n   For Quality:");
  console.log(`     top_k: ${bestForQuality.params.top_k}`);
  console.log(`     chunk_top_k: ${bestForQuality.params.chunk_top_k}`);
  console.log(`     enable_rerank: ${bestForQuality.params.enable_rerank}`);
  console.log(
    `     Score: ${bestForQuality.statistics.resultsQuality.meanScore.toFixed(
      3
    )}`
  );

  exportResults(results, config.outputDir);
}

// ============================================
// Example 4: Multiple Query Categories
// ============================================

async function example4_multipleCategories() {
  console.log("\n=== Example 4: Multiple Query Categories ===\n");

  const config: QueryBenchmarkConfig = {
    name: "Category Analysis",
    description: "Analyze performance across different query types",
    type: "query",
    iterations: 3,
    outputDir: "./benchmark-results/categories",
    queries: [
      {
        id: "entity_query",
        query: "Who is the project manager?",
        category: "entity_focused",
      },
      {
        id: "relationship_query",
        query: "How are the services connected?",
        category: "relationship",
      },
      {
        id: "temporal_query",
        query: "When was the last update?",
        category: "temporal",
      },
      {
        id: "aggregation_query",
        query: "How many issues are open?",
        category: "aggregation",
      },
    ],
    modes: ["mix"],
    parameters: {},
  };

  const results = await runQueryBenchmarks(config, mockLightragQuery);

  console.log("\n📊 Results by Category:");
  Object.entries(results.aggregated.byCategory).forEach(([category, stats]) => {
    console.log(`\n   ${category}:`);
    console.log(`     Time: ${stats.totalTime.mean.toFixed(2)}ms`);
    console.log(`     Quality: ${stats.resultsQuality.meanScore.toFixed(3)}`);
  });

  exportResults(results, config.outputDir);
}

// ============================================
// Run All Examples
// ============================================

async function runAllExamples() {
  try {
    await example1_basicBenchmark();
    await example2_compareAllModes();
    await example3_parameterOptimization();
    await example4_multipleCategories();

    console.log("\n✅ All examples completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Error running examples:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}
