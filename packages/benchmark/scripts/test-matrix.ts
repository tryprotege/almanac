#!/usr/bin/env tsx
/**
 * Test Script: Agent × MCP Matrix Benchmark
 * Compares different agents with eBee vs Direct MCP setups
 */

import "../src/env.js"; // Validate environment variables
import { runMatrixBenchmark } from "../src/runners/matrix-benchmark.js";
import { matrixBenchmarkConfig } from "../src/configs/matrix-benchmark.config.js";
import { exportMatrixResults } from "../src/utils/matrix-export.js";

async function main() {
  console.log("⚖️  Starting Agent × MCP Matrix Benchmark\n");
  console.log("Prerequisites:");
  console.log(
    "  ✓ eBee server should be running (pnpm dev in packages/server)"
  );
  console.log("  ✓ API keys should be configured in .env");
  console.log("  ✓ CLI tools (amp, claude) should be installed\n");
  console.log("=".repeat(70));
  console.log("");

  try {
    const results = await runMatrixBenchmark(matrixBenchmarkConfig);

    // Export results to CSV
    await exportMatrixResults(results, matrixBenchmarkConfig.outputDir);

    console.log("\n✅ Benchmark completed successfully!\n");

    console.log("Key Findings:");
    console.log(`  🏆 Best Combination: ${results.analysis.bestCombination}`);
    console.log(`  ⚡ Fastest with eBee: ${results.analysis.fastestWithEbee}`);
    console.log(
      `  🔗 Fastest with Direct: ${results.analysis.fastestWithDirect}`
    );
    console.log(`  💡 Most Efficient: ${results.analysis.mostEfficient}\n`);

    console.log("Next Steps:");
    console.log(`  - Review CSV files in: ${matrixBenchmarkConfig.outputDir}`);
    console.log("  - Analyze speedup and cost savings per agent");
    console.log("  - Use findings to optimize agent selection\n");
  } catch (error) {
    console.error("\n❌ Benchmark failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
