/**
 * Example: Running Accuracy Benchmark
 *
 * This example demonstrates how to run accuracy evaluations
 * to measure retrieval quality against ground truth data.
 */

import {
  runAccuracyBenchmark,
  generateAccuracyReport,
} from "@ebee-oss/benchmark";
import { lightragQuery } from "@ebee-oss/server";
import type { QueryBenchmarkConfig } from "@ebee-oss/benchmark";

// Define benchmark configuration
const config: QueryBenchmarkConfig = {
  name: "Accuracy Evaluation Example",
  description: "Testing retrieval accuracy against ground truth",
  type: "query",
  iterations: 10,
  warmupRuns: 2,
  outputDir: "./benchmark-results/accuracy",
  queries: [
    {
      id: "entity_query",
      query: "Who is working on authentication?",
      category: "entity_focused",
      expectedEntities: ["john", "auth_team"],
      groundTruth: {
        relevantDocuments: ["doc_123", "doc_456", "doc_789"],
        requiredEntities: ["john", "auth_team"],
        minRelevanceScore: 0.7,
      },
    },
    {
      id: "relationship_query",
      query: "How does the payment system integrate with Stripe?",
      category: "relationship",
      groundTruth: {
        relevantDocuments: ["doc_234", "doc_567"],
        minRelevanceScore: 0.65,
      },
    },
  ],
  modes: ["mix"],
  parameters: {
    top_k: [60],
    chunk_top_k: [20],
    enable_rerank: [true],
    score_threshold: [0.6],
  },
};

// Run accuracy benchmark
async function runExample() {
  console.log("🎯 Running Accuracy Benchmark Example\n");

  try {
    // Run benchmark
    const results = await runAccuracyBenchmark(config, lightragQuery);

    // Generate report
    const report = generateAccuracyReport(results);
    console.log("\n" + report);

    // Access specific metrics
    console.log("\n📊 Summary Metrics:");
    console.log(
      `Precision: ${(results.aggregated.precision * 100).toFixed(1)}%`
    );
    console.log(`Recall: ${(results.aggregated.recall * 100).toFixed(1)}%`);
    console.log(`F1 Score: ${results.aggregated.f1.toFixed(3)}`);
    console.log(`NDCG: ${results.aggregated.ndcg.toFixed(3)}`);
    console.log(`MAP: ${results.aggregated.map.toFixed(3)}`);

    // Hit rate at different K values
    console.log("\n🎯 Hit Rate:");
    Object.entries(results.aggregated.hitRate).forEach(([k, rate]) => {
      console.log(`  @${k}: ${(rate * 100).toFixed(1)}%`);
    });

    // Per-query analysis
    console.log("\n📝 Per-Query Results:");
    results.results.forEach((result) => {
      console.log(`\n${result.query.id}:`);
      console.log(
        `  Precision: ${(result.metrics.precision * 100).toFixed(1)}%`
      );
      console.log(`  Recall: ${(result.metrics.recall * 100).toFixed(1)}%`);
      console.log(`  F1: ${result.metrics.f1.toFixed(3)}`);
    });

    return results;
  } catch (error) {
    console.error("Error running accuracy benchmark:", error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  runExample()
    .then(() => console.log("\n✅ Example completed successfully"))
    .catch((error) => console.error("\n❌ Example failed:", error));
}

export { runExample };
