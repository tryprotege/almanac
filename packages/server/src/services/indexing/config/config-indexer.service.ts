import type {
  FetcherConfig,
  IndexingConfig,
  RecordTypeConfig,
  TransformedRecord,
} from "@ebee-oss/indexing-engine";
import { transformRecord } from "@ebee-oss/indexing-engine";
import {
  fetchAll as fetchPaginated,
  fetchWithForEach,
  fetchWithSeedFrom,
  type ForEachContext,
  type StartingPointContext,
} from "./paginated-fetcher.js";
import { StartingPointResolver } from "./starting-point-resolver.service.js";
import { enrich as enrichRecord } from "./enrichment-executor.js";
import { extractEntities, extractRelationships } from "./entity-extractor.js";
import { MCPSyncStateModel } from "../../../models/mcp-sync-state.model.js";
import { DataSourceModel } from "../../../models/data-source.model.js";
import { mcpClientManager } from "../../../mcp/client.js";
import { rateLimiterManager } from "./rate-limiter.js";
import { ContentAggregatorService } from "./content-aggregator.service.js";
import { env } from "../../../env.js";
import logger from "../../../utils/logger.js";
import { JSONPath } from "jsonpath-plus";

export interface IndexProgress {
  fetcherName: string;
  recordType: string;
  recordsProcessed: number;
  totalRecords: number;
  status: "fetching" | "enriching" | "transforming" | "complete" | "error";
  error?: string;
  queueSize?: number;
  isBackpressure?: boolean;
}

/**
 * Check if record should be filtered by cutoff date
 */
function shouldFilterByCutoffDate(fetcherConfig: FetcherConfig): boolean {
  if (!fetcherConfig.cutoffDate) return false;
  if (!env.SYNC_CUTOFF_DATE) return false;

  const strategy = fetcherConfig.cutoffDate.strategy;
  return strategy === "post_fetch" || strategy === "both";
}

/**
 * Extract date from record for cutoff comparison
 */
function extractRecordDate(
  record: any,
  fetcherConfig: FetcherConfig
): Date | null {
  if (!fetcherConfig.cutoffDate?.dateFieldPath) return null;

  try {
    const dateValue = JSONPath({
      path: fetcherConfig.cutoffDate.dateFieldPath,
      json: record,
      wrap: false,
    });

    if (!dateValue) return null;

    // Handle different date formats
    if (typeof dateValue === "number") {
      // Unix timestamp (seconds or milliseconds)
      return dateValue > 10000000000
        ? new Date(dateValue)
        : new Date(dateValue * 1000);
    }

    return new Date(dateValue);
  } catch (error) {
    logger.error(
      { err: error, path: fetcherConfig.cutoffDate.dateFieldPath },
      "Failed to extract date from record"
    );
    return null;
  }
}

/**
 * Add cutoff date parameter to API call if configured
 */
export function applyCutoffDateToParams(
  params: Record<string, any>,
  fetcherConfig: FetcherConfig
): void {
  if (!env.SYNC_CUTOFF_DATE) return;
  if (!fetcherConfig.cutoffDate) return;

  const config = fetcherConfig.cutoffDate;
  const strategy = config.strategy;

  if ((strategy === "api" || strategy === "both") && config.apiParam) {
    const cutoffDate = new Date(env.SYNC_CUTOFF_DATE);

    // Format based on API requirements
    switch (config.apiFormat) {
      case "unix":
        params[config.apiParam] = Math.floor(
          cutoffDate.getTime() / 1000
        ).toString();
        break;
      case "unix_ms":
        params[config.apiParam] = cutoffDate.getTime().toString();
        break;
      case "iso8601":
      default:
        params[config.apiParam] = cutoffDate.toISOString();
    }

    logger.info(
      {
        param: config.apiParam,
        value: params[config.apiParam],
        cutoffDate: env.SYNC_CUTOFF_DATE,
        strategy: config.strategy,
      },
      "Applied SYNC_CUTOFF_DATE to API params"
    );
  }
}

// Configuration for backpressure
const BACKPRESSURE_CONFIG = {
  // Maximum number of records in flight before applying backpressure
  MAX_QUEUE_SIZE: 100,
  // Time to wait when backpressure is applied (ms)
  BACKPRESSURE_DELAY: 1000,
  // Check backpressure every N records
  CHECK_INTERVAL: 10,
};

/**
 * Index all records from all fetchers
 */
