/**
 * Agent Comparison Benchmark Runner
 * Compare different AI agents using eBee
 */

import type {
  AgentBenchmarkConfig,
  AgentBenchmarkResult,
  AgentBenchmarkResults,
  AgentConfig,
  BenchmarkQuery,
  AgentMetrics,
  MCPCall,
  QualityScores,
} from "../types/index.js";
import { measureTime } from "../utils/metrics.js";
import { mean, calculateStatistics } from "../utils/statistics.js";

// ============================================
// Types
// ============================================

export interface AgentQueryResult {
  readonly agent: AgentConfig;
  readonly query: BenchmarkQuery;
  readonly input: string;
  readonly output: string;
  readonly mcpCalls: readonly MCPCall[];
  readonly duration: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

// ============================================
// Core Functions
// ============================================

/**
 * Execute agent query
 * This is a simplified implementation that would need to be integrated
 * with actual agent APIs (Claude, ChatGPT, etc.)
 */
export const executeAgentQuery = async (
  agent: AgentConfig,
  query: BenchmarkQuery,
  agentQueryFn: (
    agent: AgentConfig,
    query: string
  ) => Promise<{
    response: string;
    mcpCalls: MCPCall[];
    inputTokens: number;
    outputTokens: number;
  }>
): Promise<AgentQueryResult> => {
  const { result, duration } = await measureTime(() =>
    agentQueryFn(agent, query.query)
  );

  return {
    agent,
    query,
    input: query.query,
    output: result.response,
    mcpCalls: result.mcpCalls,
    duration,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    totalTokens: result.inputTokens + result.outputTokens,
  };
};

/**
 * Evaluate agent response quality
 * Uses LLM-as-Judge approach for evaluation
 */
export const evaluateAgentQuality = async (
  query: BenchmarkQuery,
  response: string,
  judgeModel: string = "claude-3-5-sonnet-20241022",
  evaluateFn?: (
    query: string,
    response: string,
    criteria: string[]
  ) => Promise<QualityScores>
): Promise<QualityScores> => {
  // If custom evaluate function provided, use it
  if (evaluateFn) {
    return evaluateFn(query.query, response, [
      "relevance",
      "completeness",
      "accuracy",
      "coherence",
    ]);
  }

  // Default: Simple heuristic-based evaluation
  // In production, this would use an LLM judge
  const relevance = response.toLowerCase().includes(query.query.toLowerCase())
    ? 0.8
    : 0.5;
  const completeness = response.length > 100 ? 0.8 : 0.5;
  const accuracy = 0.75; // Would need ground truth
  const coherence = 0.8; // Would need NLP analysis
  const overall = (relevance + completeness + accuracy + coherence) / 4;

  return {
    relevance,
    completeness,
    accuracy,
    coherence,
    overall,
  };
};

/**
 * Convert agent result to metrics
 */
export const convertToAgentMetrics = async (
  result: AgentQueryResult,
  qualityScores: QualityScores
): Promise<AgentMetrics> => {
  return {
    agentName: result.agent.name,
    queryId: result.query.id,
    input: {
      query: result.input,
      timestamp: new Date().toISOString(),
      tokensUsed: result.inputTokens,
    },
    output: {
      response: result.output,
      timestamp: new Date().toISOString(),
      tokensUsed: result.outputTokens,
      responseTime: result.duration,
    },
    mcpCalls: result.mcpCalls,
    scores: qualityScores,
  };
};

/**
 * Run agent benchmark for single query
 */
export const runAgentQuery = async (
  agent: AgentConfig,
  query: BenchmarkQuery,
  iterations: number,
  agentQueryFn: (
    agent: AgentConfig,
    query: string
  ) => Promise<{
    response: string;
    mcpCalls: MCPCall[];
    inputTokens: number;
    outputTokens: number;
  }>,
  evaluateFn?: (
    query: string,
    response: string,
    criteria: string[]
  ) => Promise<QualityScores>
): Promise<AgentBenchmarkResult> => {
  const runs: AgentMetrics[] = [];

  for (let i = 0; i < iterations; i++) {
    try {
      // Execute query
      const result = await executeAgentQuery(agent, query, agentQueryFn);

      // Evaluate quality
      const scores = await evaluateAgentQuality(
        query,
        result.output,
        agent.model,
        evaluateFn
      );

      // Convert to metrics
      const metrics = await convertToAgentMetrics(result, scores);
      runs.push(metrics);
    } catch (error) {
      console.error(`  Iteration ${i} failed:`, error);
    }
  }

  // Calculate statistics
  const statistics = {
    responseTime: calculateStatistics(runs.map((r) => r.output.responseTime)),
    tokenUsage: calculateStatistics(
      runs.map((r) => r.input.tokensUsed + r.output.tokensUsed)
    ),
    qualityScores: {
      relevance: calculateStatistics(runs.map((r) => r.scores.relevance)),
      completeness: calculateStatistics(runs.map((r) => r.scores.completeness)),
      accuracy: calculateStatistics(runs.map((r) => r.scores.accuracy)),
      overall: calculateStatistics(runs.map((r) => r.scores.overall)),
    },
  };

  return {
    agent,
    query,
    runs,
    statistics,
  };
};

/**
 * Run full agent benchmark
 */
export const runAgentBenchmark = async (
  config: AgentBenchmarkConfig,
  agentQueryFn: (
    agent: AgentConfig,
    query: string
  ) => Promise<{
    response: string;
    mcpCalls: MCPCall[];
    inputTokens: number;
    outputTokens: number;
  }>,
  evaluateFn?: (
    query: string,
    response: string,
    criteria: string[]
  ) => Promise<QualityScores>
): Promise<AgentBenchmarkResults> => {
  console.log(`🤖 Starting agent benchmark: ${config.name}`);
  console.log(`   Agents: ${config.agents.length}`);
  console.log(`   Queries: ${config.queries.length}`);
  console.log(`   Iterations: ${config.iterations}\n`);

  const agentResults: AgentBenchmarkResult[] = [];

  // Run benchmarks for each agent
  for (const agent of config.agents) {
    console.log(`\n📊 Testing Agent: ${agent.name} (${agent.model})`);

    for (const query of config.queries) {
      console.log(`  Query: ${query.id}`);

      const result = await runAgentQuery(
        agent,
        query,
        config.iterations,
        agentQueryFn,
        evaluateFn
      );

      agentResults.push(result);

      console.log(
        `    ⏱️  ${result.statistics.responseTime.mean.toFixed(0)}ms avg`
      );
      console.log(
        `    🎯 ${result.statistics.qualityScores.overall.mean.toFixed(
          3
        )} quality`
      );
    }
  }

  // Calculate comparison metrics
  const comparison = calculateAgentComparison(agentResults);

  console.log("\n✅ Agent benchmark complete!\n");
  console.log("Rankings:");
  comparison.ranking.forEach((r, i) => {
    console.log(
      `  ${i + 1}. ${r.agent} - Score: ${r.overallScore.toFixed(3)}, ` +
        `Time: ${r.avgResponseTime.toFixed(0)}ms, ` +
        `Tokens: ${r.avgTokenUsage.toFixed(0)}`
    );
  });

  return {
    config,
    agentResults,
    comparison,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Calculate agent comparison metrics
 */
export const calculateAgentComparison = (
  results: readonly AgentBenchmarkResult[]
): AgentBenchmarkResults["comparison"] => {
  // Group results by agent
  const byAgent = results.reduce((acc, result) => {
    const agentName = result.agent.name;
    if (!acc[agentName]) {
      acc[agentName] = [];
    }
    acc[agentName].push(result);
    return acc;
  }, {} as Record<string, AgentBenchmarkResult[]>);

  // Calculate metrics for each agent
  const ranking = Object.entries(byAgent).map(([agentName, agentResults]) => {
    const avgResponseTime = mean(
      agentResults.map((r) => r.statistics.responseTime.mean)
    );
    const avgTokenUsage = mean(
      agentResults.map((r) => r.statistics.tokenUsage.mean)
    );
    const avgQuality = mean(
      agentResults.map((r) => r.statistics.qualityScores.overall.mean)
    );

    // Calculate overall score (normalized combination of quality, speed, efficiency)
    // Quality: 50%, Speed: 30%, Efficiency: 20%
    const normalizedSpeed = 1000 / avgResponseTime; // Higher is better
    const normalizedEfficiency = 1000 / avgTokenUsage; // Higher is better

    const overallScore =
      avgQuality * 0.5 +
      normalizedSpeed * 0.0003 +
      normalizedEfficiency * 0.0002;

    return {
      agent: agentName,
      overallScore,
      avgResponseTime,
      avgTokenUsage,
    };
  });

  // Sort by overall score
  ranking.sort((a, b) => b.overallScore - a.overallScore);

  // Find best for each category
  const bestForSpeed = ranking.reduce((best, curr) =>
    curr.avgResponseTime < best.avgResponseTime ? curr : best
  ).agent;

  const bestForQuality = Object.entries(byAgent).reduce(
    (best, [name, results]) => {
      const avgQuality = mean(
        results.map((r) => r.statistics.qualityScores.overall.mean)
      );
      return avgQuality > best.quality ? { name, quality: avgQuality } : best;
    },
    { name: "", quality: 0 }
  ).name;

  const bestForEfficiency = ranking.reduce((best, curr) =>
    curr.avgTokenUsage < best.avgTokenUsage ? curr : best
  ).agent;

  return {
    ranking,
    bestForSpeed,
    bestForQuality,
    bestForEfficiency,
  };
};

/**
 * Generate agent benchmark report
 */
export const generateAgentReport = (results: AgentBenchmarkResults): string => {
  const lines: string[] = [];

  lines.push("=".repeat(70));
  lines.push("AGENT COMPARISON BENCHMARK");
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`Benchmark: ${results.config.name}`);
  lines.push(`Timestamp: ${results.timestamp}`);
  lines.push(`Agents Tested: ${results.config.agents.length}`);
  lines.push(`Queries: ${results.config.queries.length}`);
  lines.push(`Iterations per Query: ${results.config.iterations}`);
  lines.push("");

  lines.push("Rankings:");
  lines.push("-".repeat(70));
  results.comparison.ranking.forEach((r, i) => {
    lines.push(
      `${i + 1}. ${r.agent.padEnd(15)} Score: ${r.overallScore.toFixed(3)}  ` +
        `Time: ${r.avgResponseTime.toFixed(0)}ms  ` +
        `Tokens: ${r.avgTokenUsage.toFixed(0)}`
    );
  });
  lines.push("");

  lines.push("Best Performers:");
  lines.push("-".repeat(70));
  lines.push(`Speed:      ${results.comparison.bestForSpeed}`);
  lines.push(`Quality:    ${results.comparison.bestForQuality}`);
  lines.push(`Efficiency: ${results.comparison.bestForEfficiency}`);
  lines.push("");

  lines.push("Detailed Results:");
  lines.push("-".repeat(70));

  // Group by agent
  const byAgent = results.agentResults.reduce((acc, result) => {
    const agentName = result.agent.name;
    if (!acc[agentName]) {
      acc[agentName] = [];
    }
    acc[agentName].push(result);
    return acc;
  }, {} as Record<string, AgentBenchmarkResult[]>);

  Object.entries(byAgent).forEach(([agentName, agentResults]) => {
    lines.push(`\n${agentName}:`);

    agentResults.forEach((result) => {
      lines.push(`  ${result.query.id}:`);
      lines.push(
        `    Response Time: ${result.statistics.responseTime.mean.toFixed(
          0
        )}ms ` + `(±${result.statistics.responseTime.stdDev.toFixed(0)}ms)`
      );
      lines.push(
        `    Token Usage:   ${result.statistics.tokenUsage.mean.toFixed(0)} ` +
          `(±${result.statistics.tokenUsage.stdDev.toFixed(0)})`
      );
      lines.push(
        `    Quality:       ${result.statistics.qualityScores.overall.mean.toFixed(
          3
        )}`
      );
      lines.push(
        `      Relevance:     ${result.statistics.qualityScores.relevance.mean.toFixed(
          3
        )}`
      );
      lines.push(
        `      Completeness:  ${result.statistics.qualityScores.completeness.mean.toFixed(
          3
        )}`
      );
      lines.push(
        `      Accuracy:      ${result.statistics.qualityScores.accuracy.mean.toFixed(
          3
        )}`
      );
    });
  });

  lines.push("");
  lines.push("=".repeat(70));

  return lines.join("\n");
};
