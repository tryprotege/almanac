/**
 * Matrix Results CSV Exporter
 * Exports Agent × MCP matrix results to CSV format
 */

import fs from "fs";
import path from "path";
import type { MatrixBenchmarkResults } from "../types/index.js";

/**
 * Export matrix results to CSV files
 */
export async function exportMatrixResults(
  results: MatrixBenchmarkResults,
  outputDir: string
): Promise<void> {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Export main matrix as CSV
  await exportMatrixCSV(
    results,
    path.join(outputDir, `matrix-${timestamp}.csv`)
  );

  // Export analysis as CSV
  await exportAnalysisCSV(
    results,
    path.join(outputDir, `analysis-${timestamp}.csv`)
  );

  console.log(`\n📁 Results exported to: ${outputDir}`);
  console.log(`   - matrix-${timestamp}.csv`);
  console.log(`   - analysis-${timestamp}.csv\n`);
}

/**
 * Export matrix data as CSV
 */
async function exportMatrixCSV(
  results: MatrixBenchmarkResults,
  filepath: string
): Promise<void> {
  const rows: string[] = [];

  // Header
  rows.push("agent,setup,time_ms,tokens,cost_usd,quality");

  // Data rows
  for (const [agent, agentResults] of Object.entries(results.matrix)) {
    // eBee row
    rows.push(
      [
        agent,
        "ebee",
        agentResults.ebee.time,
        agentResults.ebee.tokens,
        agentResults.ebee.cost.toFixed(4),
        agentResults.ebee.quality.toFixed(2),
      ].join(",")
    );

    // Direct row
    rows.push(
      [
        agent,
        "direct",
        agentResults.direct.time,
        agentResults.direct.tokens,
        agentResults.direct.cost.toFixed(4),
        agentResults.direct.quality.toFixed(2),
      ].join(",")
    );
  }

  fs.writeFileSync(filepath, rows.join("\n"));
}

/**
 * Export analysis data as CSV
 */
async function exportAnalysisCSV(
  results: MatrixBenchmarkResults,
  filepath: string
): Promise<void> {
  const rows: string[] = [];

  // Header
  rows.push("agent,speedup,token_savings_%,cost_savings_%");

  // Data rows
  for (const agent of Object.keys(results.matrix)) {
    rows.push(
      [
        agent,
        results.analysis.speedupByAgent[agent]?.toFixed(2) || "0",
        results.analysis.tokenSavingsByAgent[agent]?.toFixed(1) || "0",
        results.analysis.costSavingsByAgent[agent]?.toFixed(1) || "0",
      ].join(",")
    );
  }

  // Add summary rows
  rows.push("");
  rows.push("# Summary");
  rows.push(`best_combination,${results.analysis.bestCombination}`);
  rows.push(`fastest_with_ebee,${results.analysis.fastestWithEbee}`);
  rows.push(`fastest_with_direct,${results.analysis.fastestWithDirect}`);
  rows.push(`most_efficient,${results.analysis.mostEfficient}`);

  fs.writeFileSync(filepath, rows.join("\n"));
}