export async function* indexAll(
  config: IndexingConfig,
  serverName: string,
  userProvidedStartingPoints?: Record<string, string[]>
): AsyncGenerator<{
  records: TransformedRecord[];
  progress: IndexProgress;
}> {
  // Ensure MCP client is connected before indexing
  if (!mcpClientManager.isConnected(serverName)) {
    logger.info(
      { serverName },
      "MCP client not connected, attempting to connect before indexing"
    );

    try {
      const dataSource = await DataSourceModel.findOne({ name: serverName });
      if (!dataSource) {
        throw new Error(`Data source '${serverName}' not found`);
      }

      if (dataSource.isDisabled) {
        throw new Error(`Data source '${serverName}' is disabled`);
      }

      // Validate config
      const validationError = dataSource.validateMCPConfig();
      if (validationError) {
        throw new Error(
          `Invalid MCP config for '${serverName}': ${validationError}`
        );
      }

      // Connect to MCP server
      await mcpClientManager.connect(dataSource);
      logger.info(
        { serverName },
        "Successfully connected to MCP server before indexing"
      );
    } catch (connectError) {
      logger.error(
        { err: connectError, serverName },
        "Failed to connect to MCP server before indexing"
      );
      throw new Error(
        `Cannot start indexing: Failed to connect to MCP server '${serverName}': ${
          connectError instanceof Error
            ? connectError.message
            : String(connectError)
        }`
      );
    }
  }

  // Resolve starting points if configured
  let startingPointValues: StartingPointContext = {};
  if (config.startingPoints && config.startingPoints.length > 0) {
    try {
      startingPointValues = await StartingPointResolver.resolve(
        config.startingPoints,
        userProvidedStartingPoints,
        serverName,
        config.fetchers
      );
      logger.info(
        {
          serverName,
          startingPointCount: Object.keys(startingPointValues).length,
          totalValues: Object.values(startingPointValues).reduce(
            (sum, vals) => sum + vals.length,
            0
          ),
        },
        "Starting points resolved for indexing"
      );
    } catch (error) {
      logger.error(
        { err: error, serverName },
        "Failed to resolve starting points"
      );
      throw error;
    }
  }
  // Load tool classifications if available
  if (config.toolClassifications) {
    mcpClientManager.setToolClassifications(
      serverName,
      config.toolClassifications
    );
    logger.info(
      { serverName, count: Object.keys(config.toolClassifications).length },
      "Tool classifications loaded for indexing"
    );
  }

  // Track fetcher results for forEach references
  const fetcherResults: ForEachContext = {};

  // Initialize content aggregator service
  const contentAggregator = new ContentAggregatorService(config.fetchers);

  // Get fetchers in the correct order
  const orderedFetchers = getOrderedFetchers(config);

  for (const [fetcherName, fetcherConfig] of orderedFetchers) {
    // Skip aggregation-only fetchers (have paramsFromParent but no seedFrom/forEach)
    if (
      fetcherConfig.paramsFromParent &&
      !fetcherConfig.seedFrom &&
      !fetcherConfig.forEach
    ) {
      logger.debug(
        { fetcherName },
        "Skipping aggregation-only fetcher (no seedFrom/forEach)"
      );
      continue;
    }

    // Skip if this fetcher uses a write or search tool
    if (config.toolClassifications) {
      const classification = config.toolClassifications[fetcherConfig.tool];

      if (classification?.category === "write") {
        logger.warn(
          { fetcherName, toolName: fetcherConfig.tool },
          "Skipping fetcher that uses WRITE tool"
        );
        continue;
      }

      if (classification?.category === "search") {
        logger.info(
          { fetcherName, toolName: fetcherConfig.tool },
          "Skipping fetcher that uses SEARCH tool"
        );
        continue;
      }
    }

    logger.info(`Starting fetch: ${fetcherName}`);

    let recordsProcessed = 0;

    // Find record types for this fetcher
    const recordTypes = Object.values(config.recordTypes).filter(
      (rt) => rt.fetcher === fetcherName
    );

    // Store all records from this fetcher for forEach references
    const allFetcherRecords: any[] = [];

    // Determine which fetch method to use based on config
    let pageGenerator: AsyncGenerator<any>;

    if (fetcherConfig.seedFrom) {
      // Use seedFrom to iterate over starting point values
      pageGenerator = fetchWithSeedFrom(
        serverName,
        fetcherConfig,
        startingPointValues
      );
    } else if (fetcherConfig.forEach) {
      // Use forEach to iterate over previous fetcher results
      pageGenerator = fetchWithForEach(
        serverName,
        fetcherConfig,
        fetcherResults
      );
    } else {
      // Standard pagination
      pageGenerator = fetchPaginated(serverName, fetcherConfig);
    }

    // Fetch pages
    for await (const pageResult of pageGenerator) {
      // Check if server is paused due to rate limiting before processing page
      const wasPaused = await rateLimiterManager.waitIfPaused(serverName);
      if (wasPaused) {
        logger.info(
          { fetcherName, serverName },
          "Resumed after server pause due to rate limiting"
        );
      }

      // Apply cutoff date filtering if configured
      let filteredRecords = pageResult.records;
      if (shouldFilterByCutoffDate(fetcherConfig) && env.SYNC_CUTOFF_DATE) {
        const cutoffDate = new Date(env.SYNC_CUTOFF_DATE);
        const beforeFiltering = filteredRecords.length;

        filteredRecords = filteredRecords.filter((record: any) => {
          const recordDate = extractRecordDate(record, fetcherConfig);
          if (!recordDate) {
            logger.warn(
              { fetcherName, recordId: record.id || "unknown" },
              "Could not extract date from record for cutoff filtering, including record"
            );
            return true;
          }
          return recordDate >= cutoffDate;
        });

        const filtered = beforeFiltering - filteredRecords.length;
        if (filtered > 0) {
          logger.info(
            {
              fetcherName,
              filtered,
              remaining: filteredRecords.length,
              cutoffDate: env.SYNC_CUTOFF_DATE,
            },
            "Filtered records by SYNC_CUTOFF_DATE (post-fetch)"
          );
        }
      }

      // Store raw records for forEach references (after filtering)
      allFetcherRecords.push(...filteredRecords);
      const transformedBatch: TransformedRecord[] = [];

      // Check backpressure: if we have too many records in the current batch waiting
      // This helps prevent overwhelming the system with too many in-flight operations
      if (filteredRecords.length > BACKPRESSURE_CONFIG.MAX_QUEUE_SIZE) {
        logger.warn(
          {
            fetcherName,
            queueSize: filteredRecords.length,
            maxQueueSize: BACKPRESSURE_CONFIG.MAX_QUEUE_SIZE,
          },
          "Large page detected - processing with backpressure"
        );
      }

      // Process each record
      for (let i = 0; i < filteredRecords.length; i++) {
        const rawRecord = filteredRecords[i];

        // Apply backpressure check periodically
        if (i > 0 && i % BACKPRESSURE_CONFIG.CHECK_INTERVAL === 0) {
          // Check if we should pause due to queue size
          const currentQueueSize = transformedBatch.length;
          if (currentQueueSize >= BACKPRESSURE_CONFIG.MAX_QUEUE_SIZE) {
            logger.info(
              {
                fetcherName,
                queueSize: currentQueueSize,
                recordsProcessed: i,
                totalInPage: pageResult.records.length,
              },
              "Backpressure: pausing to allow queue to drain"
            );

            // Yield current batch to allow downstream processing
            if (transformedBatch.length > 0) {
              yield {
                records: transformedBatch.splice(0), // Remove all items
                progress: {
                  fetcherName,
                  recordType: recordTypes.map((rt) => rt.name).join(", "),
                  recordsProcessed,
                  totalRecords: recordsProcessed,
                  status: "transforming",
                  queueSize: currentQueueSize,
                  isBackpressure: true,
                },
              };
            }

            // Wait before continuing
            await sleep(BACKPRESSURE_CONFIG.BACKPRESSURE_DELAY);

            // Check if server is paused again
            await rateLimiterManager.waitIfPaused(serverName);
          }
        }

        // Match record to type
        const recordType = matchRecordType(rawRecord, recordTypes);

        if (!recordType) {
          logger.debug(
            { record: rawRecord },
            `No matching record type for record`
          );
          continue;
        }

        try {
          // Aggregate content if configured for this fetcher
          let recordWithAggregation = rawRecord;
          if (fetcherConfig.aggregateContent) {
            logger.debug(
              {
                fetcherName,
                aggregationFields: Object.keys(fetcherConfig.aggregateContent),
              },
              "Aggregating content from child fetchers"
            );

            try {
              const aggregatedData = await contentAggregator.aggregateContent(
                rawRecord,
                fetcherConfig.aggregateContent,
                {
                  dataSourceId: serverName,
                  syncConfigId: config.source,
                }
              );

              // Merge aggregated data with raw record
              for (const [fieldName, data] of Object.entries(aggregatedData)) {
                const aggConfig = fetcherConfig.aggregateContent[fieldName];
                const mergeStrategy = aggConfig.mergeStrategy || "merge";

                if (recordWithAggregation[fieldName] !== undefined) {
                  recordWithAggregation[fieldName] =
                    contentAggregator.mergeData(
                      recordWithAggregation[fieldName],
                      data,
                      mergeStrategy
                    );
                } else {
                  recordWithAggregation[fieldName] = data;
                }
              }

              // Extract fields if configured
              if (fetcherConfig.extractFromAggregation) {
                const extractedFields = contentAggregator.extractFields(
                  aggregatedData,
                  fetcherConfig.extractFromAggregation
                );
                Object.assign(recordWithAggregation, extractedFields);
              }

              logger.debug(
                {
                  fetcherName,
                  originalSize: JSON.stringify(rawRecord).length,
                  aggregatedSize: JSON.stringify(recordWithAggregation).length,
                },
                "Content aggregation completed"
              );
            } catch (aggError) {
              logger.error(
                { err: aggError, fetcherName },
                "Failed to aggregate content, using original record"
              );
              // Continue with original record if aggregation fails
            }
          }

          // Enrich if needed
          let enrichments = {};
          if (recordType.enrichments && recordType.enrichments.length > 0) {
            enrichments = await enrichRecord(
              serverName,
              recordWithAggregation,
              recordType.enrichments,
              config.rateLimit
            );
          }

          // Transform
          const transformed = await transformRecord(
            {
              record: recordWithAggregation,
              enrichments,
            },
            recordType,
            serverName
          );

          // Extract entities and relationships (NEW)
          if (recordType.entities && recordType.entities.length > 0) {
            transformed.extractedEntities = extractEntities(
              rawRecord,
              recordType.entities,
              serverName
            );
          }

          if (recordType.relationships && recordType.relationships.length > 0) {
            transformed.extractedRelationships = extractRelationships(
              rawRecord,
              transformed._id,
              recordType.name,
              recordType.relationships,
              serverName
            );
          }

          transformedBatch.push(transformed);
          recordsProcessed++;
        } catch (err) {
          logger.error(
            { err, recordType: recordType.name },
            `Error transforming record`
          );
        }
      }

      // Yield final batch for this page
      if (transformedBatch.length > 0) {
        yield {
          records: transformedBatch,
          progress: {
            fetcherName,
            recordType: recordTypes.map((rt) => rt.name).join(", "),
            recordsProcessed,
            totalRecords: recordsProcessed, // Unknown total
            status: "transforming",
            queueSize: transformedBatch.length,
          },
        };
      }
    }

    // Save results for future fetchers to reference
    fetcherResults[fetcherName] = allFetcherRecords;

    logger.info(`Completed fetch: ${fetcherName}`);
  }
}

