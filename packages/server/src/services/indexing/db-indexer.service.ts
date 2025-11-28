import { randomUUID } from "crypto";
import { SourceType } from "../../types/index.js";
import { BaseRecordAdapter } from "./adapters/base-adapter.js";
import { RecordStore } from "../../stores/record.store.js";
import { Record } from "../../models/record.model.js";

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

  console.log(`🚀 Starting full sync for ${source} (Job: ${jobId})`);

  let totalProcessed = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  const errors: Array<{ recordId: string; error: string }> = [];

  try {
    // Fetch all entities in batches
    const iterator = adapter.fetchAll({ batchSize: 50 });

    for await (const batch of iterator) {
      console.log(`  Processing batch of ${batch.length} entities...`);

      for (const sourceRecord of batch) {
        try {
          const result = await syncRecord(recordStore, adapter, sourceRecord);
          totalProcessed++;

          if (result.action === "created") {
            totalCreated++;
          } else if (result.action === "updated") {
            totalUpdated++;
          }

          if (totalProcessed % 10 === 0) {
            console.log(
              `  Progress: ${totalProcessed} processed (${totalCreated} created, ${totalUpdated} updated)`
            );
          }
        } catch (error) {
          totalFailed++;
          const recordId = (sourceRecord as any).id || "unknown";
          const errorMsg =
            error instanceof Error ? error.message : String(error);

          errors.push({ recordId, error: errorMsg });

          console.error(`  ❌ Failed to sync record ${recordId}:`, errorMsg);
        }
      }
    }

    const duration = Date.now() - startTime;

    console.log(`\n✅ Sync completed for ${source}:`);
    console.log(`  Total: ${totalProcessed}`);
    console.log(`  Created: ${totalCreated}`);
    console.log(`  Updated: ${totalUpdated}`);
    console.log(`  Failed: ${totalFailed}`);
    console.log(`  Duration: ${duration}ms`);

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
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.error(`\n❌ Sync failed for ${source}:`, errorMsg);

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
