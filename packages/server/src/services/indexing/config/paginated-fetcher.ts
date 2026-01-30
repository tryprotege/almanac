import type { FetcherConfig, RateLimitConfig } from '@almanac/indexing-engine';
import { mcpClientManager } from '../../../mcp/client.js';
import { JSONPath } from 'jsonpath-plus';
import {
  applyRateLimit,
  handleRateLimitError,
  notifySuccess,
  notifyRateLimitError,
  rateLimiterManager,
} from './rate-limiter.js';
import { detectRateLimitError } from './mcp-error-parser.js';
import { applyCutoffDateToParams } from './config-indexer.service.js';
import logger from '../../../utils/logger.js';
import { env } from '../../../env.js';
import { executeProcessor } from '@almanac/indexing-engine';
import { buildParams } from './enrichment-executor.js';

export interface PageResult {
  records: any[];
  nextCursor?: string;
  hasMore: boolean;
  mcpError?: string; // MCP error message if tool call failed
  rawResponse?: any; // Raw MCP response for debugging
}

export interface ForEachContext {
  [fetcherName: string]: any[];
}

export interface StartingPointContext {
  [startingPointName: string]: Array<string | Record<string, any>>;
}

/**
 * Fetch records by iterating over starting point values
 * Similar to forEach but sources values from starting points instead of previous fetchers
 */
export async function* fetchWithSeedFrom(
  serverName: string,
  config: FetcherConfig,
  startingPointValues: StartingPointContext,
): AsyncGenerator<PageResult> {
  const { seedFrom } = config;

  if (!seedFrom) {
    throw new Error(`fetchWithSeedFrom called but seedFrom config is missing`);
  }

  // Get starting point values
  const values = startingPointValues[seedFrom.startingPoint];
  if (!values || values.length === 0) {
    logger.warn(`seedFrom starting point "${seedFrom.startingPoint}" has no values`);
    yield { records: [], hasMore: false };
    return;
  }

  logger.debug(
    `[seedFrom] Processing ${values.length} values from starting point "${seedFrom.startingPoint}"`,
  );

  const concurrency = seedFrom.concurrency ?? 3;
  const continueOnError = seedFrom.continueOnError ?? true;
  const maxRetries = seedFrom.retries ?? 2;

  const allResults: any[] = [];
  const errors: Array<{ value: any; error: Error }> = [];

  // Process in batches for concurrency control
  for (let i = 0; i < values.length; i += concurrency) {
    const batch = values.slice(i, i + concurrency);

    logger.debug(
      `[seedFrom] Processing batch ${
        Math.floor(i / concurrency) + 1
      }/${Math.ceil(values.length / concurrency)} (${batch.length} items)`,
    );

    const batchPromises = batch.map(async (value: any) => {
      // Build params from static params + mapped params
      const params = { ...config.params };

      // Apply cutoff date parameters if configured
      applyCutoffDateToParams(params, config);

      // Map starting point value to tool parameters
      for (const [paramName, jsonPath] of Object.entries(seedFrom.paramMapping)) {
        // If jsonPath starts with $, treat as JSONPath expression
        // Otherwise, use as literal value
        if (typeof jsonPath === 'string' && jsonPath.startsWith('$')) {
          // For simple string values, wrap in object for JSONPath
          const source = typeof value === 'string' ? { value } : value;
          const extractedValue = JSONPath({
            path: jsonPath === '$' ? '$.value' : jsonPath,
            json: source,
            wrap: false,
          });
          if (extractedValue !== undefined) {
            params[paramName] = extractedValue;
          }
        } else {
          // Literal value
          params[paramName] = jsonPath;
        }
      }

      logger.debug(
        `[seedFrom] Calling ${config.tool} with params: ${JSON.stringify(params).substring(
          0,
          200,
        )}`,
      );

      // Call with retries
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Apply rate limiting before each attempt (including retries)
          if (attempt > 0) {
            logger.debug(`[seedFrom] Applying rate limit before retry attempt ${attempt + 1}...`);
            await applyRateLimit(config.rateLimit, serverName);
          }

          // Create a minimal config for the tool call
          const callConfig: FetcherConfig = {
            tool: config.tool,
            resultPath: config.resultPath,
            params,
            rateLimit: config.rateLimit,
            arrayPath: config.arrayPath, // Include arrayPath if present
            formatProcessor: (config as any).formatProcessor, // Include formatProcessor if present
          };
          const result = await fetchPage(serverName, callConfig, params, config.rateLimit);

          logger.debug(`[seedFrom] Call succeeded, got ${result.records.length} records`);
          return result.records;
        } catch (err) {
          lastError = err as Error;
          if (attempt < maxRetries) {
            logger.warn(
              `[seedFrom] Call failed (attempt ${attempt + 1}/${maxRetries}), retrying...`,
            );
            await sleep(1000 * (attempt + 1)); // Exponential backoff
          }
        }
      }

      throw lastError;
    });

    const results = await Promise.allSettled(batchPromises);

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        allResults.push(...(result.value || []));
      } else {
        errors.push({ value: batch[j], error: result.reason });
        logger.error(
          { value: batch[j], error: result.reason },
          `[seedFrom] Error processing value`,
        );
        if (!continueOnError) {
          throw result.reason;
        }
      }
    }
  }

  if (errors.length > 0) {
    logger.warn(`[seedFrom] Completed with ${errors.length} errors out of ${values.length} values`);
  } else {
    logger.debug(
      `[seedFrom] Successfully processed all ${values.length} values, got ${allResults.length} total records`,
    );
  }

  yield {
    records: allResults,
    hasMore: false,
  };
}

