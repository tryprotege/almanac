/**
 * Matrix Results CSV Exporter
 * Exports Agent × MCP matrix results to CSV format with detailed test results
 */

import fs from 'fs';
import path from 'path';
import type { MatrixBenchmarkResults } from '../types/index.js';
import { exportDebugReportJSON } from './debug-export.js';

/**
 * Export matrix results to CSV files
 */
export async function exportMatrixResults(
  results: MatrixBenchmarkResults,
  outputDir: string,
): Promise<void> {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Export main matrix as CSV
  await exportMatrixCSV(results, path.join(outputDir, `matrix-${timestamp}.csv`));

  // Export analysis as CSV
  await exportAnalysisCSV(results, path.join(outputDir, `analysis-${timestamp}.csv`));

  // Export detailed test results
  await exportDetailedTestResults(
    results,
    path.join(outputDir, `detailed-test-results-${timestamp}.csv`),
  );

  // Export debug reports
  await exportDebugReportJSON(results, outputDir);

  console.log(`\n📁 Results exported to: ${outputDir}`);
  console.log(`   - matrix-${timestamp}.csv`);
  console.log(`   - analysis-${timestamp}.csv`);
  console.log(`   - detailed-test-results-${timestamp}.csv`);
  console.log(`   - debug-report-${timestamp}.json\n`);
}

/**
 * Export matrix data as CSV
 */
async function exportMatrixCSV(results: MatrixBenchmarkResults, filepath: string): Promise<void> {
  const rows: string[] = [];

  // Header
  rows.push('agent,setup,time_ms,tokens,cost_usd,quality');

  // Data rows
  for (const [agent, agentResults] of Object.entries(results.matrix)) {
    // Almanac row
    rows.push(
      [
        agent,
        'almanac',
        agentResults.almanac.time,
        agentResults.almanac.tokens,
        agentResults.almanac.cost.toFixed(4),
        agentResults.almanac.quality.toFixed(2),
      ].join(','),
    );

    // Direct row
    rows.push(
      [
        agent,
        'direct',
        agentResults.direct.time,
        agentResults.direct.tokens,
        agentResults.direct.cost.toFixed(4),
        agentResults.direct.quality.toFixed(2),
      ].join(','),
    );
  }

  fs.writeFileSync(filepath, rows.join('\n'));
}

/**
 * Export analysis data as CSV
 */
async function exportAnalysisCSV(results: MatrixBenchmarkResults, filepath: string): Promise<void> {
  const rows: string[] = [];

  // Header
  rows.push('agent,speedup,token_savings_%,cost_savings_%');

  // Data rows
  for (const agent of Object.keys(results.matrix)) {
    rows.push(
      [
        agent,
        results.analysis.speedupByAgent[agent]?.toFixed(2) || '0',
        results.analysis.tokenSavingsByAgent[agent]?.toFixed(1) || '0',
        results.analysis.costSavingsByAgent[agent]?.toFixed(1) || '0',
      ].join(','),
    );
  }

  // Add summary rows
  rows.push('');
  rows.push('# Summary');
  rows.push(`best_combination,${results.analysis.bestCombination}`);
  rows.push(`fastest_with_ebee,${results.analysis.fastestWithEbee}`);
  rows.push(`fastest_with_direct,${results.analysis.fastestWithDirect}`);
  rows.push(`most_efficient,${results.analysis.mostEfficient}`);

  fs.writeFileSync(filepath, rows.join('\n'));
}

/**
 * Escape CSV field value
 */
