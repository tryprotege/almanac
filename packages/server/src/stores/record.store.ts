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
   * Check if record exists and get checksum
   */
  async getChecksum(id: string): Promise<string | null> {
    const record = await RecordModel.findById(id, { checksum: 1 });
    return record?.checksum || null;
  }

  /**
   * Get multiple checksums efficiently
   */
  async getChecksums(ids: string[]): Promise<Map<string, string>> {
    const entities = await RecordModel.find({ _id: { $in: ids } }, { _id: 1, checksum: 1 });

    const checksumMap = new Map<string, string>();
    entities.forEach((record) => {
      checksumMap.set(record._id, record.checksum);
    });

    return checksumMap;
  }

  /**
   * Soft delete record
   */
  async softDelete(id: string): Promise<void> {
    await RecordModel.findByIdAndUpdate(id, {
      $set: {
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Soft delete multiple entities
   */
  async softDeleteBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await RecordModel.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          deletedAt: new Date(),
        },
      },
    );
  }

  /**
   * Hard delete record
   */
  async hardDelete(id: string): Promise<void> {
    await RecordModel.findByIdAndDelete(id);
  }

  /**
   * Hard delete multiple entities
   */
  async hardDeleteBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await RecordModel.deleteMany({ _id: { $in: ids } });
  }

  /**
   * Get entities modified since timestamp
   */
  async findModifiedSince(
    source: SourceType,
    since: Date,
    options?: { limit?: number },
  ): Promise<Record[]> {
    let query = RecordModel.find({
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
   * Search entities by text
   */
  async searchByText(
    query: string,
    options?: {
      source?: SourceType;
      recordType?: string;
      limit?: number;
      skip?: number;
    },
  ): Promise<Record[]> {
    const filter: any = {
      $text: { $search: query },
      deletedAt: null,
    };

    if (options?.source) {
      filter.source = options.source;
    }

    if (options?.recordType) {
      filter.recordType = options.recordType;
    }

    let searchQuery = RecordModel.find(filter).sort({
      score: { $meta: 'textScore' },
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
    },
  ): Promise<Record[]> {
    const filter: any = {
      people: { $in: people },
      deletedAt: null,
    };

    if (options?.source) {
      filter.source = options.source;
    }

    let query = RecordModel.find(filter).sort({ primaryDate: -1 });

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
      recordType?: string;
      limit?: number;
    },
  ): Promise<Record[]> {
    const filter: any = {
      primaryDate: { $gte: startDate, $lte: endDate },
      deletedAt: null,
    };

    if (options?.source) {
      filter.source = options.source;
    }

    if (options?.recordType) {
      filter.recordType = options.recordType;
    }

    let query = RecordModel.find(filter).sort({ primaryDate: -1 });

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
    },
  ): Promise<Record[]> {
    const filter: any = {
      tags: { $in: tags },
      deletedAt: null,
    };

    if (options?.source) {
      filter.source = options.source;
    }

    let query = RecordModel.find(filter).sort({ syncedAt: -1 });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.exec();
  }
}
