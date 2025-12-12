import { Processor, Queue, Worker } from "bullmq";

import { insertAllRecordsToVectorDB } from "../indexing/embeddings/vector-indexer.service.js";
import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { initializeServices } from "../../mcp/initialization.js";
import { createRedisConnection, QUEUE_NAME } from "./config.js";
import { SourceType } from "../../types/index.js";
import logger from "../../utils/logger.js";

export const processor: Processor<
  IndexVectorJobData,
  IndexVectorJobResult,
  string
> = async ({ data: { source } }) => {
  // Initialize services
  const { qdrant } = await initializeServices();

  // Create stores
  const recordStore = new RecordStore();
  const vectorStore = new VectorStore(qdrant);

  await insertAllRecordsToVectorDB(recordStore, vectorStore, source);
  console.log("🚀🚀🚀 vector", source);
};

type IndexVectorJobData = {
  source: SourceType;
};

type IndexVectorJobResult = void;

export const indexVectorWorker = new Worker<
  IndexVectorJobData,
  IndexVectorJobResult
>(QUEUE_NAME.INDEX_VECTOR, processor, {
  connection: createRedisConnection(),
  concurrency: 2,
  autorun: false,
});

// Set up worker event handlers
indexVectorWorker.on("completed", (job) => {
  logger.info({
    msg: `✅ Vector index job completed: jobId: ${job.id} for ${job.data.source}`,
  });
});

indexVectorWorker.on("failed", (job, err) => {
  logger.error(
    { err },
    `❌ Vector index job failed: jobId: ${job?.id} for ${job?.data.source}`
  );
});

indexVectorWorker.on("error", (err) => {
  logger.error({ err }, "Vector index worker error:");
});

indexVectorWorker.on("active", (job) => {
  logger.info({
    msg: `🔄 Vector index job started: jobId: ${job.id} for ${job.data.source}`,
  });
});

export const indexVectorQueue = new Queue<
  IndexVectorJobData,
  IndexVectorJobResult
>(QUEUE_NAME.INDEX_VECTOR, {
  connection: createRedisConnection(),
});
