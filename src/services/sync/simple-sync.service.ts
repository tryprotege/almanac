import { randomUUID } from "crypto";
import { SourceType } from "../../types/index.js";
import { BaseRecordAdapter } from "./adapters/base-adapter.js";
import { RecordStore } from "../../stores/record.store.js";
import { Record } from "../../models/record.model.js";

/**
 * Simple one-time sync service
 * Syncs entities from source to MongoDB only
 */
export class SimpleSyncService {
  constructor(private entityStore: RecordStore) {}

  /**
   * Perform a one-time full sync
   */
  async syncAll(
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

        for (const sourceRecord of batch) {
          try {
            const result = await this.syncEntity(adapter, sourceRecord);
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
            const entityId = (sourceRecord as any).id || "unknown";
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
    adapter: BaseRecordAdapter,
    sourceRecord: any
  ): Promise<{ action: "created" | "updated" | "skipped" }> {
    // Transform record to unified format
    const entity: Record = await adapter.transform(sourceRecord);

    // Check if entity exists
    const existing = await this.entityStore.findById(entity._id);

    if (existing) {
      // Update: increment version
      entity.version = existing.version + 1;

      // Check if changed (optional optimization)
      if (entity.checksum === existing.checksum) {
        return { action: "skipped" };
      }

      await this.entityStore.upsert(entity);
      return { action: "updated" };
    } else {
      // Create new
      await this.entityStore.upsert(entity);
      return { action: "created" };
    }
  }

  /**
   * Sync specific entities by IDs
   */
  async syncByIds(
    source: SourceType,
    adapter: BaseRecordAdapter,
    entityIds: string[]
  ): Promise<{
    success: boolean;
    synced: number;
    failed: number;
    errors: Array<{ entityId: string; error: string }>;
  }> {
    console.log(
      `🔄 Syncing ${entityIds.length} specific entities from ${source}`
    );

    let synced = 0;
    let failed = 0;
    const errors: Array<{ entityId: string; error: string }> = [];

    for (const entityId of entityIds) {
      try {
        const sourceRecord = await adapter.fetchById(entityId);

        if (!sourceRecord) {
          throw new Error(`Entity not found: ${entityId}`);
        }

        await this.syncEntity(adapter, sourceRecord);
        synced++;
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ entityId, error: errorMsg });
        console.error(`  ❌ Failed to sync ${entityId}:`, errorMsg);
      }
    }

    console.log(`✅ Synced ${synced}/${entityIds.length} entities`);

    return {
      success: failed === 0,
      synced,
      failed,
      errors,
    };
  }
}
