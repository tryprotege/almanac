import { Processor, Queue, Worker } from "bullmq";

import { MCPServerConfig } from "../../models/mcp-config.model.js";
import { syncMcpServer } from "../sync/sync.service.js";
import { indexGraphQueue } from "./index-graph.queue.js";
import { indexVectorQueue } from "./index-vector.queue.js";
import { createRedisConnection, QUEUE_NAME } from "./config.js";

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
  logger.log(
    `✅ Sync job completed: jobId: ${job.id} for ${job.data.mcpConfig.name}`
  );
});

syncMcpServerWorker.on("failed", (job, err) => {
  logger.error(
    `❌ Sync job failed: jobId: ${job?.id} for ${job?.data.mcpConfig.name}`,
    err
  );
});

syncMcpServerWorker.on("error", (err) => {
  logger.error("Worker error:", err);
});

syncMcpServerWorker.on("active", (job) => {
  logger.log(
    `🔄 Sync job started: jobId: ${job.id} for ${job.data.mcpConfig.name}`
  );
});

export const syncMcpServerQueue = new Queue<
  SyncMcpServerJobData,
  SyncMcpServerJobResult
>(QUEUE_NAME.SYNC_MCP_SERVER, {
  connection: createRedisConnection(),
});