/**
 * Fetch records by iterating over results from a previous fetcher
 * Calls the tool once per item from the source, with mapped params
 * OR uses batch mode to call with array of values (more efficient)
 */
export async function* fetchWithForEach(
  serverName: string,
  config: FetcherConfig,
  fetcherResults: ForEachContext,
): AsyncGenerator<PageResult> {
  const { forEach } = config;

  if (!forEach) {
    throw new Error(`fetchWithForEach called but forEach config is missing`);
  }

  // Check if batch mode is enabled
  if (forEach.batchMode) {
    yield* fetchWithBatchMode(serverName, config, fetcherResults);
    return;
  }

  // Handle array sources (multiple fetchers as sources)
  let sourceRecords: any[] = [];

  if (Array.isArray(forEach.source)) {
    // Multiple sources - combine records from each using corresponding path
    const sources = forEach.source;
    const paths = Array.isArray(forEach.path) ? forEach.path : [forEach.path];

    for (let i = 0; i < sources.length; i++) {
      const sourceName = sources[i];
      const sourcePath = paths[i] || paths[0]; // Use corresponding path or first path

      const records = fetcherResults[sourceName];
      if (!records || records.length === 0) {
        logger.debug(`forEach source "${sourceName}" has no records, skipping`);
        continue;
      }

      // Apply path filter to this source's records
      const filtered = JSONPath({
        path: sourcePath,
        json: records,
      });

      if (filtered && filtered.length > 0) {
        sourceRecords.push(...filtered);
        logger.debug(
          `forEach: extracted ${filtered.length} records from source "${sourceName}" using path "${sourcePath}"`,
        );
      }
    }

    if (sourceRecords.length === 0) {
      logger.warn(`forEach: no records found from any sources: ${sources.join(', ')}`);
      yield { records: [], hasMore: false };
      return;
    }

    logger.info(`forEach: combined ${sourceRecords.length} records from ${sources.length} sources`);
  } else {
    // Single source - original behavior
    sourceRecords = fetcherResults[forEach.source];
    if (!sourceRecords || sourceRecords.length === 0) {
      logger.warn(`forEach source "${forEach.source}" has no records`);
      yield { records: [], hasMore: false };
      return;
    }
  }

  // Extract iteration items using JSONPath
  // If we already filtered with paths above (array source case), use identity path
  const iterationPath = Array.isArray(forEach.source) ? '$[*]' : forEach.path;
  const iterationItems = JSONPath({
    path: iterationPath,
    json: sourceRecords,
  });

  if (!iterationItems || iterationItems.length === 0) {
    logger.warn(`forEach path "${forEach.path}" matched no items`);
    yield { records: [], hasMore: false };
    return;
  }

  const concurrency = forEach.concurrency ?? 20;
  const continueOnError = forEach.continueOnError ?? true;
  const maxRetries = forEach.retries ?? 2;

  // Process in batches for concurrency control
  const allResults: any[] = [];
  const errors: Array<{ item: any; error: Error }> = [];

  for (let i = 0; i < iterationItems.length; i += concurrency) {
    const batch = iterationItems.slice(i, i + concurrency);

    const batchPromises = batch.map(async (item: any) => {
      // Build params from static params + mapped params
      const params = { ...(forEach.params || {}), ...buildParams(item, forEach.paramMapping) };

      // Apply cutoff date parameters if configured
      applyCutoffDateToParams(params, config);

      // Call with retries
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Apply rate limiting before each attempt (including retries)
          if (attempt > 0) {
            logger.debug(`[forEach] Applying rate limit before retry attempt ${attempt + 1}...`);
            await applyRateLimit(config.rateLimit, serverName);
          }

          // Create a minimal config for the tool call (without arrayPath since forEach doesn't need it)
          const callConfig: FetcherConfig = {
            tool: config.tool,
            resultPath: config.resultPath,
            params,
            rateLimit: config.rateLimit,
            arrayPath: config.arrayPath, // Include arrayPath if present
            formatProcessor: (config as any).formatProcessor, // Include formatProcessor if present
          };
          const result = await fetchPage(serverName, callConfig, params, config.rateLimit);
          return result.records;
        } catch (err) {
          lastError = err as Error;
          if (attempt < maxRetries) {
            await sleep(1000 * (attempt + 1)); // Exponential backoff
          }
        }
      }

      throw lastError;
    });

    const results = await Promise.allSettled(batchPromises);

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        allResults.push(...(result.value || []));
      } else {
        errors.push({ item: batch[j], error: result.reason });
        if (!continueOnError) {
          throw result.reason;
        }
      }
    }
  }

  if (errors.length > 0) {
    logger.warn(
      { errorCount: errors.length, errors: errors.map((e) => e.error.message) },
      `forEach completed with errors`,
    );
  }

  yield {
    records: allResults,
    hasMore: false,
  };
}

