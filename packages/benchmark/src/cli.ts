#!/usr/bin/env node
/**
 * Benchmark CLI - Entry point for running benchmarks
 */

import { readFileSync } from "fs";
import { parse } from "yaml";
import type { BenchmarkConfig } from "./types/index.js";
import { runQueryBenchmarks } from "./runners/query-benchmark.js";
import { exportResults } from "./utils/export.js";

/**
 * Load benchmark configuration from YAML file
 */
const loadConfig = (filepath: string): BenchmarkConfig => {
  const content = readFileSync(filepath, "utf-8");
  return parse(content) as BenchmarkConfig;
};

/**
 * Main CLI function
 */
const main = async () => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: benchmark <config-file.yaml>

Examples:
  benchmark benchmarks/query-performance.yaml
  benchmark benchmarks/agent-comparison.yaml
  benchmark benchmarks/ebee-vs-direct.yaml

Available benchmark types:
  - query: Query performance testing
  - agent: AI agent comparison
  - comparison: eBee vs direct source comparison
    `);
    process.exit(1);
  }

  const configPath = args[0];
  console.log(`📋 Loading config: ${configPath}\n`);

  try {
    const config = loadConfig(configPath);

    // Run appropriate benchmark based on type
    switch (config.type) {
      case "query": {
        // For now, we'll need to pass the actual query function
        // In real usage, this would connect to the eBee server
        console.log("⚠️  Query benchmarks require server connection");
        console.log("   Please use the programmatic API for now\n");
        console.log("Example:");
        console.log(
          '  import { runQueryBenchmarks } from "@ebee-oss/benchmark";'
        );
        console.log('  import { lightragQuery } from "@ebee-oss/server";');
        console.log("  ");
        console.log(
          "  const results = await runQueryBenchmarks(config, lightragQuery);"
        );
        break;
      }

      case "agent": {
        console.log("⚠️  Agent benchmarks not yet implemented");
        console.log("   Coming soon!");
        break;
      }

      case "comparison": {
        console.log("⚠️  Comparison benchmarks not yet implemented");
        console.log("   Coming soon!");
        break;
      }

      default:
        console.error(`❌ Unknown benchmark type: ${(config as any).type}`);
        process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error running benchmark:", error);
    process.exit(1);
  }
};

main();
