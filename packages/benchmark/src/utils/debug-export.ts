/**
 * Debug Report Exporter
 * Exports detailed agent interaction logs including all steps, messages, and MCP calls
 * for debugging purposes
 */

import fs from "fs";
import path from "path";
import type { MatrixBenchmarkResults } from "../types/index.js";
import type { AgentStep } from "../runners/sdk-runner.js";

/**
 * Debug trace for a single query execution
 */
export interface DebugTrace {
  readonly queryId: string;
  readonly query: string;
  readonly agentName: string;
  readonly setupName: string;
  readonly iteration: number;
  readonly timestamp: string;
  readonly steps: readonly AgentStep[];
  readonly finalResponse: string;
  readonly totalSteps: number;
  readonly totalTokens: number;
  readonly executionTime: number;
  readonly error?: string;
}

/**
 * Export debug traces to JSON format (more detailed)
 */
export async function exportDebugReportJSON(
  results: MatrixBenchmarkResults,
  outputDir: string
): Promise<void> {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filepath = path.join(outputDir, `debug-report-${timestamp}.json`);

  // Create detailed debug report structure
  const debugReport = {
    metadata: {
      benchmarkName: results.config.name,
      timestamp: results.timestamp,
      totalQueries: results.detailedResults.length,
      agents: results.config.agents.map((a) => a.name),
      setups: results.config.mcpSetups.map((s) => s.name),
    },
    traces: results.detailedResults.map((result) => ({
      queryId: result.queryId,
      query: result.query,
      category: result.category,
      agentName: result.agentName,
      setupName: result.setupName,
      iteration: result.iteration,
      timestamp: result.timestamp,
      targetServers: result.targetServers,

      // Execution details
      execution: {
        response: result.response,
        executionTime: result.executionTime,
        error: result.error,
      },

      // Token usage breakdown
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
        thinking: result.thinkingTokens || 0,
        cacheCreation: result.cacheCreationTokens || 0,
        cacheRead: result.cacheReadTokens || 0,
        total: result.totalTokens,
      },

      // Cost
      cost: result.cost,

      // Evaluation results
      evaluation: result.evaluation
        ? {
            passed: result.evaluation.passed,
            score: result.evaluation.score,
            matchedCount: result.evaluation.matchedCount,
            totalRequired: result.evaluation.totalRequired,
            matches: result.evaluation.matches,
            missing: result.evaluation.missing,
          }
        : null,

      // Step-by-step agent interaction data
      steps:
        result.steps && result.steps.length > 0
          ? result.steps
          : [
              // Fallback for results without captured steps
              {
                stepNumber: 1,
                type: "final_result",
                timestamp: result.timestamp,
                content: result.response,
                tokens: {
                  input: result.inputTokens,
                  output: result.outputTokens,
                  thinking: result.thinkingTokens || 0,
                  cacheCreation: result.cacheCreationTokens || 0,
                  cacheRead: result.cacheReadTokens || 0,
                },
              },
            ],
    })),
  };

  fs.writeFileSync(filepath, JSON.stringify(debugReport, null, 2));
  console.log(`   - debug-report-${timestamp}.json`);
}