/**
 * Fetch using batch mode - call tool with array of values instead of one-by-one
 * More efficient when the tool accepts array parameters
 */
async function* fetchWithBatchMode(
  serverName: string,
  config: FetcherConfig,
  fetcherResults: ForEachContext,
): AsyncGenerator<PageResult> {
  const { forEach } = config;

  if (!forEach || !forEach.batchMode) {
    throw new Error(`fetchWithBatchMode called but batchMode config is missing`);
  }

  // Get source records from previous fetcher
  const sourceRecords = fetcherResults[forEach.source];
  if (!sourceRecords || sourceRecords.length === 0) {
    logger.warn(`forEach source "${forEach.source}" has no records`);
    yield { records: [], hasMore: false };
    return;
  }

  // Extract iteration items using JSONPath
  const iterationItems = JSONPath({
    path: forEach.path,
    json: sourceRecords,
  });

  if (!iterationItems || iterationItems.length === 0) {
    logger.warn(`forEach path "${forEach.path}" matched no items`);
    yield { records: [], hasMore: false };
    return;
  }

  // Extract values from each item using valueMapping
  const values: any[] = [];
  for (const item of iterationItems) {
    const value = JSONPath({
      path: forEach.batchMode.valueMapping,
      json: item,
      wrap: false,
    });
    if (value !== undefined) {
      values.push(value);
    }
  }

  if (values.length === 0) {
    logger.warn(`forEach batchMode: no values extracted from items`);
    yield { records: [], hasMore: false };
    return;
  }

  const batchSize = forEach.batchMode.batchSize ?? 100;
  const continueOnError = forEach.continueOnError ?? true;
  const maxRetries = forEach.retries ?? 2;

  const allResults: any[] = [];
  const errors: Array<{ batch: any[]; error: Error }> = [];

  // Split into batches
  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);

    logger.debug(
      `Calling ${config.tool} with batch of ${batch.length} items (${i}-${
        i + batch.length
      }/${values.length})`,
    );

    // Build params with batch array
    const params = {
      ...config.params,
      [forEach.batchMode.batchParam]: batch,
    };

    // Apply cutoff date parameters if configured
    applyCutoffDateToParams(params, config);

    // Call with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Create a minimal config for the tool call
        const callConfig: FetcherConfig = {
          tool: config.tool,
          resultPath: config.resultPath,
          params,
          rateLimit: config.rateLimit,
          arrayPath: config.arrayPath, // Include arrayPath if present
          formatProcessor: (config as any).formatProcessor, // Include formatProcessor if present
        };
        const result = await fetchPage(serverName, callConfig, params, config.rateLimit);
        allResults.push(...result.records);
        break; // Success
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          logger.warn(`Batch call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`);
          await sleep(1000 * (attempt + 1)); // Exponential backoff
        }
      }
    }

    if (lastError) {
      errors.push({ batch, error: lastError });
      if (!continueOnError) {
        throw lastError;
      }
    }
  }

  if (errors.length > 0) {
    logger.warn(
      {
        errorCount: errors.length,
        errors: errors.map((e) => e.error.message),
      },
      `forEach batch mode completed with batch errors`,
    );
  }

  yield {
    records: allResults,
    hasMore: false,
  };
}