function escapeCSV(value: string | number): string {
  const str = String(value);
  // If contains comma, newline, or quotes, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export detailed test results as CSV with enhanced debugging information
 */
async function exportDetailedTestResults(
  results: MatrixBenchmarkResults,
  filepath: string,
): Promise<void> {
  const rows: string[] = [];

  // Header - Enhanced with expected output and actual response columns
  rows.push(
    [
      'Query ID',
      'Query Text',
      'Category',
      'Agent',
      'Setup',
      'Iteration',
      'Status',
      'Pass/Fail Reason',
      'Evaluation Score',
      'Match Rate (%)',
      'Matched Count',
      'Total Required',
      'Expected Output (Must Include)',
      'Matched Items',
      'Missing Items',
      'Actual Output (Full Response)',
      'Response Length (chars)',
      'Number of Tool Calls',
      'Execution Time (ms)',
      'Total Tokens',
      'Input Tokens',
      'Output Tokens',
      'Thinking Tokens',
      'Cache Creation Tokens',
      'Cache Read Tokens',
      'Cost (USD)',
      'Target Servers',
      'Timestamp',
      'Error',
    ]
      .map(escapeCSV)
      .join(','),
  );

  // Sort results by agent and setup for better organization
  const sortedResults = [...results.detailedResults].sort((a, b) => {
    // First sort by agent name
    const agentCompare = a.agentName.localeCompare(b.agentName);
    if (agentCompare !== 0) return agentCompare;

    // Then sort by setup name
    const setupCompare = a.setupName.localeCompare(b.setupName);
    if (setupCompare !== 0) return setupCompare;

    // Finally sort by query ID and iteration for consistent ordering
    const queryCompare = a.queryId.localeCompare(b.queryId);
    if (queryCompare !== 0) return queryCompare;

    return a.iteration - b.iteration;
  });

  // Group results by query for pattern analysis (for future use)
  const resultsByQuery = new Map<string, Array<(typeof results.detailedResults)[number]>>();
  for (const result of sortedResults) {
    if (!resultsByQuery.has(result.queryId)) {
      resultsByQuery.set(result.queryId, []);
    }
    resultsByQuery.get(result.queryId)!.push(result);
  }

  // Data rows with enhanced information
  for (const result of sortedResults) {
    const status = result.error
      ? 'ERROR'
      : result.evaluation
        ? result.evaluation.passed
          ? 'PASSED'
          : 'FAILED'
        : 'N/A';

    // Determine pass/fail reason
    let reason = '';
    if (result.error) {
      reason = 'Execution error occurred';
    } else if (result.evaluation) {
      if (result.evaluation.passed) {
        reason = 'All required items matched';
      } else {
        reason = `Missing ${result.evaluation.missing.length} required item(s)`;
      }
    } else {
      reason = 'No evaluation criteria';
    }

    const evaluationScore = result.evaluation ? result.evaluation.score.toFixed(3) : 'N/A';

    const matchRate = result.evaluation
      ? ((result.evaluation.matchedCount / result.evaluation.totalRequired) * 100).toFixed(1)
      : 'N/A';

    const matchedCount = result.evaluation ? `${result.evaluation.matchedCount}` : 'N/A';

    const totalRequired = result.evaluation ? `${result.evaluation.totalRequired}` : 'N/A';

    // Get expected output from evaluation criteria
    // We need to look up the scenario to get mustInclude items
    const expectedOutput = getExpectedOutputForQuery(results, result.queryId);

    const matchedItems = result.evaluation?.matches.length
      ? result.evaluation.matches.join('; ')
      : '';

    const missingItems = result.evaluation?.missing.length
      ? result.evaluation.missing.join('; ')
      : '';

    // Full actual output (not truncated)
    const actualOutput = result.response;
    const responseLength = result.response.length;

    // Count tool calls from steps array
    const toolCallCount = result.steps
      ? result.steps.filter((step) => step.type === 'tool_use').length
      : 0;

    rows.push(
      [
        result.queryId,
        result.query,
        result.category || 'N/A',
        result.agentName,
        result.setupName,
        result.iteration.toString(),
        status,
        reason,
        evaluationScore,
        matchRate,
        matchedCount,
        totalRequired,
        expectedOutput,
        matchedItems,
        missingItems,
        actualOutput,
        responseLength.toString(),
        toolCallCount.toString(),
        result.executionTime.toString(),
        result.totalTokens.toString(),
        result.inputTokens.toString(),
        result.outputTokens.toString(),
        result.thinkingTokens?.toString() || '0',
        result.cacheCreationTokens?.toString() || '0',
        result.cacheReadTokens?.toString() || '0',
        result.cost.toFixed(6),
        result.targetServers.join('; '),
        result.timestamp,
        result.error || '',
      ]
        .map(escapeCSV)
        .join(','),
    );
  }

  fs.writeFileSync(filepath, rows.join('\n'));
  console.log(
    `   💡 Tip: Use Excel or Google Sheets pivot tables to analyze patterns by agent, setup, or query type`,
  );
}

/**
 * Get expected output (mustInclude items) for a query
 */
function getExpectedOutputForQuery(results: MatrixBenchmarkResults, queryId: string): string {
  // Try to find the scenario in the config
  if (results.config.queriesSource.type === 'hardcoded' && results.config.scenarios) {
    const scenario = results.config.scenarios.find((s) => s.id === queryId);
    if (scenario?.evaluationCriteria?.mustInclude) {
      return scenario.evaluationCriteria.mustInclude.join('; ');
    }
  }

  // If using generated queries, we need to check the detailedResults for evaluation data
  // Since the first result should have the evaluation criteria
  const resultWithEval = results.detailedResults.find((r) => r.queryId === queryId && r.evaluation);

  if (resultWithEval?.evaluation) {
    // Reconstruct expected items from matches + missing
    const allExpected = [
      ...resultWithEval.evaluation.matches,
      ...resultWithEval.evaluation.missing,
    ];
    return allExpected.join('; ');
  }

  return 'N/A';
}
