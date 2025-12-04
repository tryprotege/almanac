import { Processor, Queue, Worker } from "bullmq";

import { MCPServerConfig } from "../../models/mcp-config.model.js";
import { syncMcpServer } from "../sync/sync.service.js";
import { indexGraphQueue } from "./index-graph.queue.js";
import { indexVectorQueue } from "./index-vector.queue.js";
import { createRedisConnection, QUEUE_NAME } from "./config.js";
import logger from "../../utils/logger.js";

const processor: Processor<
  SyncMcpServerJobData,
  SyncMcpServerJobResult,
  string
> = async ({ data: { mcpConfig } }) => {
  await syncMcpServer(mcpConfig);

  await Promise.all([
    indexVectorQueue.add(mcpConfig.name, {
      source: mcpConfig.name,
    }),
    indexGraphQueue.add(mcpConfig.name, {
      source: mcpConfig.name,
    }),
  ]);
};

type SyncMcpServerJobData = {
  mcpConfig: MCPServerConfig;
};

type SyncMcpServerJobResult = void;

export const syncMcpServerWorker = new Worker<
  SyncMcpServerJobData,
  SyncMcpServerJobResult
>(QUEUE_NAME.SYNC_MCP_SERVER, processor, {
  connection: createRedisConnection(),
  concurrency: 2,
  autorun: false,
});

// Set up worker event handlers
syncMcpServerWorker.on("completed", (job) => {
  logger.info(
    `✅ Sync job completed: ${job.id} for ${job.data.mcpConfig.name}`
  );
});

syncMcpServerWorker.on("failed", (job, err) => {
  logger.error(
    { err },
    `❌ Sync job failed: ${job?.id} for ${job?.data.mcpConfig.name}`
  );
});

syncMcpServerWorker.on("error", (err) => {
  logger.error({ err }, "Worker error");
});

syncMcpServerWorker.on("active", (job) => {
  logger.info(`🔄 Sync job started: ${job.id} for ${job.data.mcpConfig.name}`);
});

export const syncMcpServerQueue = new Queue<
  SyncMcpServerJobData,
  SyncMcpServerJobResult
>(QUEUE_NAME.SYNC_MCP_SERVER, {
  connection: createRedisConnection(),
});
