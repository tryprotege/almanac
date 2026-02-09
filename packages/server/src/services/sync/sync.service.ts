import type { DataSource } from '../../models/data-source.model.js';
import { IndexingConfigModel } from '../../models/indexing-config.model.js';
import logger from '../../utils/logger.js';
import { indexAll } from '../indexing/config/config-indexer.service.js';
import { RecordModel } from '../../models/record.model.js';
import { createHash } from 'crypto';
import type { TransformedRecord } from '@almanac/indexing-engine';

/**
 * Helper: Persist transformed records to MongoDB
 */
async function persistToMongo(records: TransformedRecord[]): Promise<void> {
  const mongoOps = records.map((record) => {
    const normalizedContent = `${record.title || ''}\n${record.content || ''}`.trim();
    const checksum = createHash('sha256').update(normalizedContent).digest('hex');

    // Fallback for sourceUpdatedAt if not provided by transformer
    const finalSourceUpdatedAt =
      record.sourceUpdatedAt ||
      (record.rawData?.updated_time
        ? new Date(record.rawData.updated_time)
        : record.rawData?.last_edited_time
          ? new Date(record.rawData.last_edited_time)
          : undefined);

    return {
      updateOne: {
        filter: { _id: record._id },
        update: {
          $set: {
            _id: record._id,
            source: record.source,
            sourceId: record.sourceId,
            recordType: record.recordType,
            parentId: record.parentId,
            childIds: record.childIds || [],
            isParentRecord: record.isParentRecord || false,
            title: record.title || '',
            content: record.content || '',
            people: record.people || [],
            sourceCreatedAt: record.sourceCreatedAt,
            sourceUpdatedAt: finalSourceUpdatedAt,
            tags: record.tags || [],
            rawData: record.rawData || {},
            checksum,
            syncedAt: new Date(),
          },
          $inc: { version: 1 },
        },
        upsert: true,
      },
    };
  });

  await RecordModel.bulkWrite(mongoOps);
}

export interface SyncResult {
  recordsProcessed: number;
  fetcherStats: Map<string, { recordCount: number }>;
}

/**
 * Sync a single MCP server data source
 * All sources must have an active IndexingConfig
 */
export const syncMcpServer = async (dataSource: DataSource, _options?: { limit?: number }) => {
  // 1. Get IndexingConfig (required - no fallback)
  const syncConfig = await IndexingConfigModel.findOne({
    serverName: dataSource.name,
    status: 'active',
  });

  if (!syncConfig) {
    throw new Error(
      `No active IndexingConfig found for '${dataSource.name}'. Please create an indexing configuration first via the UI or config generation API.`,
    );
  }

  logger.info({ serverName: dataSource.name }, 'Starting config-based sync');

  let recordsProcessed = 0;
  const fetcherStats = new Map<string, { recordCount: number }>();

  // 3. Fetch & transform via config-indexer
  const syncGenerator = indexAll(
    syncConfig.config,
    dataSource.name,
    syncConfig.startingPointValues ? Object.fromEntries(syncConfig.startingPointValues) : undefined,
  );

  // 4. Process records in batches
  for await (const { records, progress } of syncGenerator) {
    await persistToMongo(records);

    recordsProcessed += records.length;

    // Track stats per fetcher
    if (!fetcherStats.has(progress.fetcherName)) {
      fetcherStats.set(progress.fetcherName, { recordCount: 0 });
    }
    const stats = fetcherStats.get(progress.fetcherName)!;
    stats.recordCount += records.length;

    logger.info(`Processed ${recordsProcessed} records from ${dataSource.name}`);
  }

  console.log('✅✅✅ sync completed', dataSource.name);
  logger.info({
    msg: `✅ Sync completed for ${dataSource.name}`,
    recordsProcessed,
    fetcherStats: Object.fromEntries(fetcherStats),
  });

  return {
    recordsProcessed,
    fetcherStats,
  };
};
