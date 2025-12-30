import type {
  IndexingConfig,
  RecordTypeConfig,
  TransformedRecord,
} from "@ebee-oss/indexing-engine";
import { RecordTransformer } from "@ebee-oss/indexing-engine";
import { fetchAll as fetchPaginated } from "./paginated-fetcher.js";
import { enrich as enrichRecord } from "./enrichment-executor.js";
import { extractEntities, extractRelationships } from "./entity-extractor.js";
import { MCPSyncStateModel } from "../../../models/mcp-sync-state.model.js";
import { mcpClientManager } from "../../../mcp/client.js";
import logger from "../../../utils/logger.js";

export interface IndexProgress {
  fetcherName: string;
  recordType: string;
  recordsProcessed: number;
  totalRecords: number;
  status: "fetching" | "enriching" | "transforming" | "complete" | "error";
  error?: string;
}

/**
 * Index all records from all fetchers
 */
export async function* indexAll(
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
    logger.info(
      { serverName, count: Object.keys(config.toolClassifications).length },
      "Tool classifications loaded for indexing"
    );
  }

  for (const [fetcherName, fetcherConfig] of Object.entries(config.fetchers)) {
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

    // Fetch pages
    for await (const rawRecords of fetchPaginated(serverName, fetcherConfig)) {
      const transformedBatch: TransformedRecord[] = [];

      // Process each record
      for (const rawRecord of rawRecords) {
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
          // Enrich if needed
          let enrichments = {};
          if (recordType.enrichments && recordType.enrichments.length > 0) {
            enrichments = await enrichRecord(
              serverName,
              rawRecord,
              recordType.enrichments
            );
          }

          // Transform
          const transformer = new RecordTransformer(recordType, serverName);
          const transformed = await transformer.transform({
            record: rawRecord,
            enrichments,
          });

          // Extract entities and relationships (NEW)
          if (recordType.entities && recordType.entities.length > 0) {
            transformed.extractedEntities = extractEntities(
              rawRecord,
              recordType.entities
            );
          }

          if (recordType.relationships && recordType.relationships.length > 0) {
            transformed.extractedRelationships = extractRelationships(
              rawRecord,
              transformed._id,
              recordType.name,
              recordType.relationships
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

      // Yield batch
      yield {
        records: transformedBatch,
        progress: {
          fetcherName,
          recordType: recordTypes.map((rt) => rt.name).join(", "),
          recordsProcessed,
          totalRecords: recordsProcessed, // Unknown total
          status: "transforming",
        },
      };
    }

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

  for (const [fetcherName, fetcherConfig] of Object.entries(config.fetchers)) {
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

    for await (const rawRecords of fetchPaginated(
      serverName,
      fetcherConfig,
      params
    )) {
      const transformedBatch: TransformedRecord[] = [];

      for (const rawRecord of rawRecords) {
        const recordType = matchRecordType(rawRecord, recordTypes);
        if (!recordType) continue;

        try {
          let enrichments = {};
          if (recordType.enrichments && recordType.enrichments.length > 0) {
            enrichments = await enrichRecord(
              serverName,
              rawRecord,
              recordType.enrichments
            );
          }

          const transformer = new RecordTransformer(recordType, serverName);
          const transformed = await transformer.transform({
            record: rawRecord,
            enrichments,
          });

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
