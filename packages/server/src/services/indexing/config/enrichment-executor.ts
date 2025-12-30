import type { EnrichmentConfig } from "@ebee-oss/indexing-engine";
import { mcpClientManager } from "../../../mcp/client.js";
import pLimit from "p-limit";

export interface EnrichedRecord {
  [key: string]: any;
}

const concurrencyLimit = pLimit(5); // Limit to 5 concurrent enrichments

/**
 * Enrich a record with additional data
 */
export async function enrich(
  serverName: string,
  record: any,
  configs: EnrichmentConfig[]
): Promise<EnrichedRecord> {
  const enrichments: Record<string, any> = {};

  // Run enrichments in parallel with concurrency limit
  await Promise.all(
    configs.map((config) =>
      concurrencyLimit(async () => {
        const result = await executeEnrichment(serverName, record, config);
        enrichments[config.name] = result;
      })
    )
  );

  return enrichments;
}

/**
 * Execute a single enrichment
 */
async function executeEnrichment(
  serverName: string,
  record: any,
  config: EnrichmentConfig
): Promise<any> {
  // Build parameters from paramMapping
  const params = buildParams(record, config.paramMapping);

  // Get tool name (from inline tool or fetcher reference)
  const toolName = config.tool || config.fetcher;
  if (!toolName) {
    throw new Error(`Enrichment ${config.name} missing tool or fetcher`);
  }

  // Call MCP tool
  const response = await mcpClientManager.callTool(
    serverName,
    toolName,
    params
  );

  // Extract result using resultPath if provided
  if (config.resultPath) {
    return extractPath(response, config.resultPath);
  }

  return response;
}

/**
 * Build parameters from paramMapping
 * Maps parameter names to values extracted from record using JSONPath
 * or uses literal values directly
 */
function buildParams(
  record: any,
  paramMapping: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [paramName, value] of Object.entries(paramMapping)) {
    // If it's a string starting with $, treat as JSONPath
    if (typeof value === "string" && value.startsWith("$")) {
      const extracted = extractPath(record, value);
      if (extracted !== undefined) {
        result[paramName] = extracted;
      }
    } else {
      // Otherwise, use as literal value
      result[paramName] = value;
    }
  }

  return result;
}

/**
 * Extract value from response using dot notation
 */
function extractPath(obj: any, path: string): any {
  const parts = path.split(".");
  let value = obj;

  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }

  return value;
}
