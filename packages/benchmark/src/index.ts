/**
 * eBee Benchmark Framework
 * Functional programming approach for performance testing
 */

// Types
export * from "./types/index.js";

// Utilities
export * from "./utils/statistics.js";
export * from "./utils/metrics.js";
export * from "./utils/export.js";
export * from "./utils/accuracy-metrics.js";

// Runners
export * from "./runners/query-benchmark.js";
export * from "./runners/accuracy-benchmark.js";
export * from "./runners/comparison-benchmark.js";
export * from "./runners/agent-benchmark.js";

// Re-export main functions for convenience
export { runQueryBenchmarks } from "./runners/query-benchmark.js";
export { runAccuracyBenchmark } from "./runners/accuracy-benchmark.js";
export { runComparisonBenchmark } from "./runners/comparison-benchmark.js";
export { runAgentBenchmark } from "./runners/agent-benchmark.js";
export { exportResults } from "./utils/export.js";
