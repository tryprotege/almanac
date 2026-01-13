import { Processor, Queue, Worker } from "bullmq";

import type { DataSource } from "../../models/data-source.model.js";
import { DataSourceModel } from "../../models/data-source.model.js";
import { syncMcpServer } from "../sync/sync.service.js";
import { indexGraphQueue } from "./index-graph.queue.js";
import { indexVectorQueue } from "./index-vector.queue.js";
import { createRedisConnection, QUEUE_NAME } from "./config.js";
import logger from "../../utils/logger.js";

const processor: Processor<
  SyncMcpServerJobData,
  SyncMcpServerJobResult,
  string
> = async ({ data: { mcpConfig }, id }) => {
  const isScheduledJob = id?.startsWith("schedule-");

  if (isScheduledJob) {
    logger.info(
      { dataSourceName: mcpConfig.name },
      "Starting scheduled sync job"
    );
  }

  // Mark sync as in-progress
  await DataSourceModel.findOneAndUpdate(
    { name: mcpConfig.name },
    { lastSyncStatus: "in-progress" }
  );

  try {
    await syncMcpServer(mcpConfig);

    await Promise.all([
      indexVectorQueue.add(mcpConfig.name, {
        source: mcpConfig.name as any,
      }),
      indexGraphQueue.add(mcpConfig.name, {
        source: mcpConfig.name as any,
      }),
    ]);

    // Mark sync as successful
    await DataSourceModel.findOneAndUpdate(
      { name: mcpConfig.name },
      {
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
      }
    );
  } catch (error) {
    // Mark sync as failed
    await DataSourceModel.findOneAndUpdate(
      { name: mcpConfig.name },
      { lastSyncStatus: "failed" }
    );
    throw error;
  }
};

export type SyncMcpServerJobData = {
  mcpConfig: DataSource & { _id: any };
};

type SyncMcpServerJobResult = void;

export const syncMcpServerWorker = new Worker<
  SyncMcpServerJobData,
  SyncMcpServerJobResult
>(QUEUE_NAME.SYNC_MCP_SERVER, processor, {
  connection: createRedisConnection(),
  concurrency: 1,
  autorun: false,
  skipLockRenewal: true,
  skipStalledCheck: true,
});

// Set up worker event handlers
syncMcpServerWorker.on("completed", (job) => {
  logger.info({
    msg: `✅ Sync job completed: jobId: ${job.id} for ${job.data.mcpConfig.name}`,
  });
});

syncMcpServerWorker.on("failed", (job, err) => {
  logger.error(
    { err },
    `❌ Sync job failed: jobId: ${job?.id} for ${job?.data.mcpConfig.name}`
  );
});

syncMcpServerWorker.on("error", (err) => {
  logger.error({ err }, "Worker error:");
});

syncMcpServerWorker.on("active", (job) => {
  logger.info({
    msg: `🔄 Sync job started: jobId: ${job.id} for ${job.data.mcpConfig.name}`,
  });
});

export const syncMcpServerQueue = new Queue<
  SyncMcpServerJobData,
  SyncMcpServerJobResult
>(QUEUE_NAME.SYNC_MCP_SERVER, {
  connection: createRedisConnection(),
});
