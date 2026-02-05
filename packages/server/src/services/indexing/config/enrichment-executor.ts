import type { EnrichmentConfig } from '@almanac/indexing-engine';
import { mcpClientManager } from '../../../mcp/client.js';
import { JSONPath } from 'jsonpath-plus';
import pLimit from 'p-limit';
import logger from '../../../utils/logger.js';

export interface EnrichedRecord {
  [key: string]: any;
}

const concurrencyLimit = pLimit(5); // Limit to 5 concurrent enrichments

/**
 * Enrich a record with additional data
 * Rate limiting is now handled by p-throttle at the mcpClientManager.callTool level
 */
export async function enrich(
  serverName: string,
  record: any,
  configs: EnrichmentConfig[],
): Promise<EnrichedRecord> {
  const enrichments: Record<string, any> = {};

  logger.debug(
    {
      enrichmentCount: configs.length,
      enrichmentNames: configs.map((c) => c.name),
    },
    'Starting enrichments for record',
  );

  // Run enrichments in parallel with concurrency limit
  await Promise.all(
    configs.map((config) =>
      concurrencyLimit(async () => {
        try {
          const result = await executeEnrichment(serverName, record, config);
          enrichments[config.name] = result;
          logger.debug(
            {
              enrichmentName: config.name,
              hasResult: result !== null && result !== undefined,
            },
            'Enrichment completed',
          );
        } catch (err) {
          logger.error(
            {
              err,
              enrichmentName: config.name,
              toolName: config.tool || config.fetcher,
            },
            'Enrichment failed',
          );
          enrichments[config.name] = null;
        }
      }),
    ),
  );

  return enrichments;
}

/**
 * Execute a single enrichment
 * Rate limiting is now handled by p-throttle at the mcpClientManager.callTool level
 */
async function executeEnrichment(
  serverName: string,
  record: any,
  config: EnrichmentConfig,
): Promise<any> {
  // Build parameters from paramMapping
  const params = buildParams(record, config.paramMapping);

  // Get tool name (from inline tool or fetcher reference)
  const toolName = config.tool || config.fetcher;
  if (!toolName) {
    throw new Error(`Enrichment ${config.name} missing tool or fetcher`);
  }

  logger.debug(
    {
      enrichmentName: config.name,
      toolName,
      params,
    },
    `[Enrichment] Calling ${config.name} (${toolName})`,
  );

  const callStartTime = Date.now();

  // Call MCP tool - p-throttle + p-retry handles rate limiting and retries automatically
  const response = await mcpClientManager.callTool(serverName, toolName, params);

  const callDuration = Date.now() - callStartTime;
  logger.debug(
    { enrichmentName: config.name, callDuration },
    `[Enrichment] API call to ${toolName} succeeded in ${callDuration}ms`,
  );

  logger.debug(
    {
      enrichmentName: config.name,
      responseType: typeof response,
      hasContent: response?.content !== undefined,
    },
    'Received enrichment response',
  );

  // Extract result using resultPath if provided
  if (config.resultPath) {
    const extracted = extractPath(response, config.resultPath);
    logger.debug(
      {
        enrichmentName: config.name,
        resultPath: config.resultPath,
        extractedType: typeof extracted,
        extractedValue: typeof extracted === 'string' ? extracted.substring(0, 100) : extracted,
      },
      'Extracted enrichment result using resultPath',
    );
    return extracted;
  }

  return response;
}

/**
 * Build parameters from paramMapping
 * Maps parameter names to values extracted from record using JSONPath
 * or uses literal values directly
 */
export function buildParams(record: any, paramMapping: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [paramName, value] of Object.entries(paramMapping)) {
    // If it's a string starting with $, treat as JSONPath
    if (typeof value === 'string' && value.startsWith('$')) {
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
 * Extract value from response using JSONPath
 * Supports array syntax like $.content[0].text
 */
function extractPath(obj: any, path: string): any {
  try {
    const result = JSONPath({ path, json: obj, wrap: false });
    return result;
  } catch (err) {
    logger.warn({ path, error: err }, 'Failed to extract path from object, returning undefined');
    return undefined;
  }
}