/**
 * Fetch all records with pagination
 * Yields PageResult objects containing records and raw MCP response
 */
export async function* fetchAll(
  serverName: string,
  config: FetcherConfig,
  initialParams: Record<string, any> = {},
): AsyncGenerator<PageResult> {
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params = { ...config.params, ...initialParams };

    // Apply cutoff date parameters if configured
    applyCutoffDateToParams(params, config);

    // Add pagination parameters
    if (config.pagination) {
      addPaginationParams(params, cursor, config.pagination);
    }

    // Fetch page with rate limiting
    const result = await fetchPage(serverName, config, params, config.rateLimit);

    // Always yield result (even if 0 records) so we can access raw response
    yield result;

    // Update cursor and hasMore
    cursor = result.nextCursor;
    hasMore = result.hasMore;

    // If no pagination config, break after first page
    if (!config.pagination || config.pagination.type === 'none') {
      break;
    }
  }
}

/**
 * Extract records from MCP response format
 * MCP responses come in format: {content: [{type: "text", text: "...JSON..."}]}
 * OR direct data arrays: {content: [{id: "..., ...}], pageInfo: {...}}
 * OR pagination wrappers: {content: [...], pageInfo: {...}}
 */
async function extractRecordsFromMCPResponse(
  response: any,
  formatProcessor?: { name: string; options?: any },
): Promise<{
  records: any[];
  error?: string;
}> {
  // Check for pagination wrapper format first (e.g., Linear)
  // {content: [{id: "...", ...}], pageInfo: {...}}
  if (
    response?.content &&
    Array.isArray(response.content) &&
    response.pageInfo &&
    response.content.length > 0 &&
    response.content[0]?.id
  ) {
    // This is a pagination wrapper - content is the array of records
    return { records: response.content };
  }

  // If response has content array (MCP format), extract the text and parse it
  if (response?.content && Array.isArray(response.content)) {
    const textContent = response.content.find((c: any) => c.type === 'text');

    if (textContent?.text) {
      let text = textContent.text.trim();

      // Check if it's an error message (not JSON)
      if (
        text.startsWith('Entity not') ||
        text.startsWith('Error') ||
        text.startsWith('Failed') ||
        text.startsWith('MCP error')
      ) {
        logger.warn(`MCP response contains error message: ${text.substring(0, 100)}`);
        return { records: [], error: text }; // Return error info
      }

      // Apply format processor if configured (e.g., CSV to JSON)
      if (formatProcessor && formatProcessor.name === 'csv-to-json') {
        // Check if text looks like CSV (has comma-separated values and no JSON markers)
        if (!text.startsWith('[') && !text.startsWith('{') && text.includes(',')) {
          logger.debug(`[fetchPage] Applying CSV-to-JSON format processor`);
          try {
            const processed = await executeProcessor(
              formatProcessor.name,
              text,
              formatProcessor.options,
            );
            // Return the result even if empty - this IS the expected format
            if (Array.isArray(processed)) {
              logger.debug(`[fetchPage] CSV processor converted ${processed.length} rows to JSON`);
              return { records: processed };
            }
            logger.warn(`[fetchPage] CSV processor returned non-array: ${typeof processed}`);
          } catch (err) {
            logger.error(
              { err },
              `[fetchPage] CSV processor failed - this is unexpected for CSV data`,
            );
            // For CSV data, if processor fails, return empty rather than trying JSON.parse
            return { records: [], error: `CSV parsing failed: ${err}` };
          }
        }
      }

      try {
        const parsed = JSON.parse(text);

        // Check if parsed JSON is an error object
        if (parsed.error && typeof parsed.error === 'string') {
          logger.warn(`MCP response contains error object: ${parsed.error.substring(0, 100)}`);
          return { records: [], error: parsed.error };
        }

        // Could be an array or an object
        if (Array.isArray(parsed)) {
          return { records: parsed };
        }

        // Check for common nested array patterns
        if (parsed.content && Array.isArray(parsed.content)) {
          // Linear MCP format: {content: [...], pageInfo: {...}}
          return { records: parsed.content };
        }
        if (parsed.results && Array.isArray(parsed.results)) {
          return { records: parsed.results };
        }
        if (parsed.records && Array.isArray(parsed.records)) {
          return { records: parsed.records };
        }
        if (parsed.data) {
          return {
            records: Array.isArray(parsed.data) ? parsed.data : [parsed.data],
          };
        }

        // Single object - return as array
        return { records: [parsed] };
      } catch (err) {
        // If parsing fails, return empty array
        logger.warn({ err }, 'Failed to parse MCP response text as JSON');
        return { records: [] };
      }
    }

    // Handle direct content arrays (not text wrappers)
    // If content[0] has an 'id' field, it's likely a direct data array
    if (response.content.length > 0 && response.content[0]?.id) {
      return { records: response.content };
    }
  }

  // Fallback to existing logic for non-MCP responses
  if (response.records && Array.isArray(response.records)) {
    return { records: response.records };
  }
  if (response.results && Array.isArray(response.results)) {
    return { records: response.results };
  }

  // Single response object
  return { records: [response] };
}

