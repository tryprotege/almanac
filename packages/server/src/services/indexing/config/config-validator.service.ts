import type {
  IndexingConfig,
  RecordTypeConfig,
  FetcherConfig,
} from "@ebee-oss/indexing-engine";
import { fetchAll as fetchPaginated } from "./paginated-fetcher.js";
import logger from "../../../utils/logger.js";

/**
 * Error types detected during config validation
 */
export interface ValidationError {
  type:
    | "NO_MATCHING_RECORD_TYPE"
    | "MISSING_FETCHER"
    | "DETECTION_CONDITION_FAILED"
    | "FIELD_MAPPING_ERROR"
    | "MCP_TOOL_ERROR"
    | "EMPTY_RESULTS"
    | "ORPHAN_RECORD_TYPE";
  fetcherName?: string;
  recordTypeName?: string;
  toolName?: string;
  message: string;
  sampleData?: any;
  details?: string;
}

/**
 * Result of a dry run test
 */
export interface TestRunResult {
  success: boolean;
  errors: ValidationError[];
  warnings: string[];
  stats: {
    fetchersExecuted: number;
    recordsMatched: number;
    recordsUnmatched: number;
    fetcherResults: Record<string, { total: number; matched: number }>;
  };
  mcpResponses: Record<string, any>; // Raw MCP responses for each fetcher (for LLM debugging)
}

/**
 * Execute a dry run test of an IndexingConfig
 * Tests each fetcher with limited data to find configuration errors
 */
