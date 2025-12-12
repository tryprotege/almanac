/**
 * Comparison Benchmark Runner - eBee vs Direct MCP
 * Compares unified eBee search against direct MCP server queries
 */

import type {
  ComparisonBenchmarkConfig,
  ComparisonScenario,
  AgentConfig,
  ComparisonMetrics,
  ComparisonBenchmarkResults,
  LightRAGQuery,
  LightRAGResponse,
} from "../types/index.js";
import { measureTime } from "../utils/metrics.js";
import {
  calculateSpeedup,
  calculateTokenEfficiency,
  calculateQualityDelta,
} from "../utils/metrics.js";
import { mean } from "../utils/statistics.js";

// ============================================
// Types
// ============================================

export interface DirectQueryResult {
  readonly serverName: string;
  readonly query: string;
  readonly response: any;
  readonly duration: number;
  readonly tokensUsed: number;
}

export interface ComparisonResult {
  readonly scenario: ComparisonScenario;
  readonly agent: AgentConfig;
  readonly ebeeResult: {
    readonly response: LightRAGResponse;
    readonly duration: number;
    readonly tokensUsed: number;
    readonly mcpCalls: number;
    readonly resultQuality: number;
  };
  readonly directResult: {
    readonly responses: readonly DirectQueryResult[];
    readonly totalDuration: number;
    readonly totalTokens: number;
    readonly mcpCalls: number;
    readonly resultQuality: number;
  };
  readonly metrics: ComparisonMetrics;
}

// ============================================
// Core Functions
// ============================================

/**
 * Execute eBee unified search query
 */
export const runEbeeQuery = async (
  scenario: ComparisonScenario,
  queryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>
): Promise<ComparisonResult["ebeeResult"]> => {
  const { result: response, duration } = await measureTime(() =>
    queryFn({
      query: scenario.query,
      mode: "mix", // Use best mode
      top_k: 60,
      enable_rerank: true,
    })
  );

  // Estimate tokens used
  const tokensUsed =
    response.chunks.reduce(
      (sum, chunk) =>
        sum + Math.ceil((chunk.snippet.length + chunk.title.length) / 4),
      0
    ) + Math.ceil(scenario.query.length / 4);

  // Calculate result quality (average relevance score)
  const resultQuality =
    response.chunks.length > 0
      ? response.chunks.reduce((sum, chunk) => sum + chunk.score, 0) /
        response.chunks.length
      : 0;

  return {
    response,
    duration,
    tokensUsed,
    mcpCalls: 1, // Single unified call
    resultQuality,
  };
};

/**
 * Execute direct MCP server queries
 * Simulates querying each source server separately and aggregating results
 */
export const runDirectQueries = async (
  scenario: ComparisonScenario,
  directQueryFn: (
    server: string,
    query: string
  ) => Promise<{ response: any; duration: number; tokensUsed: number }>
): Promise<ComparisonResult["directResult"]> => {
  const responses: DirectQueryResult[] = [];
  let totalDuration = 0;
  let totalTokens = 0;

  // Query each source server
  for (const serverName of scenario.sourceServers) {
    const result = await directQueryFn(serverName, scenario.query);

    responses.push({
      serverName,
      query: scenario.query,
      response: result.response,
      duration: result.duration,
      tokensUsed: result.tokensUsed,
    });

    totalDuration += result.duration;
    totalTokens += result.tokensUsed;
  }

  // Calculate quality based on aggregated results
  // This is a simplified quality metric
  const resultQuality = responses.length > 0 ? 0.75 : 0; // Placeholder

  return {
    responses,
    totalDuration,
    totalTokens,
    mcpCalls: responses.length,
    resultQuality,
  };
};

/**
 * Compare eBee vs Direct results
 */
export const compareResults = (
  ebeeResult: ComparisonResult["ebeeResult"],
  directResult: ComparisonResult["directResult"],
  scenarioId: string,
  agentName: string
): ComparisonMetrics => {
  const speedup = calculateSpeedup(
    directResult.totalDuration,
    ebeeResult.duration
  );
  const tokenEfficiency = calculateTokenEfficiency(
    directResult.totalTokens,
    ebeeResult.tokensUsed
  );
  const qualityDelta = calculateQualityDelta(
    directResult.resultQuality,
    ebeeResult.resultQuality
  );

  return {
    scenarioId,
    agentName,
    ebeeQuery: {
      totalTime: ebeeResult.duration,
      mcpCalls: ebeeResult.mcpCalls,
      tokensUsed: ebeeResult.tokensUsed,
      resultQuality: ebeeResult.resultQuality,
    },
    directQuery: {
      totalTime: directResult.totalDuration,
      mcpCalls: directResult.mcpCalls,
      tokensUsed: directResult.totalTokens,
      resultQuality: directResult.resultQuality,
    },
    speedup,
    tokenEfficiency,
    qualityDelta,
  };
};

