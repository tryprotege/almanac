/**
 * Matrix Benchmark Runner
 * Tests Agent × MCP Setup combinations for comprehensive comparison
 */

import {
  executeSDKQuery,
  type SDKQueryResult,
  type SDKOptions,
} from "./sdk-runner.js";
import type {
  MatrixBenchmarkConfig,
  MatrixBenchmarkResults,
  MatrixResult,
  MatrixAgentResult,
  MatrixCellResult,
  MatrixAnalysis,
  AgentConfig,
} from "../types/index.js";

/**
 * Run a query with eBee MCP server
 */
async function runWithEbee(
  agent: AgentConfig,
  query: string,
  ebeeUrl: string,
  verbose: boolean = true
): Promise<SDKQueryResult> {
  const agentWithEbee: AgentConfig = {
    ...agent,
    mcpConfig: {
      ebee: {
        url: ebeeUrl,
      },
    },
  };

  return await executeSDKQuery(agentWithEbee, query, { verbose });
}

/**
 * Run a query with direct MCP servers
 */
async function runWithDirect(
  agent: AgentConfig,
  query: string,
  servers: readonly string[],
  packages: Record<string, string | { command: string; args?: string[] }>
): Promise<SDKQueryResult> {
  // Configure agent to use direct MCP servers
  const mcpConfig: Record<string, any> = {};

  for (const server of servers) {
    const packageConfig = packages[server];
    if (packageConfig) {
      // Check if it's a string (npm package) or object (local command)
      if (typeof packageConfig === "string") {
        // Use npx for npm packages
        mcpConfig[server] = {
          command: "npx",
          args: ["-y", packageConfig],
        };
      } else {
        // Use provided command/args for local packages
        mcpConfig[server] = packageConfig;
      }
    }
  }

  const agentWithDirect: AgentConfig = {
    ...agent,
    mcpConfig,
  };

  return await executeSDKQuery(agentWithDirect, query);
}

/**
 * Convert SDK result to matrix cell
 */
function toMatrixCell(result: SDKQueryResult): MatrixCellResult {
  return {
    time: result.executionTime,
    tokens: result.totalTokens,
    thinkingTokens: result.thinkingTokens,
    cost: result.cost || 0,
    quality: 0.85, // TODO: Implement quality scoring
  };
}

/**
 * Run matrix benchmark for all agent × MCP combinations
 */
