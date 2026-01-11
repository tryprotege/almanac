import type { IndexingConfig } from "@ebee-oss/indexing-engine";
import type { TestRunResult } from "../config-validator.service.js";

export interface DebugPromptInput {
  originalConfig: IndexingConfig;
  testResult: TestRunResult;
  samples: Record<string, any>;
  attemptNumber: number;
  maxAttempts: number;
}

/**
 * Generate a debug prompt for the LLM to fix config errors
 */
export function generateDebugPrompt(input: DebugPromptInput): string {
  const { originalConfig, testResult, attemptNumber, maxAttempts } = input;

  const errorSummary = summarizeErrors(testResult);
  const sampleDataSection = formatRelevantSamples(testResult);

  return `# Fix IndexingConfig Errors (Attempt ${attemptNumber}/${maxAttempts})

You previously generated an IndexingConfig for "${
    originalConfig.displayName
  }" but it has errors that need to be fixed.

## Current Config (with errors)

\`\`\`json
${JSON.stringify(originalConfig, null, 2)}
\`\`\`

## Test Run Results

${errorSummary}

${sampleDataSection}

## How to Fix Each Error Type

### NO_MATCHING_RECORD_TYPE
The fetcher is defined but there's no corresponding recordType to process its data.
**Fix:** Add a recordType with \`"fetcher": "<fetcherName>"\` that matches the fetcher name.

### DETECTION_CONDITION_FAILED  
Records were returned but the detection condition didn't match any of them.
**Fix:** Either:
- Set \`"detection": { "always": true }\` to match all records
- Update the condition to match the actual record structure shown in the sample data

### EMPTY_RESULTS
The fetcher returned records but none matched any recordType.
**Fix:** Check that the recordType's fetcher property matches the fetcher name exactly.

### ORPHAN_RECORD_TYPE / MISSING_FETCHER
A recordType references a fetcher that doesn't exist.
**Fix:** Either add the missing fetcher or fix the fetcher name reference.

### MCP_TOOL_ERROR
The MCP tool call failed.
**Fix:** Check the tool name and parameters match the MCP server's expected format.

## Instructions

1. Analyze the errors above carefully
2. Look at the sample data to understand the actual structure
3. Update ONLY the parts that need fixing
4. Keep the same overall structure and syncOrder
5. Return the COMPLETE fixed config as valid JSON

## Important Rules

- Return ONLY the fixed JSON config (no explanations before/after)
- Do NOT remove working fetchers or recordTypes
- Ensure every fetcher has a corresponding recordType
- Use \`"detection": { "always": true }\` when the structure is consistent
- Match fetcher names exactly between fetchers and recordTypes.fetcher

## Output

Return the fixed IndexingConfig JSON:

\`\`\`json
`;
}

/**
 * Summarize errors for the debug prompt
 */
function summarizeErrors(result: TestRunResult): string {
  const lines: string[] = [];

  lines.push(`### Errors Found: ${result.errors.length}\n`);

  // Group by type for cleaner output
  const byType = new Map<string, typeof result.errors>();
  for (const error of result.errors) {
    const existing = byType.get(error.type) || [];
    existing.push(error);
    byType.set(error.type, existing);
  }

  for (const [type, errors] of byType) {
    lines.push(`**${type}** (${errors.length}):`);
    for (const error of errors.slice(0, 5)) {
      // Limit to 5 per type
      lines.push(`- ${error.message}`);
      if (error.details) {
        lines.push(`  - ${error.details}`);
      }
    }
    if (errors.length > 5) {
      lines.push(`  - ... and ${errors.length - 5} more`);
    }
    lines.push("");
  }

  lines.push(`### Test Stats`);
  lines.push(`- Fetchers executed: ${result.stats.fetchersExecuted}`);
  lines.push(`- Records matched: ${result.stats.recordsMatched}`);
  lines.push(`- Records unmatched: ${result.stats.recordsUnmatched}`);

  // Per-fetcher breakdown
  if (Object.keys(result.stats.fetcherResults).length > 0) {
    lines.push(`\n### Per-Fetcher Results:`);
    for (const [fetcher, stats] of Object.entries(
      result.stats.fetcherResults
    )) {
      const status =
        stats.matched === stats.total
          ? "✅"
          : stats.matched === 0
          ? "❌"
          : "⚠️";
      lines.push(
        `- ${status} ${fetcher}: ${stats.matched}/${stats.total} matched`
      );
    }
  }

  return lines.join("\n");
}

/**
 * Format relevant sample data and MCP responses for errors
 */
function formatRelevantSamples(result: TestRunResult): string {
  const lines: string[] = [];
  const relevantFetchers = new Set<string>();

  // Collect fetchers with errors or 0 records
  for (const error of result.errors) {
    if (error.fetcherName) {
      relevantFetchers.add(error.fetcherName);
    }
  }

  // Also include fetchers with 0 records (might have MCP errors)
  for (const [fetcherName, stats] of Object.entries(
    result.stats.fetcherResults
  )) {
    if (stats.total === 0) {
      relevantFetchers.add(fetcherName);
    }
  }

  if (relevantFetchers.size === 0) {
    return "";
  }

  lines.push(`## Fetcher Analysis\n`);

  for (const fetcherName of relevantFetchers) {
    const stats = result.stats.fetcherResults[fetcherName];
    const mcpResponse = result.mcpResponses?.[fetcherName];
    const error = result.errors.find((e) => e.fetcherName === fetcherName);

    lines.push(`### Fetcher: ${fetcherName}`);

    if (stats) {
      lines.push(
        `**Results:** ${stats.matched}/${stats.total} records matched`
      );
    }

    // Show raw MCP response (especially important for 0-record fetchers)
    if (mcpResponse) {
      lines.push(`\n**Raw MCP Response:**`);
      lines.push("```json");
      lines.push(JSON.stringify(mcpResponse, null, 2));
      lines.push("```");

      // Analyze the response
      if (mcpResponse.content?.[0]?.text) {
        const text = mcpResponse.content[0].text;
        if (text.includes("MCP error") || text.includes("Invalid arguments")) {
          lines.push(
            `\n⚠️ **MCP Error Detected:** The tool returned an error message instead of data.`
          );
          lines.push(`This indicates the fetcher parameters are incorrect.`);
        } else if (text === "[]" || text === "{}") {
          lines.push(
            `\n✅ **Valid Empty Response:** The tool returned empty data, which is valid.`
          );
        }
      }
    }

    // Show sample data from error if available
    if (error?.sampleData) {
      lines.push(`\n**Sample Record That Failed:**`);
      lines.push("```json");
      lines.push(JSON.stringify(error.sampleData, null, 2));
      lines.push("```");
    }

    lines.push(""); // Blank line between fetchers
  }

  return lines.join("\n");
}

/**
 * Parse the LLM response to extract the fixed config
 */
export function parseDebugResponse(response: string): IndexingConfig {
  // Extract JSON from markdown code blocks if present
  let jsonContent = response.trim();

  // Remove markdown code fences if present
  const jsonMatch = jsonContent.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
  } else {
    // Try generic code block
    const codeMatch = jsonContent.match(/```\n([\s\S]*?)\n```/);
    if (codeMatch) {
      jsonContent = codeMatch[1];
    }
  }

  // Parse JSON
  try {
    return JSON.parse(jsonContent) as IndexingConfig;
  } catch (error) {
    throw new Error(`Failed to parse LLM debug response as JSON: ${error}`);
  }
}