/**
 * Run incremental sync using cursors from MCPSyncState
 */
export async function* runIncrementalSync(
  config: IndexingConfig,
  serverName: string
): AsyncGenerator<{
  records: TransformedRecord[];
  progress: IndexProgress;
}> {
  // Load tool classifications if available
  if (config.toolClassifications) {
    mcpClientManager.setToolClassifications(
      serverName,
      config.toolClassifications
    );
  }

  // Load sync state
  const syncState = await MCPSyncStateModel.findOne({
    serverName,
  });

  // Get fetchers in the correct order
  const orderedFetchers = getOrderedFetchers(config);

  for (const [fetcherName, fetcherConfig] of orderedFetchers) {
    // Skip if this fetcher uses a write or search tool
    if (config.toolClassifications) {
      const classification = config.toolClassifications[fetcherConfig.tool];

      if (classification?.category === "write") {
        logger.warn(
          { fetcherName, toolName: fetcherConfig.tool },
          "Skipping fetcher that uses WRITE tool for incremental sync"
        );
        continue;
      }

      if (classification?.category === "search") {
        logger.info(
          { fetcherName, toolName: fetcherConfig.tool },
          "Skipping fetcher that uses SEARCH tool for incremental sync"
        );
        continue;
      }
    }
    const params: Record<string, any> = {};

    // Add incremental sync params
    if (fetcherConfig.incrementalSync && syncState) {
      const cursor = syncState.fetcherCursors.get(fetcherName);
      if (cursor?.lastSyncAt && fetcherConfig.incrementalSync.sinceParam) {
        const sinceValue = formatSinceValue(
          cursor.lastSyncAt,
          fetcherConfig.incrementalSync.sinceFormat
        );
        params[fetcherConfig.incrementalSync.sinceParam] = sinceValue;
      }
    }

    // Use indexAll generator with initial params
    let recordsProcessed = 0;
    const recordTypes = Object.values(config.recordTypes).filter(
      (rt) => rt.fetcher === fetcherName
    );

    for await (const pageResult of fetchPaginated(
      serverName,
      fetcherConfig,
      params
    )) {
      const transformedBatch: TransformedRecord[] = [];

      for (const rawRecord of pageResult.records) {
        const recordType = matchRecordType(rawRecord, recordTypes);
        if (!recordType) continue;

        try {
          let enrichments = {};
          if (recordType.enrichments && recordType.enrichments.length > 0) {
            enrichments = await enrichRecord(
              serverName,
              rawRecord,
              recordType.enrichments,
              config.rateLimit
            );
          }

          const transformed = await transformRecord(
            {
              record: rawRecord,
              enrichments,
            },
            recordType,
            serverName
          );

          // Extract entities and relationships
          if (recordType.entities && recordType.entities.length > 0) {
            transformed.extractedEntities = extractEntities(
              rawRecord,
              recordType.entities,
              serverName
            );
          }

          if (recordType.relationships && recordType.relationships.length > 0) {
            transformed.extractedRelationships = extractRelationships(
              rawRecord,
              transformed._id,
              recordType.name,
              recordType.relationships,
              serverName
            );
          }

          transformedBatch.push(transformed);
          recordsProcessed++;
        } catch (err) {
          logger.error({ err }, `Error transforming record`);
        }
      }

      // Update sync state
      if (syncState) {
        const cursor = syncState.fetcherCursors.get(fetcherName) || {
          lastSyncAt: new Date(),
          syncedCount: 0,
        };
        cursor.lastSyncAt = new Date();
        cursor.syncedCount += transformedBatch.length;
        syncState.fetcherCursors.set(fetcherName, cursor);
        syncState.lastIncrementalSyncAt = new Date();
        await syncState.save();
      }

      yield {
        records: transformedBatch,
        progress: {
          fetcherName,
          recordType: recordTypes.map((rt) => rt.name).join(", "),
          recordsProcessed,
          totalRecords: recordsProcessed,
          status: "transforming",
        },
      };
    }
  }
}

