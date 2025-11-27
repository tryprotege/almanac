import { randomUUID } from "crypto";
import { SourceType } from "../../types/index.js";
import { BaseEntityAdapter } from "./adapters/base-adapter.js";
import { RecordStore } from "../../stores/record.store.js";
import { Record } from "../../models/record.model.js";

/**
 * Simple one-time sync service
 * Syncs entities from source to MongoDB only
 */
export class SimpleSyncService {
  constructor(private recordStore: RecordStore) {}

  /**
   * Perform a one-time full sync
   */
  async syncAll(
    source: SourceType,
    adapter: BaseEntityAdapter
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
    errors: Array<{ entityId: string; error: string }>;
  }> {
    const jobId = randomUUID();
    const startTime = Date.now();

    console.log(`🚀 Starting full sync for ${source} (Job: ${jobId})`);

    let totalProcessed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const errors: Array<{ entityId: string; error: string }> = [];

    try {
      // Fetch all entities in batches
      const iterator = adapter.fetchAll({ batchSize: 50 });

      for await (const batch of iterator) {
        console.log(`  Processing batch of ${batch.length} entities...`);

        for (const sourceEntity of batch) {
          try {
            const result = await this.syncEntity(adapter, sourceEntity);
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
            const entityId = (sourceEntity as any).id || "unknown";
            const errorMsg =
              error instanceof Error ? error.message : String(error);

            errors.push({ entityId, error: errorMsg });

            console.error(`  ❌ Failed to sync entity ${entityId}:`, errorMsg);
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
        errors: [{ entityId: "sync", error: errorMsg }],
      };
    }
  }

  /**
   * Sync a single entity
   */
  private async syncEntity(
    adapter: BaseEntityAdapter,
    sourceEntity: any
  ): Promise<{ action: "created" | "updated" | "skipped" }> {
    // Transform entity to unified format
    const entity: Record = await adapter.transform(sourceEntity);

    // Check if entity exists
    const existing = await this.recordStore.findById(entity._id);

    if (existing) {
      // Update: increment version
      entity.version = existing.version + 1;

      // Check if changed (optional optimization)
      if (entity.checksum === existing.checksum) {
        return { action: "skipped" };
      }

      await this.recordStore.upsert(entity);
      return { action: "updated" };
    } else {
      // Create new
      await this.recordStore.upsert(entity);
      return { action: "created" };
    }
  }
}
