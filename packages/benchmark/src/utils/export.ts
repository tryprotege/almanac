/**
 * Export Utilities - CSV Export Only
 * Functions for exporting benchmark results to CSV format
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import type {
  BenchmarkResults,
  QueryBenchmarkResults,
  AgentBenchmarkResults,
  ComparisonBenchmarkResults,
  QueryMetrics,
} from '../types/index.js';
import { getCSVHeader, metricsToCSV } from './metrics.js';

// ============================================
// Directory Management
// ============================================

/**
 * Ensure output directory exists
 */
export const ensureOutputDir = (dir: string): void => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

// ============================================
// CSV Export
// ============================================

/**
 * Export query metrics to CSV
 */
export const exportQueryMetricsToCSV = (
  metrics: readonly QueryMetrics[],
  filepath: string,
): void => {
  const header = getCSVHeader();
  const rows = metrics.map(metricsToCSV);
  const csv = [header, ...rows].join('\n');

  writeFileSync(filepath, csv);
  console.log(`� Exported CSV: ${filepath}`);
};

// ============================================
// Main Export Function
// ============================================

/**
 * Export benchmark results to CSV format only
 */
export const exportResults = (results: BenchmarkResults, outputDir: string): void => {
  ensureOutputDir(outputDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${results.config.name.replace(/\s+/g, '-').toLowerCase()}-${timestamp}`;

  // Export CSV only
  if (results.config.type === 'query') {
    const queryResults = results as QueryBenchmarkResults;
    const allMetrics = queryResults.queryResults.flatMap((r) => r.runs);
    exportQueryMetricsToCSV(allMetrics, `${outputDir}/${baseName}.csv`);
  } else if (results.config.type === 'agent') {
    // For agent benchmarks, create a simple CSV with summary data
    const agentResults = results as AgentBenchmarkResults;
    const csv = generateAgentCSV(agentResults);
    writeFileSync(`${outputDir}/${baseName}.csv`, csv);
    console.log(`📊 Exported CSV: ${outputDir}/${baseName}.csv`);
  } else if (results.config.type === 'comparison') {
    // For comparison benchmarks, create a CSV with comparison data
    const comparisonResults = results as ComparisonBenchmarkResults;
    const csv = generateComparisonCSV(comparisonResults);
    writeFileSync(`${outputDir}/${baseName}.csv`, csv);
    console.log(`� Exported CSV: ${outputDir}/${baseName}.csv`);
  }

  console.log(`\n✅ Results exported to: ${outputDir}/`);
};

/**
 * Generate CSV for agent benchmark results
 */
const generateAgentCSV = (results: AgentBenchmarkResults): string => {
  const headers = ['agent', 'query_id', 'response_time_avg', 'tokens_avg', 'quality_overall'];
  const rows = results.agentResults.map((result) => [
    result.agent.name,
    result.query.id,
    result.statistics.responseTime.mean.toFixed(2),
    result.statistics.tokenUsage.mean.toFixed(0),
    result.statistics.qualityScores.overall.mean.toFixed(3),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
};

/**
 * Generate CSV for comparison benchmark results
 */
const generateComparisonCSV = (results: ComparisonBenchmarkResults): string => {
  const headers = [
    'scenario_id',
    'agent',
    'ebee_time',
    'ebee_calls',
    'ebee_tokens',
    'ebee_quality',
    'direct_time',
    'direct_calls',
    'direct_tokens',
    'direct_quality',
    'speedup',
    'token_efficiency',
    'quality_delta',
  ];

  const rows = results.scenarios.map((scenario) => [
    scenario.scenario.id,
    scenario.agent.name,
    scenario.metrics.ebeeQuery.totalTime.toFixed(2),
    scenario.metrics.ebeeQuery.mcpCalls.toString(),
    scenario.metrics.ebeeQuery.tokensUsed.toFixed(0),
    scenario.metrics.ebeeQuery.resultQuality.toFixed(3),
    scenario.metrics.directQuery.totalTime.toFixed(2),
    scenario.metrics.directQuery.mcpCalls.toString(),
    scenario.metrics.directQuery.tokensUsed.toFixed(0),
    scenario.metrics.directQuery.resultQuality.toFixed(3),
    scenario.metrics.speedup.toFixed(2),
    scenario.metrics.tokenEfficiency.toFixed(1),
    scenario.metrics.qualityDelta.toFixed(3),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
};