/**
 * Match a raw record to a record type based on detection config
 */
function matchRecordType(
  record: any,
  recordTypes: RecordTypeConfig[]
): RecordTypeConfig | null {
  for (const recordType of recordTypes) {
    // Handle missing detection config - default to matching
    if (!recordType.detection) {
      logger.warn(
        { recordType: recordType.name },
        "Record type missing detection config, defaulting to match"
      );
      return recordType;
    }

    if (recordType.detection.always) {
      return recordType;
    }

    if (recordType.detection.condition) {
      try {
        // Simple eval of condition (e.g., "record.object === 'page'")
        const conditionFn = new Function(
          "record",
          `return ${recordType.detection.condition}`
        );
        if (conditionFn(record)) {
          return recordType;
        }
      } catch (err) {
        logger.error(
          { err, condition: recordType.detection.condition },
          `Error evaluating detection condition`
        );
      }
    }
  }

  return null;
}

/**
 * Format since value based on format type
 */
function formatSinceValue(
  date: Date,
  format: "iso8601" | "unix" | "unix_ms" | undefined
): string | number {
  switch (format) {
    case "unix":
      return Math.floor(date.getTime() / 1000);
    case "unix_ms":
      return date.getTime();
    case "iso8601":
    default:
      return date.toISOString();
  }
}

