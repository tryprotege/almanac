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

    // Preserve graph indexing metadata - let the graph indexer decide if re-indexing is needed
    record.lastGraphIndexDate = existing.lastGraphIndexDate;
    record.lastEmbedDate = existing.lastEmbedDate;

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
  adapter: BaseRecordAdapter
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

  logger.log(`🚀 Starting full sync for ${source} (Job: ${jobId})`);

  let totalProcessed = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  const errors: Array<{ recordId: string; error: string }> = [];

  try {
    // Fetch all records in batches
    const iterator = adapter.fetchAll({ batchSize: 50 });

    for await (const batch of iterator) {
      logger.log(`  Processing batch of ${batch.length} records...`);

      await Promise.all(
        batch.map(
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
                  logger.log(
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
                  { err, recordId },
                  `Failed to sync record ${recordId}`
                );
              }
            })
        )
      );
    }

    const duration = Date.now() - startTime;

    logger.log(`\n✅ Sync completed for ${source}:`);
    logger.log(`  Total: ${totalProcessed}`);
    logger.log(`  Created: ${totalCreated}`);
    logger.log(`  Updated: ${totalUpdated}`);
    logger.log(`  Failed: ${totalFailed}`);
    logger.log(`  Duration: ${duration}ms`);

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
