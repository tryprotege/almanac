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
export * from "./utils/matrix-export.js";

// Runners
export * from "./runners/query-benchmark.js";
export * from "./runners/matrix-benchmark.js";
export * from "./runners/cli-runner.js";

// Re-export main functions for convenience
export { runQueryBenchmarks } from "./runners/query-benchmark.js";
export { runMatrixBenchmark } from "./runners/matrix-benchmark.js";
export { exportResults } from "./utils/export.js";
export { exportMatrixResults } from "./utils/matrix-export.js";
export {
  executeCLIQuery,
  validateCLIAgent,
  checkCLIAvailable,
  getCLIVersion,
} from "./runners/cli-runner.js";