/**
 * Helper function for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get fetchers in the correct execution order based on syncOrder
 * Falls back to Object.entries() order if syncOrder is not specified
 */
function getOrderedFetchers(
  config: IndexingConfig
): Array<[string, FetcherConfig]> {
  if (config.syncOrder && config.syncOrder.length > 0) {
    logger.info(
      { syncOrder: config.syncOrder },
      "Using explicit sync order for fetchers"
    );

    const ordered: Array<[string, any]> = [];
    const fetcherEntries = Object.entries(config.fetchers);

    // Add fetchers in syncOrder sequence
    for (const fetcherName of config.syncOrder) {
      const entry = fetcherEntries.find(([name]) => name === fetcherName);
      if (entry) {
        ordered.push(entry);
      } else {
        logger.warn(
          { fetcherName },
          "syncOrder references fetcher that doesn't exist"
        );
      }
    }

    // Add any fetchers not in syncOrder at the end
    for (const [name, fetcherConfig] of fetcherEntries) {
      if (!config.syncOrder!.includes(name)) {
        logger.warn(
          { fetcherName: name },
          "Fetcher not in syncOrder, adding at end"
        );
        ordered.push([name, fetcherConfig]);
      }
    }

    return ordered;
  }

  // No syncOrder specified, use default Object.entries() order
  logger.debug("No syncOrder specified, using default fetcher order");
  return Object.entries(config.fetchers);
}