export async function runMatrixBenchmark(
  config: MatrixBenchmarkConfig
): Promise<MatrixBenchmarkResults> {
  console.log(`\n⚖️  Starting Agent × MCP Matrix Benchmark`);
  console.log(`   Benchmark: ${config.name}`);
  console.log(`   Agents: ${config.agents.length}`);
  console.log(`   Scenarios: ${config.scenarios.length}`);
  console.log(`   Iterations: ${config.iterations}\n`);

  const matrix: Record<string, MatrixAgentResult> = {};

  // Test each agent
  for (const agent of config.agents) {
    console.log(`\n🤖 Testing Agent: ${agent.name} (${agent.model})\n`);

    const ebeeResults: MatrixCellResult[] = [];
    const directResults: MatrixCellResult[] = [];

    // Run each scenario
    for (const scenario of config.scenarios) {
      console.log(`📋 Scenario: ${scenario.id}`);
      console.log(`   Query: "${scenario.query}"`);
      console.log(`   Target Servers: ${scenario.targetServers.join(", ")}\n`);

      // Run iterations
      for (let i = 0; i < config.iterations; i++) {
        console.log(`   Iteration ${i + 1}/${config.iterations}:`);

        // Find eBee and Direct setups
        const ebeeSetup = config.mcpSetups.find((s) => s.name === "ebee");
        const directSetup = config.mcpSetups.find((s) => s.name === "direct");

        // Test with eBee (if configured)
        if (ebeeSetup?.url) {
          console.log(`     🐝 Running with eBee...`);
          const ebeeResult = await runWithEbee(
            agent,
            scenario.query,
            ebeeSetup.url
          );
          ebeeResults.push(toMatrixCell(ebeeResult));
          console.log(
            `        ✓ Completed in ${ebeeResult.executionTime}ms, ${ebeeResult.totalTokens} tokens`
          );
        } else {
          console.log(`     🐝 Skipping eBee (not configured)`);
        }

        // Test with Direct MCP (if configured)
        if (directSetup?.servers && directSetup?.packages) {
          console.log(`     🔗 Running with Direct MCP...`);
          const directResult = await runWithDirect(
            agent,
            scenario.query,
            directSetup.servers,
            directSetup.packages as Record<string, string>
          );
          directResults.push(toMatrixCell(directResult));
          console.log(
            `        ✓ Completed in ${directResult.executionTime}ms, ${directResult.totalTokens} tokens\n`
          );
        } else {
          console.log(`     🔗 Skipping Direct MCP (not configured)\n`);
        }
      }
    }

    // Average results across iterations
    const avgEbee = average(ebeeResults);
    const avgDirect = average(directResults);

    matrix[agent.name] = {
      ebee: avgEbee,
      direct: avgDirect,
    };

    // Show comparison for this agent
    const speedup = avgDirect.time / avgEbee.time;
    const tokenSavings =
      ((avgDirect.tokens - avgEbee.tokens) / avgDirect.tokens) * 100;

    console.log(`\n  📊 ${agent.name} Summary:`);
    console.log(`     eBee:   ${avgEbee.time}ms, ${avgEbee.tokens} tokens`);
    console.log(`     Direct: ${avgDirect.time}ms, ${avgDirect.tokens} tokens`);
    console.log(`     Speedup: ${speedup.toFixed(2)}x`);
    console.log(`     Token Savings: ${tokenSavings.toFixed(1)}%\n`);
  }

  // Analyze results
  const analysis = analyzeMatrix(matrix);

  // Display final matrix
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📊 Matrix Results Summary`);
  console.log(`${"=".repeat(70)}\n`);

  console.table(
    Object.entries(matrix).map(([agent, results]) => ({
      Agent: agent,
      "eBee Time": `${results.ebee.time}ms`,
      "eBee Tokens": results.ebee.tokens,
      "Direct Time": `${results.direct.time}ms`,
      "Direct Tokens": results.direct.tokens,
      Speedup: `${(results.direct.time / results.ebee.time).toFixed(2)}x`,
    }))
  );

  console.log(`\n${"=".repeat(70)}`);
  console.log(`🏆 Analysis`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Best Overall Combination: ${analysis.bestCombination}`);
  console.log(`Fastest with eBee: ${analysis.fastestWithEbee}`);
  console.log(`Fastest with Direct: ${analysis.fastestWithDirect}`);
  console.log(`Most Efficient: ${analysis.mostEfficient}`);
  console.log(`${"=".repeat(70)}\n`);

  return {
    config,
    matrix,
    analysis,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Average matrix cell results
 */
function average(cells: MatrixCellResult[]): MatrixCellResult {
  const sum = cells.reduce(
    (acc, cell) => ({
      time: acc.time + cell.time,
      tokens: acc.tokens + cell.tokens,
      cost: acc.cost + cell.cost,
      quality: acc.quality + cell.quality,
    }),
    { time: 0, tokens: 0, cost: 0, quality: 0 }
  );

  const count = cells.length;
  return {
    time: Math.round(sum.time / count),
    tokens: Math.round(sum.tokens / count),
    cost: sum.cost / count,
    quality: sum.quality / count,
  };
}

/**
 * Analyze matrix to find best combinations
 */
function analyzeMatrix(matrix: MatrixResult): MatrixAnalysis {
  const agents = Object.keys(matrix);

  // Find best overall combination (fastest + cheapest)
  let bestCombination = "";
  let bestScore = Infinity;

  // Find fastest with each setup
  let fastestWithEbee = "";
  let fastestEbeeTime = Infinity;
  let fastestWithDirect = "";
  let fastestDirectTime = Infinity;

  // Calculate metrics per agent
  const speedupByAgent: Record<string, number> = {};
  const tokenSavingsByAgent: Record<string, number> = {};
  const costSavingsByAgent: Record<string, number> = {};

  for (const agent of agents) {
    const results = matrix[agent];

    // Check eBee performance
    if (results.ebee.time < fastestEbeeTime) {
      fastestEbeeTime = results.ebee.time;
      fastestWithEbee = `${agent} + eBee`;
    }

    // Check Direct performance
    if (results.direct.time < fastestDirectTime) {
      fastestDirectTime = results.direct.time;
      fastestWithDirect = `${agent} + Direct`;
    }

    // Calculate best overall (using eBee time + cost as score)
    const score = results.ebee.time + results.ebee.cost * 1000;
    if (score < bestScore) {
      bestScore = score;
      bestCombination = `${agent} + eBee`;
    }

    // Calculate per-agent metrics
    speedupByAgent[agent] = results.direct.time / results.ebee.time;
    tokenSavingsByAgent[agent] =
      ((results.direct.tokens - results.ebee.tokens) / results.direct.tokens) *
      100;
    costSavingsByAgent[agent] =
      ((results.direct.cost - results.ebee.cost) / results.direct.cost) * 100;
  }

  // Most efficient = best speedup
  const mostEfficientAgent = agents.reduce((best, agent) =>
    speedupByAgent[agent] > speedupByAgent[best] ? agent : best
  );

  return {
    bestCombination,
    fastestWithEbee,
    fastestWithDirect,
    mostEfficient: `${mostEfficientAgent} (${speedupByAgent[
      mostEfficientAgent
    ].toFixed(2)}x speedup)`,
    speedupByAgent,
    tokenSavingsByAgent,
    costSavingsByAgent,
  };
}
