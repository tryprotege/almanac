import { randomUUID } from "crypto";
import pLimit from "p-limit";

import { env } from "../../env.js";
import { Record } from "../../models/record.model.js";
import { RecordStore } from "../../stores/record.store.js";
import { SourceType } from "../../types/index.js";
import { BaseRecordAdapter } from "./adapters/base-adapter.js";
import logger from "../../utils/logger.js";

// Create concurrency limiter. Have this outside of the function to ensure the limit applied to all invocations
const limit = pLimit(env.DB_INDEXING_CONCURRENCY);

/**
 * Sync a single record
 */
async function syncRecord(
  recordStore: RecordStore,
  adapter: BaseRecordAdapter,
  sourceRecord: any
): Promise<{ action: "created" | "updated" | "skipped" }> {
  // Transform record to unified format
  const record: Record = await adapter.transform(sourceRecord);

  // Check if record exists
  const existing = await recordStore.findById(record._id);

  if (existing) {
    // Update: increment version
    record.version = existing.version + 1;

    // Check if changed (optional optimization)
    if (record.checksum === existing.checksum) {
      return { action: "skipped" };
    }

    // CRITICAL: Preserve indexing metadata - these should NEVER be cleared
    // Only update if the new value is explicitly set, otherwise keep existing
    if (!record.lastGraphIndexAt && existing.lastGraphIndexAt) {
      record.lastGraphIndexAt = existing.lastGraphIndexAt;
    }
    if (!record.lastEmbeddedAt && existing.lastEmbeddedAt) {
      record.lastEmbeddedAt = existing.lastEmbeddedAt;
    }

    // Log metadata preservation for debugging
    logger.debug(
      {
        recordId: record._id,
        hadEmbeddedAt: !!existing.lastEmbeddedAt,
        hadGraphIndexAt: !!existing.lastGraphIndexAt,
        preservedEmbeddedAt: !!record.lastEmbeddedAt,
        preservedGraphIndexAt: !!record.lastGraphIndexAt,
      },
      "Preserving indexing metadata during sync"
    );

    await recordStore.upsert(record);
    return { action: "updated" };
  } else {
    // Create new
    await recordStore.upsert(record);
    return { action: "created" };
  }
}

/**
 * Perform a one-time full sync
 */
export async function syncAllRecords(
  recordStore: RecordStore,
  source: SourceType,
  adapter: BaseRecordAdapter,
  options?: { limit?: number }
): Promise<{
  jobId: string;
  success: boolean;
  stats: {
    total: number;
    created: number;
    updated: number;
    failed: number;
    duration: number;
  };
  errors: Array<{ recordId: string; error: string }>;
}> {
  const jobId = randomUUID();
  const startTime = Date.now();

  logger.info({ msg: `🚀 Starting full sync for ${source} (Job: ${jobId})` });

  let totalProcessed = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  const errors: Array<{ recordId: string; error: string }> = [];

  try {
    // Fetch all records in batches
    const iterator = adapter.fetchAll({ batchSize: 50 });

    for await (const batch of iterator) {
      // Check if we've reached the limit
      if (options?.limit && totalProcessed >= options.limit) {
        logger.debug(
          `  Reached limit of ${options.limit} records, stopping sync`
        );
        break;
      }

      // Apply limit to batch if needed
      const recordsToProcess = options?.limit
        ? batch.slice(0, options.limit - totalProcessed)
        : batch;

      logger.debug(
        `  Processing batch of ${recordsToProcess.length} records...`
      );

      await Promise.all(
        recordsToProcess.map(
          async (sourceRecord) =>
            await limit(async () => {
              try {
                const result = await syncRecord(
                  recordStore,
                  adapter,
                  sourceRecord
                );
                totalProcessed++;

                if (result.action === "created") {
                  totalCreated++;
                } else if (result.action === "updated") {
                  totalUpdated++;
                }

                if (totalProcessed % 10 === 0) {
                  logger.info(
                    `  Progress: ${totalProcessed} processed (${totalCreated} created, ${totalUpdated} updated)`
                  );
                }
              } catch (err) {
                totalFailed++;
                const recordId = (sourceRecord as any).id || "unknown";
                const errorMsg =
                  err instanceof Error ? err.message : String(err);

                errors.push({ recordId, error: errorMsg });

                logger.error(
                  { err, recordId, sourceRecord },
                  `Failed to sync record ${recordId}`
                );
              }
            })
        )
      );
    }

    const duration = Date.now() - startTime;

    logger.info({
      msg: "✅ Sync completed",
      source,
      stats: {
        total: totalProcessed,
        created: totalCreated,
        updated: totalUpdated,
        failed: totalFailed,
        duration,
      },
    });

    return {
      jobId,
      success: true,
      stats: {
        total: totalProcessed,
        created: totalCreated,
        updated: totalUpdated,
        failed: totalFailed,
        duration,
      },
      errors,
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    logger.error({ err, source }, `Sync failed for ${source}`);

    return {
      jobId,
      success: false,
      stats: {
        total: totalProcessed,
        created: totalCreated,
        updated: totalUpdated,
        failed: totalFailed,
        duration,
      },
      errors: [{ recordId: "sync", error: errorMsg }],
    };
  }
}