/**
 * Run single comparison scenario
 */
export const runComparisonScenario = async (
  scenario: ComparisonScenario,
  agent: AgentConfig,
  ebeeQueryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>,
  directQueryFn: (
    server: string,
    query: string
  ) => Promise<{ response: any; duration: number; tokensUsed: number }>
): Promise<ComparisonResult> => {
  console.log(`\nScenario: ${scenario.id}`);
  console.log(`Query: "${scenario.query}"`);
  console.log(`Sources: ${scenario.sourceServers.join(", ")}`);

  // Run eBee unified query
  console.log("\n  Running eBee unified search...");
  const ebeeResult = await runEbeeQuery(scenario, ebeeQueryFn);
  console.log(`    ✓ Completed in ${ebeeResult.duration}ms`);
  console.log(`    ✓ Tokens: ${ebeeResult.tokensUsed}`);
  console.log(`    ✓ Quality: ${ebeeResult.resultQuality.toFixed(3)}`);

  // Run direct MCP queries
  console.log("\n  Running direct MCP queries...");
  const directResult = await runDirectQueries(scenario, directQueryFn);
  console.log(`    ✓ Completed in ${directResult.totalDuration}ms`);
  console.log(`    ✓ Tokens: ${directResult.totalTokens}`);
  console.log(`    ✓ Calls: ${directResult.mcpCalls}`);

  // Compare results
  const metrics = compareResults(
    ebeeResult,
    directResult,
    scenario.id,
    agent.name
  );

  console.log("\n  Results:");
  console.log(`    Speedup: ${metrics.speedup.toFixed(2)}x`);
  console.log(`    Token Efficiency: ${metrics.tokenEfficiency.toFixed(1)}%`);
  console.log(
    `    Quality Delta: ${
      metrics.qualityDelta >= 0 ? "+" : ""
    }${metrics.qualityDelta.toFixed(3)}`
  );

  return {
    scenario,
    agent,
    ebeeResult,
    directResult,
    metrics,
  };
};

/**
 * Run full comparison benchmark
 */