export async function testConfigDryRun(
  config: IndexingConfig,
  serverName: string
): Promise<TestRunResult> {
  logger.info("Starting config dry run test...");

  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const stats = {
    fetchersExecuted: 0,
    recordsMatched: 0,
    recordsUnmatched: 0,
    fetcherResults: {} as Record<string, { total: number; matched: number }>,
  };
  const mcpResponses: Record<string, any> = {}; // Track raw MCP responses

  // First, validate structural consistency
  const structuralErrors = validateStructure(config);
  errors.push(...structuralErrors);

  // Get ordered fetchers (respects syncOrder if defined)
  const orderedFetchers = getOrderedFetchersForTest(config);

  for (const [fetcherName, fetcherConfig] of orderedFetchers) {
    // Skip write and search tools
    if (config.toolClassifications) {
      const classification = config.toolClassifications[fetcherConfig.tool];
      if (
        classification?.category === "write" ||
        classification?.category === "search"
      ) {
        continue;
      }
    }

    logger.debug(`Testing fetcher: ${fetcherName}`);

    try {
      // Find record types for this fetcher
      const recordTypes = Object.values(config.recordTypes).filter(
        (rt) => rt.fetcher === fetcherName
      );

      if (recordTypes.length === 0) {
        errors.push({
          type: "NO_MATCHING_RECORD_TYPE",
          fetcherName,
          toolName: fetcherConfig.tool,
          message: `Fetcher "${fetcherName}" has no matching recordType defined`,
          details:
            "Create a recordType with fetcher: '${fetcherName}' to process data from this tool",
        });
        continue;
      }

      // Fetch limited data (1 page only)
      let recordsTotal = 0;
      let recordsMatched = 0;
      let rawMcpResponse: any = null; // Capture raw MCP response

      for await (const pageResult of fetchPaginated(
        serverName,
        fetcherConfig
      )) {
        // Capture raw MCP response for this fetcher
        rawMcpResponse = pageResult.rawResponse;

        for (const rawRecord of pageResult.records) {
          recordsTotal++;

          // Try to match record to type
          const matchResult = matchRecordTypeWithDetails(
            rawRecord,
            recordTypes
          );

          if (matchResult.matched) {
            recordsMatched++;
            stats.recordsMatched++;

            // Validate field mappings work (sample first matched record)
            if (recordsMatched === 1 && matchResult.recordType) {
              const fieldErrors = validateFieldMappings(
                rawRecord,
                matchResult.recordType
              );
              errors.push(...fieldErrors);
            }
          } else {
            stats.recordsUnmatched++;

            // Only report unmatched records if we have recordTypes but none matched
            if (recordTypes.length > 0 && recordsTotal <= 3) {
              // Limit to first 3 samples
              errors.push({
                type: "DETECTION_CONDITION_FAILED",
                fetcherName,
                recordTypeName: recordTypes.map((rt) => rt.name).join(", "),
                message: `Record from "${fetcherName}" did not match any detection condition`,
                sampleData: limitSampleSize(rawRecord),
                details: `Detection conditions tried: ${recordTypes
                  .map((rt) =>
                    rt.detection.always
                      ? "always: true"
                      : rt.detection.condition
                  )
                  .join(", ")}`,
              });
            }
          }
        }

        // Only test first page
        break;
      }

      stats.fetchersExecuted++;
      stats.fetcherResults[fetcherName] = {
        total: recordsTotal,
        matched: recordsMatched,
      };

      // Store raw MCP response for this fetcher (for LLM debugging)
      mcpResponses[fetcherName] = rawMcpResponse;

      // Warn if records returned but none matched
      if (recordsTotal > 0 && recordsMatched === 0) {
        errors.push({
          type: "EMPTY_RESULTS",
          fetcherName,
          message: `Fetcher "${fetcherName}" returned ${recordsTotal} records but none matched any recordType`,
          details:
            "Check detection conditions or add always: true to match all records",
        });
      }

      logger.debug(
        `Fetcher ${fetcherName}: ${recordsMatched}/${recordsTotal} records matched`
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push({
        type: "MCP_TOOL_ERROR",
        fetcherName,
        toolName: fetcherConfig.tool,
        message: `MCP tool "${fetcherConfig.tool}" failed: ${errorMessage}`,
        details: errorMessage,
      });
      logger.error({ err, fetcherName }, "Error testing fetcher");
    }
  }

  // Check for orphan recordTypes (references non-existent fetcher)
  for (const [rtName, recordType] of Object.entries(config.recordTypes)) {
    if (!config.fetchers[recordType.fetcher]) {
      errors.push({
        type: "MISSING_FETCHER",
        recordTypeName: rtName,
        fetcherName: recordType.fetcher,
        message: `RecordType "${rtName}" references non-existent fetcher "${recordType.fetcher}"`,
      });
    }
  }

  const success = errors.length === 0;

  logger.info(
    `Dry run complete: ${success ? "PASSED" : "FAILED"} (${
      errors.length
    } errors, ${stats.fetchersExecuted} fetchers tested)`
  );

  return {
    success,
    errors,
    warnings,
    stats,
    mcpResponses,
  };
}

/**
 * Validate structural consistency of config
 */
function validateStructure(config: IndexingConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check all recordTypes reference valid fetchers
  for (const [rtName, recordType] of Object.entries(config.recordTypes || {})) {
    if (!config.fetchers[recordType.fetcher]) {
      errors.push({
        type: "ORPHAN_RECORD_TYPE",
        recordTypeName: rtName,
        fetcherName: recordType.fetcher,
        message: `RecordType "${rtName}" references fetcher "${recordType.fetcher}" which does not exist`,
      });
    }
  }

  // Check all fetchers have at least one recordType
  for (const fetcherName of Object.keys(config.fetchers || {})) {
    const hasRecordType = Object.values(config.recordTypes || {}).some(
      (rt) => rt.fetcher === fetcherName
    );
    if (!hasRecordType) {
      // This will be caught by the main loop, but add as warning here
    }
  }

  return errors;
}

/**
 * Match a record to a recordType and return details about the match
 */
function matchRecordTypeWithDetails(
  record: any,
  recordTypes: RecordTypeConfig[]
): { matched: boolean; recordType?: RecordTypeConfig; reason?: string } {
  for (const recordType of recordTypes) {
    if (recordType.detection.always) {
      return { matched: true, recordType };
    }

    if (recordType.detection.condition) {
      try {
        const conditionFn = new Function(
          "record",
          `return ${recordType.detection.condition}`
        );
        if (conditionFn(record)) {
          return { matched: true, recordType };
        }
      } catch (err) {
        return {
          matched: false,
          reason: `Condition eval error: ${err}`,
        };
      }
    }
  }

  return { matched: false, reason: "No condition matched" };
}

/**
 * Validate field mappings work on a sample record
 */
function validateFieldMappings(
  _record: any,
  _recordType: RecordTypeConfig
): ValidationError[] {
  const errors: ValidationError[] = [];

  // We could validate paths here, but for now just check basic structure
  // The transformer will catch actual runtime errors

  return errors;
}

/**
 * Limit sample data size for error reporting
 */
function limitSampleSize(data: any, maxDepth = 2): any {
  if (maxDepth === 0) {
    return typeof data === "object" ? "[...]" : data;
  }

  if (Array.isArray(data)) {
    return data.slice(0, 2).map((item) => limitSampleSize(item, maxDepth - 1));
  }

  if (data && typeof data === "object") {
    const limited: Record<string, any> = {};
    const keys = Object.keys(data).slice(0, 10);
    for (const key of keys) {
      limited[key] = limitSampleSize(data[key], maxDepth - 1);
    }
    if (Object.keys(data).length > 10) {
      limited["..."] = `(${Object.keys(data).length - 10} more keys)`;
    }
    return limited;
  }

  return data;
}

/**
 * Get ordered fetchers for testing
 */
function getOrderedFetchersForTest(
  config: IndexingConfig
): Array<[string, FetcherConfig]> {
  const fetcherEntries = Object.entries(config.fetchers) as Array<
    [string, FetcherConfig]
  >;

  if (config.syncOrder && config.syncOrder.length > 0) {
    const ordered: Array<[string, FetcherConfig]> = [];

    for (const fetcherName of config.syncOrder) {
      const entry = fetcherEntries.find(([name]) => name === fetcherName);
      if (entry) {
        ordered.push(entry);
      }
    }

    // Add any not in syncOrder
    for (const entry of fetcherEntries) {
      if (!config.syncOrder.includes(entry[0])) {
        ordered.push(entry);
      }
    }

    return ordered;
  }

  return fetcherEntries;
}

/**
 * Format errors for LLM consumption
 */
export function formatErrorsForLLM(result: TestRunResult): string {
  if (result.success) {
    return "No errors found. Config validation passed.";
  }

  const lines: string[] = [];
  lines.push(`## Config Validation Errors (${result.errors.length} found)\n`);

  // Group by error type
  const byType = new Map<string, ValidationError[]>();
  for (const error of result.errors) {
    const existing = byType.get(error.type) || [];
    existing.push(error);
    byType.set(error.type, existing);
  }

  for (const [type, errors] of byType) {
    lines.push(`### ${type}`);
    for (const error of errors) {
      lines.push(
        `- **${error.fetcherName || error.recordTypeName || ""}**: ${
          error.message
        }`
      );
      if (error.details) {
        lines.push(`  - Details: ${error.details}`);
      }
      if (error.sampleData) {
        lines.push(
          `  - Sample data: \`\`\`json\n${JSON.stringify(
            error.sampleData,
            null,
            2
          )}\n\`\`\``
        );
      }
    }
    lines.push("");
  }

  lines.push(`## Stats`);
  lines.push(`- Fetchers executed: ${result.stats.fetchersExecuted}`);
  lines.push(`- Records matched: ${result.stats.recordsMatched}`);
  lines.push(`- Records unmatched: ${result.stats.recordsUnmatched}`);

  return lines.join("\n");
}
