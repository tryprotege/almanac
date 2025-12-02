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
> = async (job) => {
  const { mcpConfig } = job.data;

  // Initial progress - job started
  await job.updateProgress(10);

  // Sync records from MCP server to MongoDB
  await syncMcpServer(mcpConfig);
  await job.updateProgress(50);

  // Queue indexing jobs for vector and graph databases
  await Promise.all([
    indexVectorQueue.add(mcpConfig.name, {
      source: mcpConfig.name,
    }),
    indexGraphQueue.add(mcpConfig.name, {
      source: mcpConfig.name,
    }),
  ]);
  await job.updateProgress(90);

  // Job complete
  await job.updateProgress(100);
  return;
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
  console.log(
    `✅ Sync job completed: ${job.id} for ${job.data.mcpConfig.name}`
  );
});

syncMcpServerWorker.on("failed", (job, err) => {
  console.error(
    `❌ Sync job failed: ${job?.id} for ${job?.data.mcpConfig.name}`,
    err
  );
});

syncMcpServerWorker.on("error", (err) => {
  console.error("Worker error:", err);
});

syncMcpServerWorker.on("active", (job) => {
  console.log(`🔄 Sync job started: ${job.id} for ${job.data.mcpConfig.name}`);
});

export const syncMcpServerQueue = new Queue<
  SyncMcpServerJobData,
  SyncMcpServerJobResult
>(QUEUE_NAME.SYNC_MCP_SERVER, {
  connection: createRedisConnection(),
});
