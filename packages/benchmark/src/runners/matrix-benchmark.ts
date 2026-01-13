/**
 * Matrix Benchmark Runner
 * Tests Agent × MCP Setup combinations for comprehensive comparison
 * Supports both generated queries (with evaluation) and hardcoded scenarios
 */

import { executeSDKQuery, type SDKQueryResult } from './sdk-runner.js';
import type {
  MatrixBenchmarkConfig,
  MatrixBenchmarkResults,
  MatrixResult,
  MatrixAgentResult,
  MatrixCellResult,
  MatrixAnalysis,
  MatrixScenario,
  DetailedQueryResult,
} from '../types/index.js';
import { loadScenarios } from '../utils/query-loader.js';
import { evaluateResponse, formatEvaluationResult } from '../utils/evaluation.js';
import plimit from 'p-limit';

/**
 * Convert SDK result to matrix cell
 * Optionally evaluates response against mustInclude criteria
 */
function toMatrixCell(result: SDKQueryResult, scenario?: MatrixScenario): MatrixCellResult {
  let evaluation = undefined;

  // Evaluate if scenario has evaluation criteria
  if (scenario?.evaluationCriteria?.mustInclude) {
    evaluation = evaluateResponse(result.response, scenario.evaluationCriteria.mustInclude);
  }

  return {
    time: result.executionTime,
    tokens: result.totalTokens,
    thinkingTokens: result.thinkingTokens,
    cost: result.cost || 0,
    quality: evaluation?.score || 0.85, // Use evaluation score if available
    evaluation,
  };
}

/**
 * Run matrix benchmark for all agent × MCP combinations
 */
