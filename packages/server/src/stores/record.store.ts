import { RecordModel, Record } from '../models/record.model.js';
import { SourceType } from '../types/index.js';

/**
 * Data access layer for synced entities
 * Provides batch operations and efficient queries
 */
export class RecordStore {
  /**
   * Upsert a single record
   */
  async upsert({ _id, ...record }: Partial<Record>): Promise<Record> {
    // Build update object, excluding undefined indexing metadata
    const updateData: any = { ...record };

    // Prevent accidental clearing of indexing metadata
    // If these fields are undefined, remove them from the update
    if (updateData.lastEmbeddedAt === undefined) {
      delete updateData.lastEmbeddedAt;
    }
    if (updateData.lastGraphIndexAt === undefined) {
      delete updateData.lastGraphIndexAt;
    }
    if (updateData.lastGraphIndexChecksum === undefined) {
      delete updateData.lastGraphIndexChecksum;
    }
    if (updateData.embeddingModelVersion === undefined) {
      delete updateData.embeddingModelVersion;
    }

    const result = await RecordModel.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { upsert: true, new: true },
    );

    if (!result) {
      throw new Error(`Failed to upsert record ${_id}`);
    }

    return result;
  }

  /**
   * Batch upsert entities (optimized for bulk operations)
   */
  async upsertBatch(entities: Record[]): Promise<void> {
    if (entities.length === 0) return;

    const operations = entities.map((record) => ({
      updateOne: {
        filter: { _id: record._id },
        update: { $set: record },
        upsert: true,
      },
    }));

    await RecordModel.bulkWrite(operations, { ordered: false });
  }

  /**
   * Find record by ID
   */
  async findById(id: string): Promise<Record | null> {
    return await RecordModel.findById(id);
  }

  /**
   * Find entities by source and type
   */
  async findBySourceAndType(
    source: SourceType,
    recordType?: string,
    options?: { limit?: number; skip?: number; includeDeleted?: boolean },
  ): Promise<Record[]> {
    const filter: any = { source };

    // Only add recordType to filter if it's provided and not empty
    if (recordType) {
      filter.recordType = recordType;
    }

    if (!options?.includeDeleted) {
      filter.deletedAt = null;
    }

    let query = RecordModel.find(filter);

    if (options?.skip) query = query.skip(options.skip);
    if (options?.limit) query = query.limit(options.limit);

    return await query.exec();
  }

  /**
   * Get record by source ID
   */
  async findBySourceId(source: SourceType, sourceId: string): Promise<Record | null> {
    return await RecordModel.findOne({ source, sourceId });
  }

  /**
   * Count entities by source
   */
  async countBySource(source: SourceType, includeDeleted: boolean = false): Promise<number> {
    const filter: any = { source };
    if (!includeDeleted) {
      filter.deletedAt = null;
    }
    return await RecordModel.countDocuments(filter);
  }

  /**
   * Count entities by source and type
   */
  async countBySourceAndType(
    source: SourceType,
    recordType?: string,
    options?: { includeDeleted?: boolean },
  ): Promise<number> {
    const filter: any = { source };

    // Only add recordType to filter if it's provided and not empty
    if (recordType) {
      filter.recordType = recordType;
    }

    if (!options?.includeDeleted) {
      filter.deletedAt = null;
    }

    return await RecordModel.countDocuments(filter);
  }

  /**
   * Find entities by IDs
   */
  async findByIds(ids: string[]): Promise<Record[]> {
    return await RecordModel.find({ _id: { $in: ids } });
  }

  /**
   * Find records that need graph indexing (never indexed OR content changed since last index)
   */
  async findNeedingGraphIndex(
    source: SourceType,
    recordType?: string,
    options?: { limit?: number; skip?: number; includeDeleted?: boolean },
  ): Promise<Record[]> {
    const filter: any = {
      source,
      $or: [
        // Never been indexed
        { lastGraphIndexAt: null },
        // Content changed since last index (checksum-based detection)
        { $expr: { $ne: ['$checksum', '$lastGraphIndexChecksum'] } },
      ],
    };

    // Only add recordType to filter if it's provided and not empty
    if (recordType) {
      filter.recordType = recordType;
    }

    if (!options?.includeDeleted) {
      filter.deletedAt = null;
    }

    let query = RecordModel.find(filter);

    if (options?.skip) query = query.skip(options.skip);
    if (options?.limit) query = query.limit(options.limit);

    return await query.exec();
  }

  /**
   * Count records that need graph indexing
   */
  async countNeedingGraphIndex(
    source: SourceType,
    recordType?: string,
    options?: { includeDeleted?: boolean },
  ): Promise<number> {
    const filter: any = {
      source,
      $or: [
        // Never been indexed
        { lastGraphIndexAt: null },
        // Content changed since last index (checksum-based detection)
        { $expr: { $ne: ['$checksum', '$lastGraphIndexChecksum'] } },
      ],
    };

    // Only add recordType to filter if it's provided and not empty
    if (recordType) {
      filter.recordType = recordType;
    }

    if (!options?.includeDeleted) {
      filter.deletedAt = null;
    }

    return await RecordModel.countDocuments(filter);
  }
}
