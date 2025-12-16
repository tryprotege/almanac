#!/usr/bin/env node
/**
 * Benchmark CLI - Simplified entry point
 *
 * This CLI is now simplified. Benchmarks should be run programmatically
 * using TypeScript configuration files.
 */

console.log(`
🐝 eBee Benchmark Framework

This package provides benchmarking utilities for comparing eBee server
performance against direct MCP server access.

Usage:
  Import and run benchmarks programmatically from your TypeScript code.

Example:
  import { runComparisonBenchmark } from '@ebee-oss/benchmark';
  import { comparisonConfig } from './configs/comparison.config.js';
  import { lightragQuery } from '@ebee-oss/server';
  
  const results = await runComparisonBenchmark(
    comparisonConfig,
    lightragQuery,
    directQueryFn
  );

See the README.md and example configs in src/configs/ for more details.
`);