export async function runMatrixBenchmark(
  config: MatrixBenchmarkConfig,
): Promise<MatrixBenchmarkResults> {
  console.log(`\n⚖️  Starting Agent × MCP Matrix Benchmark`);
  console.log(`   Benchmark: ${config.name}`);
  console.log(`   Agents: ${config.agents.length}`);

  // Load scenarios based on query source
  const scenarios = loadScenarios(config.queriesSource, config.scenarios);

  if (scenarios.length === 0) {
    throw new Error('No scenarios to test. Check your configuration.');
  }

  console.log(`   Scenarios: ${scenarios.length}`);
  console.log(`   Iterations: ${config.iterations}`);
  console.log(`   Query Source: ${config.queriesSource.type}\n`);

  const matrix: Record<string, MatrixAgentResult> = {};
  const detailedResults: DetailedQueryResult[] = [];
  const limit = plimit(5);

  // Test each agent
  await Promise.all(
    config.agents.map(async (agent) => {
      console.log(`\n🤖 Testing Agent: ${agent.name} (${agent.model})\n`);

      const ebeeResults: MatrixCellResult[] = [];
      const directResults: MatrixCellResult[] = [];

      await Promise.all(
        scenarios.map(
          async (scenario) =>
            // Run each scenario
            await limit(async () => {
              console.log(`📋 Scenario: ${scenario.id}`);
              console.log(`   Query: "${scenario.query}"`);
              if (scenario.evaluationCriteria) {
                console.log(
                  `   Evaluation: ${scenario.evaluationCriteria.mustInclude.length} required items`,
                );
              }
              console.log(`   Target Servers: ${scenario.targetServers.join(', ')}\n`);

              // Run iterations
              for (let i = 0; i < config.iterations; i++) {
                console.log(`   Iteration ${i + 1}/${config.iterations}:`);

                // Test with each MCP setup
                for (const setup of config.mcpSetups) {
                  // Stdio-based setup (direct or clone-mcp)
                  console.log(`     🔗 Running with ${setup.name}...`);

                  let result: SDKQueryResult;
                  let error: string | undefined;

                  try {
                    result = await executeSDKQuery(
                      {
                        ...agent,
                        mcpConfig: setup.packages,
                      },
                      scenario.query,
                      { verbose: config.verbose },
                    );
                  } catch (err) {
                    // Capture error but continue with other tests
                    error = err instanceof Error ? err.message : String(err);
                    console.error(`        ✗ Error: ${error}`);

                    // Create a minimal result for failed queries
                    result = {
                      response: '',
                      mcpCalls: [],
                      inputTokens: 0,
                      outputTokens: 0,
                      thinkingTokens: 0,
                      cacheCreationTokens: 0,
                      cacheReadTokens: 0,
                      totalTokens: 0,
                      executionTime: 0,
                      rawOutput: '',
                      cost: 0,
                      steps: [], // Empty steps for failed queries
                    };
                  }

                  const cell = toMatrixCell(result, scenario);
                  if (setup.name === 'ebee') {
                    ebeeResults.push(cell);
                  } else {
                    directResults.push(cell);
                  }

                  // Capture detailed result for CSV export
                  const detailedResult: DetailedQueryResult = {
                    queryId: scenario.id,
                    query: scenario.query,
                    category: scenario.category,
                    agentName: agent.name,
                    setupName: setup.name,
                    iteration: i + 1,
                    response: result.response,
                    evaluation: cell.evaluation,
                    executionTime: result.executionTime,
                    totalTokens: result.totalTokens,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    thinkingTokens: result.thinkingTokens,
                    cacheCreationTokens: result.cacheCreationTokens,
                    cacheReadTokens: result.cacheReadTokens,
                    cost: result.cost || 0,
                    timestamp: new Date().toISOString(),
                    targetServers: scenario.targetServers,
                    error,
                    steps: result.steps, // Include captured agent steps for debugging
                  };
                  detailedResults.push(detailedResult);

                  console.log(
                    `        ✓ Completed in ${result.executionTime}ms, ${result.totalTokens} tokens`,
                  );

                  // Show evaluation results if available
                  if (cell.evaluation) {
                    console.log(`        ${formatEvaluationResult(cell.evaluation)}`);
                  }
                }

                console.log(''); // Blank line between iterations
              }
            }),
        ),
      );

      // Average results across iterations
      const avgEbee = average(ebeeResults);
      const avgDirect = average(directResults);

      matrix[agent.name] = {
        ebee: avgEbee,
        direct: avgDirect,
      };

      // Show comparison for this agent
      const speedup = avgDirect.time / avgEbee.time;
      const tokenSavings = ((avgDirect.tokens - avgEbee.tokens) / avgDirect.tokens) * 100;

      console.log(`\n  📊 ${agent.name} Summary:`);
      console.log(`     eBee:   ${avgEbee.time}ms, ${avgEbee.tokens} tokens`);
      console.log(`     Direct: ${avgDirect.time}ms, ${avgDirect.tokens} tokens`);
      console.log(`     Speedup: ${speedup.toFixed(2)}x`);
      console.log(`     Token Savings: ${tokenSavings.toFixed(1)}%\n`);
    }),
  );

  // Analyze results
  const analysis = analyzeMatrix(matrix);

  // Display final matrix
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 Matrix Results Summary`);
  console.log(`${'='.repeat(70)}\n`);

  console.table(
    Object.entries(matrix).map(([agent, results]) => ({
      Agent: agent,
      'eBee Time': `${results.ebee.time}ms`,
      'eBee Tokens': results.ebee.tokens,
      'Direct Time': `${results.direct.time}ms`,
      'Direct Tokens': results.direct.tokens,
      Speedup: `${(results.direct.time / results.ebee.time).toFixed(2)}x`,
    })),
  );

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🏆 Analysis`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Best Overall Combination: ${analysis.bestCombination}`);
  console.log(`Fastest with eBee: ${analysis.fastestWithEbee}`);
  console.log(`Fastest with Direct: ${analysis.fastestWithDirect}`);
  console.log(`Most Efficient: ${analysis.mostEfficient}`);
  console.log(`${'='.repeat(70)}\n`);

  return {
    config,
    matrix,
    analysis,
    detailedResults,
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
    { time: 0, tokens: 0, cost: 0, quality: 0 },
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
  let bestCombination = '';
  let bestScore = Infinity;

  // Find fastest with each setup
  let fastestWithEbee = '';
  let fastestEbeeTime = Infinity;
  let fastestWithDirect = '';
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
      ((results.direct.tokens - results.ebee.tokens) / results.direct.tokens) * 100;
    costSavingsByAgent[agent] =
      ((results.direct.cost - results.ebee.cost) / results.direct.cost) * 100;
  }

  // Most efficient = best speedup
  const mostEfficientAgent = agents.reduce((best, agent) =>
    speedupByAgent[agent] > speedupByAgent[best] ? agent : best,
  );

  return {
    bestCombination,
    fastestWithEbee,
    fastestWithDirect,
    mostEfficient: `${mostEfficientAgent} (${speedupByAgent[mostEfficientAgent].toFixed(
      2,
    )}x speedup)`,
    speedupByAgent,
    tokenSavingsByAgent,
    costSavingsByAgent,
  };
}