export const runComparisonBenchmark = async (
  config: ComparisonBenchmarkConfig,
  ebeeQueryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>,
  directQueryFn: (
    server: string,
    query: string
  ) => Promise<{ response: any; duration: number; tokensUsed: number }>
): Promise<ComparisonBenchmarkResults> => {
  console.log(`⚖️  Starting comparison benchmark: ${config.name}`);
  console.log(`   Scenarios: ${config.scenarios.length}`);
  console.log(`   Agents: ${config.agents.length}\n`);

  const results: ComparisonResult[] = [];

  // Run each scenario for each agent
  for (const agent of config.agents) {
    console.log(`\n📊 Testing Agent: ${agent.name} (${agent.model})`);

    for (const scenario of config.scenarios) {
      try {
        const result = await runComparisonScenario(
          scenario,
          agent,
          ebeeQueryFn,
          directQueryFn
        );
        results.push(result);
      } catch (error) {
        console.error(`  ✗ Error in scenario ${scenario.id}:`, error);
      }
    }
  }

  // Calculate summary statistics
  const scenarios: ComparisonBenchmarkResults["scenarios"] = results.map(
    (r) => ({
      scenario: r.scenario,
      agent: r.agent,
      metrics: r.metrics,
      analysis: {
        speedupAchieved: r.metrics.speedup > 1,
        tokenSavings: r.metrics.tokenEfficiency,
        qualityMaintained: r.metrics.qualityDelta >= -0.05, // Within 5% tolerance
        recommendation:
          r.metrics.speedup > 1.5 && r.metrics.qualityDelta >= -0.05
            ? "Use eBee - Significant performance improvement with acceptable quality"
            : r.metrics.speedup > 1 && r.metrics.qualityDelta >= 0
            ? "Use eBee - Better performance and quality"
            : "Consider use case - Trade-offs exist",
      },
    })
  );

  const summary = {
    avgSpeedup: mean(results.map((r) => r.metrics.speedup)),
    avgTokenSavings: mean(results.map((r) => r.metrics.tokenEfficiency)),
    avgQualityDelta: mean(results.map((r) => r.metrics.qualityDelta)),
    scenariosWhereEbeeBetter: results.filter(
      (r) => r.metrics.speedup > 1 && r.metrics.qualityDelta >= -0.05
    ).length,
    totalScenarios: results.length,
  };

  console.log("\n✅ Comparison benchmark complete!\n");
  console.log("Summary:");
  console.log(`  Avg Speedup:       ${summary.avgSpeedup.toFixed(2)}x`);
  console.log(`  Avg Token Savings: ${summary.avgTokenSavings.toFixed(1)}%`);
  console.log(
    `  Avg Quality Delta: ${
      summary.avgQualityDelta >= 0 ? "+" : ""
    }${summary.avgQualityDelta.toFixed(3)}`
  );
  console.log(
    `  eBee Better:       ${summary.scenariosWhereEbeeBetter}/${summary.totalScenarios} scenarios\n`
  );

  return {
    config,
    scenarios,
    summary,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Generate comparison report
 */
export const generateComparisonReport = (
  results: ComparisonBenchmarkResults
): string => {
  const lines: string[] = [];

  lines.push("=".repeat(70));
  lines.push("EBEE VS DIRECT MCP COMPARISON BENCHMARK");
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`Benchmark: ${results.config.name}`);
  lines.push(`Timestamp: ${results.timestamp}`);
  lines.push(`Scenarios: ${results.scenarios.length}`);
  lines.push("");

  lines.push("Summary:");
  lines.push("-".repeat(70));
  lines.push(
    `Average Speedup:       ${results.summary.avgSpeedup.toFixed(2)}x`
  );
  lines.push(
    `Average Token Savings: ${results.summary.avgTokenSavings.toFixed(1)}%`
  );
  lines.push(
    `Average Quality Delta: ${
      results.summary.avgQualityDelta >= 0 ? "+" : ""
    }${results.summary.avgQualityDelta.toFixed(3)}`
  );
  lines.push(
    `eBee Better In:        ${results.summary.scenariosWhereEbeeBetter} / ${results.summary.totalScenarios} scenarios`
  );
  lines.push("");

  lines.push("Detailed Results:");
  lines.push("-".repeat(70));

  results.scenarios.forEach((scenario) => {
    lines.push(`\n${scenario.scenario.id}:`);
    lines.push(`  Query: "${scenario.scenario.query}"`);
    lines.push(`  Sources: ${scenario.scenario.sourceServers.join(", ")}`);
    lines.push("");

    lines.push("  eBee Unified Search:");
    lines.push(`    Time:    ${scenario.metrics.ebeeQuery.totalTime}ms`);
    lines.push(`    Calls:   ${scenario.metrics.ebeeQuery.mcpCalls}`);
    lines.push(`    Tokens:  ${scenario.metrics.ebeeQuery.tokensUsed}`);
    lines.push(
      `    Quality: ${scenario.metrics.ebeeQuery.resultQuality.toFixed(3)}`
    );
    lines.push("");

    lines.push("  Direct MCP Queries:");
    lines.push(`    Time:    ${scenario.metrics.directQuery.totalTime}ms`);
    lines.push(`    Calls:   ${scenario.metrics.directQuery.mcpCalls}`);
    lines.push(`    Tokens:  ${scenario.metrics.directQuery.tokensUsed}`);
    lines.push(
      `    Quality: ${scenario.metrics.directQuery.resultQuality.toFixed(3)}`
    );
    lines.push("");

    lines.push("  Comparison:");
    lines.push(
      `    Speedup:          ${scenario.metrics.speedup.toFixed(2)}x ${
        scenario.analysis.speedupAchieved ? "✓" : "✗"
      }`
    );
    lines.push(
      `    Token Efficiency: ${scenario.metrics.tokenEfficiency.toFixed(1)}%`
    );
    lines.push(
      `    Quality Delta:    ${
        scenario.metrics.qualityDelta >= 0 ? "+" : ""
      }${scenario.metrics.qualityDelta.toFixed(3)}`
    );
    lines.push("");

    lines.push(`  Recommendation: ${scenario.analysis.recommendation}`);
  });

  lines.push("");
  lines.push("=".repeat(70));

  return lines.join("\n");
};
