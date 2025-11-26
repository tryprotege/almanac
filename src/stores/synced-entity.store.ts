import { AnyKeys } from "mongoose";
import {
  SyncedEntityModel,
  ISyncedEntity,
} from "../models/synced-entity.model.js";
import { SourceType } from "../types/index.js";

/**
 * Data access layer for synced entities
 * Provides batch operations and efficient queries
 */
export class SyncedEntityStore {
  /**
   * Upsert a single entity
   */
  async upsert({
    _id,
    ...entity
  }: AnyKeys<ISyncedEntity>): Promise<ISyncedEntity> {
    const result = await SyncedEntityModel.findByIdAndUpdate(
      _id,
      { $set: entity },
      { upsert: true, new: true }
    );

    if (!result) {
      throw new Error(`Failed to upsert entity ${_id}`);
    }

    return result;
  }

  /**
   * Batch upsert entities (optimized for bulk operations)
   */
  async upsertBatch(entities: ISyncedEntity[]): Promise<void> {
    if (entities.length === 0) return;

    const operations = entities.map((entity) => ({
      updateOne: {
        filter: { _id: entity._id },
        update: { $set: entity },
        upsert: true,
      },
    }));

    await SyncedEntityModel.bulkWrite(operations, { ordered: false });
  }

  /**
   * Find entity by ID
   */
  async findById(id: string): Promise<ISyncedEntity | null> {
    return await SyncedEntityModel.findById(id);
  }

  /**
   * Find entities by source and type
   */
  async findBySourceAndType(
    source: SourceType,
    entityType?: string,
    options?: { limit?: number; skip?: number; includeDeleted?: boolean }
  ): Promise<ISyncedEntity[]> {
    const filter: any = { source, entityType };

    if (!options?.includeDeleted) {
      filter.isDeleted = false;
    }

    let query = SyncedEntityModel.find();

    if (options?.skip) query = query.skip(options.skip);
    if (options?.limit) query = query.limit(options.limit);

    return await query.exec();
  }

  /**
   * Get entity by source ID
   */
  async findBySourceId(
    source: SourceType,
    sourceId: string
  ): Promise<ISyncedEntity | null> {
    return await SyncedEntityModel.findOne({ source, sourceId });
  }

  /**
   * Check if entity exists and get checksum
   */
  async getChecksum(id: string): Promise<string | null> {
    const entity = await SyncedEntityModel.findById(id, { checksum: 1 });
    return entity?.checksum || null;
  }

  /**
   * Get multiple checksums efficiently
   */
  async getChecksums(ids: string[]): Promise<Map<string, string>> {
    const entities = await SyncedEntityModel.find(
      { _id: { $in: ids } },
      { _id: 1, checksum: 1 }
    );

    const checksumMap = new Map<string, string>();
    entities.forEach((entity) => {
      checksumMap.set(entity._id, entity.checksum);
    });

    return checksumMap;
  }

  /**
   * Soft delete entity
   */
  async softDelete(id: string): Promise<void> {
    await SyncedEntityModel.findByIdAndUpdate(id, {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Soft delete multiple entities
   */
  async softDeleteBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await SyncedEntityModel.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      }
    );
  }

  /**
   * Hard delete entity
   */
  async hardDelete(id: string): Promise<void> {
    await SyncedEntityModel.findByIdAndDelete(id);
  }

  /**
   * Hard delete multiple entities
   */
  async hardDeleteBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await SyncedEntityModel.deleteMany({ _id: { $in: ids } });
  }

  /**
   * Get entities modified since timestamp
   */
  async findModifiedSince(
    source: SourceType,
    since: Date,
    options?: { limit?: number }
  ): Promise<ISyncedEntity[]> {
    let query = SyncedEntityModel.find({
      source,
      sourceUpdatedAt: { $gt: since },
    }).sort({ sourceUpdatedAt: 1 });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.exec();
  }

  /**
   * Count entities by source
   */
  async countBySource(
    source: SourceType,
    includeDeleted: boolean = false
  ): Promise<number> {
    const filter: any = { source };
    if (!includeDeleted) {
      filter.isDeleted = false;
    }
    return await SyncedEntityModel.countDocuments(filter);
  }

  /**
   * Get sync statistics for a source
   */
  async getSyncStats(source: SourceType): Promise<{
    total: number;
    byType: Record<string, number>;
    deleted: number;
    lastSynced: Date | null;
  }> {
    const [total, deleted, byType, lastSynced] = await Promise.all([
      this.countBySource(source, false),
      SyncedEntityModel.countDocuments({ source, isDeleted: true }),
      SyncedEntityModel.aggregate([
        { $match: { source, isDeleted: false } },
        { $group: { _id: "$entityType", count: { $sum: 1 } } },
      ]),
      SyncedEntityModel.findOne({ source })
        .sort({ syncedAt: -1 })
        .select("syncedAt"),
    ]);

    const byTypeMap: Record<string, number> = {};
    byType.forEach((item: any) => {
      byTypeMap[item._id] = item.count;
    });

    return {
      total,
      byType: byTypeMap,
      deleted,
      lastSynced: lastSynced?.syncedAt || null,
    };
  }

  /**
   * Find entities by IDs
   */
  async findByIds(ids: string[]): Promise<ISyncedEntity[]> {
    return await SyncedEntityModel.find({ _id: { $in: ids } });
  }

  /**
   * Search entities by text
   */
  async searchByText(
    query: string,
    options?: {
      source?: SourceType;
      entityType?: string;
      limit?: number;
      skip?: number;
    }
  ): Promise<ISyncedEntity[]> {
    const filter: any = {
      $text: { $search: query },
      isDeleted: false,
    };

    if (options?.source) {
      filter.source = options.source;
    }

    if (options?.entityType) {
      filter.entityType = options.entityType;
    }

    let searchQuery = SyncedEntityModel.find(filter).sort({
      score: { $meta: "textScore" },
    });

    if (options?.skip) searchQuery = searchQuery.skip(options.skip);
    if (options?.limit) searchQuery = searchQuery.limit(options.limit);

    return await searchQuery.exec();
  }

  /**
   * Get entities by people
   */
  async findByPeople(
    people: string[],
    options?: {
      source?: SourceType;
      limit?: number;
    }
  ): Promise<ISyncedEntity[]> {
    const filter: any = {
      people: { $in: people },
      isDeleted: false,
    };

    if (options?.source) {
      filter.source = options.source;
    }

    let query = SyncedEntityModel.find(filter).sort({ primaryDate: -1 });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.exec();
  }

  /**
   * Get entities by date range
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    options?: {
      source?: SourceType;
      entityType?: string;
      limit?: number;
    }
  ): Promise<ISyncedEntity[]> {
    const filter: any = {
      primaryDate: { $gte: startDate, $lte: endDate },
      isDeleted: false,
    };

    if (options?.source) {
      filter.source = options.source;
    }

    if (options?.entityType) {
      filter.entityType = options.entityType;
    }

    let query = SyncedEntityModel.find(filter).sort({ primaryDate: -1 });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.exec();
  }

  /**
   * Get entities by tags
   */
  async findByTags(
    tags: string[],
    options?: {
      source?: SourceType;
      limit?: number;
    }
  ): Promise<ISyncedEntity[]> {
    const filter: any = {
      tags: { $in: tags },
      isDeleted: false,
    };

    if (options?.source) {
      filter.source = options.source;
    }

    let query = SyncedEntityModel.find(filter).sort({ syncedAt: -1 });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.exec();
  }
}
