import { Processor, Queue, Worker } from 'bullmq';

import type { DataSource } from '../../models/data-source.model.js';
import { DataSourceModel } from '../../models/data-source.model.js';
import { MCPSyncStateModel } from '../../models/mcp-sync-state.model.js';
import { IndexingConfigModel } from '../../models/indexing-config.model.js';
import { syncMcpServer } from '../sync/sync.service.js';
import { indexGraphQueue } from './index-graph.queue.js';
import { indexVectorQueue } from './index-vector.queue.js';
import { createRedisConnection, QUEUE_NAME } from './config.js';
import logger from '../../utils/logger.js';

const processor: Processor<SyncMcpServerJobData, SyncMcpServerJobResult, string> = async ({
  data: { mcpConfig },
  id,
}) => {
  const isScheduledJob = id?.startsWith('schedule-');

  if (isScheduledJob) {
    logger.info({ dataSourceName: mcpConfig.name }, 'Starting scheduled sync job');
  }

  // Get the indexing config to link with sync state
  const indexingConfig = await IndexingConfigModel.findOne({
    serverName: mcpConfig.name,
    status: 'active',
  });

  if (!indexingConfig) {
    logger.error({ serverName: mcpConfig.name }, 'No active indexing config found for sync');
    throw new Error(`No active indexing config found for '${mcpConfig.name}'`);
  }

  // Initialize or update MCPSyncState to 'syncing' status
  let syncState = await MCPSyncStateModel.findOne({ serverName: mcpConfig.name });

  if (!syncState) {
    syncState = await MCPSyncStateModel.create({
      serverName: mcpConfig.name,
      configId: indexingConfig._id,
      configVersion: indexingConfig.configVersion,
      status: 'syncing',
      fetcherCursors: new Map(),
      totalRecordsSynced: 0,
      consecutiveErrors: 0,
    });
    logger.info({ serverName: mcpConfig.name }, 'Created new MCPSyncState');
  } else {
    syncState.status = 'syncing';
    syncState.configId = indexingConfig._id;
    syncState.configVersion = indexingConfig.configVersion;
    await syncState.save();
    logger.info({ serverName: mcpConfig.name }, 'Updated MCPSyncState to syncing status');
  }

  // Mark sync as in-progress in DataSource
  await DataSourceModel.findOneAndUpdate(
    { name: mcpConfig.name },
    { lastSyncStatus: 'in-progress' },
    { upsert: true },
  );

  try {
    const syncResult = await syncMcpServer(mcpConfig);

    await Promise.all([
      indexVectorQueue.add(mcpConfig.name, {
        source: mcpConfig.name as any,
      }),
      indexGraphQueue.add(mcpConfig.name, {
        source: mcpConfig.name as any,
      }),
    ]);

    // Update MCPSyncState with success
    syncState.status = 'idle';
    syncState.lastFullSyncAt = new Date();
    syncState.totalRecordsSynced += syncResult.recordsProcessed;
    syncState.consecutiveErrors = 0;
    syncState.lastError = undefined;
    await syncState.save();

    // Mark sync as successful in DataSource
    await DataSourceModel.findOneAndUpdate(
      { name: mcpConfig.name },
      {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
      },
    );

    logger.info(
      {
        serverName: mcpConfig.name,
        recordsProcessed: syncResult.recordsProcessed,
      },
      'Sync completed successfully',
    );
  } catch (err) {
    // Update MCPSyncState with error
    syncState.status = 'error';
    syncState.lastError = {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      occurredAt: new Date(),
    };
    syncState.consecutiveErrors += 1;
    await syncState.save();

    // Mark sync as failed in DataSource
    await DataSourceModel.findOneAndUpdate({ name: mcpConfig.name }, { lastSyncStatus: 'failed' });

    logger.error({
      msg: 'Sync job failed',
      config: mcpConfig.name,
      consecutiveErrors: syncState.consecutiveErrors,
      err,
    });
    throw err;
  }
};

export type SyncMcpServerJobData = {
  mcpConfig: DataSource & { _id: any };
};

type SyncMcpServerJobResult = void;

export const syncMcpServerWorker = new Worker<SyncMcpServerJobData, SyncMcpServerJobResult>(
  QUEUE_NAME.SYNC_MCP_SERVER,
  processor,
  {
    connection: createRedisConnection(),
    concurrency: 1,
    autorun: false,
    skipLockRenewal: true,
    skipStalledCheck: true,
    lockDuration: 5 * 60 * 60 * 1000,
  },
);

// Set up worker event handlers
syncMcpServerWorker.on('completed', (job) => {
  logger.info({
    msg: `✅ Sync job completed: jobId: ${job.id} for ${job.data.mcpConfig.name}`,
  });
});

syncMcpServerWorker.on('failed', (job, err) => {
  logger.error({ err }, `❌ Sync job failed: jobId: ${job?.id} for ${job?.data.mcpConfig.name}`);
});

syncMcpServerWorker.on('error', (err) => {
  logger.error({ err }, 'Worker error:');
});

syncMcpServerWorker.on('active', (job) => {
  logger.info({
    msg: `🔄 Sync job started: jobId: ${job.id} for ${job.data.mcpConfig.name}`,
  });
});

export const syncMcpServerQueue = new Queue<SyncMcpServerJobData, SyncMcpServerJobResult>(
  QUEUE_NAME.SYNC_MCP_SERVER,
  {
    connection: createRedisConnection(),
  },
);