/**
 * Fetch a single page
 */
export async function fetchPage(
  serverName: string,
  config: FetcherConfig,
  params: Record<string, any>,
  rateLimitConfig?: RateLimitConfig,
): Promise<PageResult> {
  // Use server-level scope so all tools share the same rate limiter
  // This is important for APIs like Fathom that have a global rate limit
  const scopeId = serverName;

  logger.debug(
    `[Fetcher] About to call ${config.tool} with params: ${JSON.stringify(params, null, 2)}`,
  );

  // Apply rate limiting before making the call
  logger.debug(`[Fetcher] Applying rate limit for ${scopeId}...`);
  const delayMs = await applyRateLimit(rateLimitConfig, scopeId);
  if (delayMs > 0) {
    logger.debug(`[Fetcher] Rate limit applied - waited ${delayMs}ms`);
  }

  logger.debug(`[Fetcher] Making API call to ${config.tool}...`);
  const callStartTime = Date.now();

  // Check if server is paused due to rate limiting
  await rateLimiterManager.waitIfPaused(serverName);

  let response: any;
  let caughtError: Error | undefined;

  try {
    response = await mcpClientManager.callTool(serverName, config.tool, params);

    const callDuration = Date.now() - callStartTime;
    logger.debug(`[Fetcher] API call to ${config.tool} succeeded in ${callDuration}ms`);
  } catch (err: any) {
    const callDuration = Date.now() - callStartTime;
    logger.error(
      { err, callDuration },
      `[Fetcher] API call to ${config.tool} failed after ${callDuration}ms`,
    );
    caughtError = err;
    response = err.response; // MCP errors may have response attached
  }

  // Check for rate limit in response or error
  const rateLimitInfo = detectRateLimitError(response, caughtError);

  if (rateLimitInfo.isRateLimit) {
    logger.warn(
      `[Fetcher] Rate limit detected for ${
        config.tool
      }: ${rateLimitInfo.errorMessage?.substring(0, 200)}`,
    );

    // Notify rate limiter to adjust
    notifyRateLimitError(rateLimitConfig, scopeId, serverName, rateLimitInfo.retryAfter);

    // Handle rate limit and wait
    await handleRateLimitError(rateLimitConfig, scopeId, rateLimitInfo.retryAfter);

    // Apply rate limit again before retry
    logger.debug(`[Fetcher] Applying rate limit before retry...`);
    await applyRateLimit(rateLimitConfig, scopeId);

    // Retry the request
    try {
      response = await mcpClientManager.callTool(serverName, config.tool, params);
      logger.debug(`[Fetcher] Retry succeeded for ${config.tool}`);
      notifySuccess(rateLimitConfig, scopeId);
    } catch (retryErr: any) {
      logger.error({ retryErr }, `[Fetcher] Retry failed for ${config.tool}`);
      throw retryErr;
    }
  } else if (caughtError) {
    // Non-rate-limit error, re-throw
    throw caughtError;
  } else {
    // Success on first try
    notifySuccess(rateLimitConfig, scopeId);
  }

  // Log MCP response based on debug flag
  if (env.MCP_DEBUG_LOGS) {
    logger.debug({
      msg: '[fetchPage] Raw MCP response structure',
      response,
      toolName: config.tool,
    });
  } else {
    const responseSize = JSON.stringify(response).length;
    logger.debug({
      msg: `[fetchPage] MCP response for ${config.tool}`,
      responseSize: `${responseSize} bytes`,
      toolName: config.tool,
    });
  }

  // Extract records from MCP response format
  const parseResult = await extractRecordsFromMCPResponse(
    response,
    (config as any).formatProcessor,
  );

  logger.debug(`[fetchPage] Extracted ${parseResult.records.length} records before arrayPath`);

  // Check if MCP returned an error
  if (parseResult.error) {
    return {
      records: [],
      nextCursor: undefined,
      hasMore: false,
      mcpError: parseResult.error,
      rawResponse: response,
    };
  }

  // Validate that we have actual records
  if (!Array.isArray(parseResult.records)) {
    logger.warn(`fetchPage: extracted records is not an array, got ${typeof parseResult.records}`);
    return {
      records: [],
      nextCursor: undefined,
      hasMore: false,
      rawResponse: response,
    };
  }

  let finalRecords = parseResult.records;
  let paginationSource = finalRecords;

  // Apply arrayPath if configured to extract nested records
  if (config.arrayPath) {
    logger.debug(`[fetchPage] Applying arrayPath: ${config.arrayPath} to extract nested records`);
    logger.debug(
      `[fetchPage] Records before arrayPath: ${JSON.stringify(finalRecords, null, 2).substring(
        0,
        300,
      )}`,
    );

    try {
      // If we have a single wrapper object in an array, apply arrayPath to that object
      // This handles cases like [{items: [...], next_cursor: "..."}] from extractRecordsFromMCPResponse
      let target = finalRecords;
      if (
        finalRecords.length === 1 &&
        typeof finalRecords[0] === 'object' &&
        finalRecords[0] !== null &&
        !Array.isArray(finalRecords[0])
      ) {
        logger.debug(
          `[fetchPage] Detected single wrapper object, applying arrayPath to object directly`,
        );
        target = finalRecords[0];
        paginationSource = target; // Use the wrapper object for pagination info
      }

      const extractedRecords = JSONPath({
        path: config.arrayPath,
        json: target,
      });

      if (Array.isArray(extractedRecords)) {
        finalRecords = extractedRecords;
        if (extractedRecords.length > 0) {
          logger.debug(
            `[fetchPage] Successfully extracted ${finalRecords.length} records using arrayPath`,
          );
          logger.debug(
            `[fetchPage] First record after arrayPath: ${JSON.stringify(
              finalRecords[0],
              null,
              2,
            ).substring(0, 300)}`,
          );
        } else {
          logger.debug(
            `[fetchPage] arrayPath "${config.arrayPath}" extracted 0 records (empty array)`,
          );
        }
      } else {
        logger.warn(
          { extractedRecords },
          `[fetchPage] arrayPath "${config.arrayPath}" returned non-array`,
        );
      }
    } catch (err) {
      logger.error({ err }, `[fetchPage] Error applying arrayPath`);
    }
  }

  // Extract pagination info from the appropriate source
  let nextCursor: string | undefined;
  let hasMore = false;

  if (config.pagination) {
    // Try to extract cursor from paginationSource using configured path
    if (config.pagination.cursorPath) {
      try {
        const extractedCursor = JSONPath({
          path: config.pagination.cursorPath,
          json: paginationSource,
          wrap: false,
        });
        nextCursor = extractedCursor;
        logger.debug(
          `[fetchPage] Extracted cursor from path "${config.pagination.cursorPath}": ${nextCursor}`,
        );
      } catch (err) {
        logger.warn(
          { err },
          `[fetchPage] Failed to extract cursor using path "${config.pagination.cursorPath}"`,
        );
      }
    }

    // Determine if there are more pages
    if (nextCursor) {
      hasMore = true;
    } else {
      hasMore = false;
    }
  }

  return {
    records: finalRecords,
    nextCursor,
    hasMore,
    rawResponse: response,
  };
}

/**
 * Add pagination parameters to request
 */
function addPaginationParams(
  params: Record<string, any>,
  cursor: string | undefined,
  config: FetcherConfig['pagination'],
): void {
  if (!config) return;

  switch (config.type) {
    case 'cursor':
      if (config.limitParam) {
        params[config.limitParam] = 100; // Default page size
      }
      if (cursor && config.cursorParam) {
        params[config.cursorParam] = cursor;
      }
      break;

    case 'offset':
      if (config.limitParam) {
        params[config.limitParam] = 100;
      }
      if (config.offsetParam) {
        const currentOffset = params[config.offsetParam] || 0;
        params[config.offsetParam] = currentOffset + 100;
      }
      break;

    case 'none':
    default:
      break;
  }
}

/**
 * Helper function for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
