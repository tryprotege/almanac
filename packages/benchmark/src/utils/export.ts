/**
 * Export Utilities - Functional Approach
 * Functions for exporting benchmark results to various formats
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { stringify } from "yaml";
import type {
  BenchmarkResults,
  QueryBenchmarkResults,
  AgentBenchmarkResults,
  ComparisonBenchmarkResults,
  QueryMetrics,
} from "../types/index.js";
import { getCSVHeader, metricsToCSV } from "./metrics.js";

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
// JSON Export
// ============================================

/**
 * Export results to JSON file
 */
export const exportToJSON = (
  results: BenchmarkResults,
  filepath: string
): void => {
  const json = JSON.stringify(results, null, 2);
  writeFileSync(filepath, json);
  console.log(`📄 Exported JSON: ${filepath}`);
};

// ============================================
// CSV Export
// ============================================

/**
 * Export query metrics to CSV
 */
export const exportQueryMetricsToCSV = (
  metrics: readonly QueryMetrics[],
  filepath: string
): void => {
  const header = getCSVHeader();
  const rows = metrics.map(metricsToCSV);
  const csv = [header, ...rows].join("\n");

  writeFileSync(filepath, csv);
  console.log(`📊 Exported CSV: ${filepath}`);
};

// ============================================
// YAML Export
// ============================================

/**
 * Export results to YAML file
 */
export const exportToYAML = (
  results: BenchmarkResults,
  filepath: string
): void => {
  const yaml = stringify(results);
  writeFileSync(filepath, yaml);
  console.log(`📝 Exported YAML: ${filepath}`);
};

// ============================================
// HTML Report Generation
// ============================================

/**
 * Generate HTML report for query benchmarks
 */
export const generateQueryHTMLReport = (
  results: QueryBenchmarkResults,
  filepath: string
): void => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${results.config.name} - Benchmark Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1, h2, h3 { color: #333; }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metric {
      display: inline-block;
      margin: 10px 20px 10px 0;
    }
    .metric-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }
    .metric-value {
      font-size: 24px;
      font-weight: bold;
      color: #007bff;
    }
    table {
      width: 100%;
      background: white;
      border-collapse: collapse;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th {
      background: #007bff;
      color: white;
      font-weight: 600;
    }
    tr:hover { background: #f8f9fa; }
    .mode-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .mode-naive { background: #e3f2fd; color: #1976d2; }
    .mode-local { background: #f3e5f5; color: #7b1fa2; }
    .mode-global { background: #e8f5e9; color: #388e3c; }
    .mode-hybrid { background: #fff3e0; color: #f57c00; }
    .mode-mix { background: #fce4ec; color: #c2185b; }
  </style>
</head>
<body>
  <h1>🐝 ${results.config.name}</h1>
  <p>${results.config.description}</p>
  <p><strong>Timestamp:</strong> ${results.timestamp}</p>

  <div class="summary">
    <h2>Overall Statistics</h2>
    <div class="metric">
      <div class="metric-label">Mean Time</div>
      <div class="metric-value">${results.aggregated.overall.totalTime.mean.toFixed(
        0
      )}ms</div>
    </div>
    <div class="metric">
      <div class="metric-label">P95 Time</div>
      <div class="metric-value">${results.aggregated.overall.totalTime.p95.toFixed(
        0
      )}ms</div>
    </div>
    <div class="metric">
      <div class="metric-label">Avg Tokens</div>
      <div class="metric-value">${results.aggregated.overall.tokenUsage.mean.toFixed(
        0
      )}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Avg Score</div>
      <div class="metric-value">${results.aggregated.overall.resultsQuality.meanScore.toFixed(
        3
      )}</div>
    </div>
  </div>

  <h2>Results by Mode</h2>
  <table>
    <thead>
      <tr>
        <th>Mode</th>
        <th>Mean Time</th>
        <th>P95 Time</th>
        <th>Tokens</th>
        <th>Quality Score</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(results.aggregated.byMode)
        .map(
          ([mode, stats]) => `
        <tr>
          <td><span class="mode-badge mode-${mode}">${mode}</span></td>
          <td>${stats.totalTime.mean.toFixed(0)}ms</td>
          <td>${stats.totalTime.p95.toFixed(0)}ms</td>
          <td>${stats.tokenUsage.mean.toFixed(0)}</td>
          <td>${stats.resultsQuality.meanScore.toFixed(3)}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <h2>Detailed Results</h2>
  <table>
    <thead>
      <tr>
        <th>Query</th>
        <th>Mode</th>
        <th>Mean Time</th>
        <th>Std Dev</th>
        <th>Tokens</th>
        <th>Results</th>
        <th>Score</th>
      </tr>
    </thead>
    <tbody>
      ${results.queryResults
        .map(
          (result) => `
        <tr>
          <td>${result.query.id}</td>
          <td><span class="mode-badge mode-${result.mode}">${
            result.mode
          }</span></td>
          <td>${result.statistics.totalTime.mean.toFixed(0)}ms</td>
          <td>±${result.statistics.totalTime.stdDev.toFixed(0)}ms</td>
          <td>${result.statistics.tokenUsage.mean.toFixed(0)}</td>
          <td>${result.statistics.resultsQuality.meanResults.toFixed(1)}</td>
          <td>${result.statistics.resultsQuality.meanScore.toFixed(3)}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>
</body>
</html>
  `.trim();

  writeFileSync(filepath, html);
  console.log(`📊 Generated HTML report: ${filepath}`);
};

// ============================================
// Main Export Function
// ============================================

/**
 * Export benchmark results to all formats
 */
export const exportResults = (
  results: BenchmarkResults,
  outputDir: string
): void => {
  ensureOutputDir(outputDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${results.config.name
    .replace(/\s+/g, "-")
    .toLowerCase()}-${timestamp}`;

  // Export JSON
  exportToJSON(results, `${outputDir}/${baseName}.json`);

  // Export YAML
  exportToYAML(results, `${outputDir}/${baseName}.yaml`);

  // Type-specific exports
  if (results.config.type === "query") {
    const queryResults = results as QueryBenchmarkResults;

    // Export CSV
    const allMetrics = queryResults.queryResults.flatMap((r) => r.runs);
    exportQueryMetricsToCSV(allMetrics, `${outputDir}/${baseName}.csv`);

    // Generate HTML report
    generateQueryHTMLReport(queryResults, `${outputDir}/${baseName}.html`);
  }

  console.log(`\n✅ All results exported to: ${outputDir}/`);
};
