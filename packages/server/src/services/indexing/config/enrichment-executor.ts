import type {
  EnrichmentConfig,
  RateLimitConfig,
} from "@ebee-oss/indexing-engine";
import { mcpClientManager } from "../../../mcp/client.js";
import { JSONPath } from "jsonpath-plus";
import pLimit from "p-limit";
import logger from "../../../utils/logger.js";
import {
  applyRateLimit,
  handleRateLimitError,
  notifySuccess,
  notifyRateLimitError,
  rateLimiterManager,
} from "./rate-limiter.js";
import { detectRateLimitError } from "./mcp-error-parser.js";

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
  configs: EnrichmentConfig[],
  rateLimitConfig?: RateLimitConfig
): Promise<EnrichedRecord> {
  const enrichments: Record<string, any> = {};

  logger.debug(
    {
      enrichmentCount: configs.length,
      enrichmentNames: configs.map((c) => c.name),
    },
    "Starting enrichments for record"
  );

  // Run enrichments in parallel with concurrency limit
  await Promise.all(
    configs.map((config) =>
      concurrencyLimit(async () => {
        try {
          const result = await executeEnrichment(
            serverName,
            record,
            config,
            rateLimitConfig
          );
          enrichments[config.name] = result;
          logger.debug(
            {
              enrichmentName: config.name,
              hasResult: result !== null && result !== undefined,
            },
            "Enrichment completed"
          );
        } catch (err) {
          logger.error(
            {
              err,
              enrichmentName: config.name,
              toolName: config.tool || config.fetcher,
            },
            "Enrichment failed"
          );
          enrichments[config.name] = null;
        }
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
  config: EnrichmentConfig,
  rateLimitConfig?: RateLimitConfig
): Promise<any> {
  // Build parameters from paramMapping
  const params = buildParams(record, config.paramMapping);

  // Get tool name (from inline tool or fetcher reference)
  const toolName = config.tool || config.fetcher;
  if (!toolName) {
    throw new Error(`Enrichment ${config.name} missing tool or fetcher`);
  }

  // Use server-level scope so all tools share the same rate limiter
  // This is important for APIs like Fathom that have a global rate limit
  const scopeId = serverName;

  logger.info(
    {
      enrichmentName: config.name,
      toolName,
      params,
    },
    `[Enrichment] About to call ${config.name} (${toolName})`
  );

  // Apply rate limiting before the call
  logger.info(
    { scopeId },
    `[Enrichment] Applying rate limit for ${scopeId}...`
  );
  const delayMs = await applyRateLimit(rateLimitConfig, scopeId);
  if (delayMs > 0) {
    logger.info(
      { delayMs },
      `[Enrichment] Rate limit applied - waited ${delayMs}ms`
    );
  }

  logger.info(
    { enrichmentName: config.name, toolName },
    `[Enrichment] Making API call to ${toolName}...`
  );
  const callStartTime = Date.now();

  // Check if server is paused due to rate limiting
  await rateLimiterManager.waitIfPaused(serverName);

  let response: any;
  let caughtError: Error | undefined;

  try {
    // Call MCP tool
    response = await mcpClientManager.callTool(serverName, toolName, params);

    const callDuration = Date.now() - callStartTime;
    logger.info(
      { enrichmentName: config.name, callDuration },
      `[Enrichment] API call to ${toolName} succeeded in ${callDuration}ms`
    );
  } catch (err: any) {
    const callDuration = Date.now() - callStartTime;
    logger.error(
      { enrichmentName: config.name, callDuration, error: err.message },
      `[Enrichment] API call to ${toolName} failed after ${callDuration}ms`
    );
    caughtError = err;
    response = err.response; // MCP errors may have response attached
  }

  // Check for rate limit in response or error
  const rateLimitInfo = detectRateLimitError(response, caughtError);

  if (rateLimitInfo.isRateLimit) {
    logger.warn(
      {
        enrichmentName: config.name,
        toolName,
        errorMessage: rateLimitInfo.errorMessage?.substring(0, 200),
      },
      "Enrichment hit rate limit, retrying after delay"
    );

    // Notify rate limiter to adjust
    notifyRateLimitError(
      rateLimitConfig,
      scopeId,
      serverName,
      rateLimitInfo.retryAfter
    );

    // Handle rate limit and wait
    await handleRateLimitError(
      rateLimitConfig,
      scopeId,
      rateLimitInfo.retryAfter
    );

    // Apply rate limit again before retry
    logger.info(
      { scopeId },
      `[Enrichment] Applying rate limit before retry...`
    );
    await applyRateLimit(rateLimitConfig, scopeId);

    // Retry the request
    try {
      response = await mcpClientManager.callTool(serverName, toolName, params);
      logger.info(
        { enrichmentName: config.name },
        `[Enrichment] Retry succeeded for ${toolName}`
      );
      notifySuccess(rateLimitConfig, scopeId);
    } catch (retryErr: any) {
      logger.error(
        { enrichmentName: config.name, error: retryErr.message },
        `[Enrichment] Retry failed for ${toolName}`
      );
      throw retryErr;
    }
  } else if (caughtError) {
    // Non-rate-limit error, re-throw
    throw caughtError;
  } else {
    // Success on first try
    notifySuccess(rateLimitConfig, scopeId);
  }

  logger.debug(
    {
      enrichmentName: config.name,
      responseType: typeof response,
      hasContent: response?.content !== undefined,
    },
    "Received enrichment response"
  );

  // Extract result using resultPath if provided
  if (config.resultPath) {
    const extracted = extractPath(response, config.resultPath);
    logger.debug(
      {
        enrichmentName: config.name,
        resultPath: config.resultPath,
        extractedType: typeof extracted,
        extractedValue:
          typeof extracted === "string"
            ? extracted.substring(0, 100)
            : extracted,
      },
      "Extracted enrichment result using resultPath"
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
 * Extract value from response using JSONPath
 * Supports array syntax like $.content[0].text
 */
function extractPath(obj: any, path: string): any {
  try {
    const result = JSONPath({ path, json: obj, wrap: false });
    return result;
  } catch (err) {
    logger.warn(
      { path, error: err },
      "Failed to extract path from object, returning undefined"
    );
    return undefined;
  }
}
