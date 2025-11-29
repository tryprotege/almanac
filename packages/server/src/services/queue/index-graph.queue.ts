import { Processor, Queue, Worker } from "bullmq";

import { initializeServices } from "../../mcp/initialization.js";
import { GraphStore } from "../../stores/graph.store.js";
import { RecordStore } from "../../stores/record.store.js";
import { SourceType } from "../../types/index.js";
import { GraphIndexerService } from "../indexing/graph/graph-indexer.service.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { BaseRecordAdapter } from "../sync/adapters/base-adapter.js";
import { NotionAdapter } from "../sync/adapters/notion-adapter.js";
import { createRedisConnection, QUEUE_NAME } from "./config.js";

const processor: Processor<
  IndexGraphJobData,
  IndexGraphJobResult,
  string
> = async ({ data: { source } }) => {
  // Initialize services
  const { memgraph } = await initializeServices();

  // Create stores
  const recordStore = new RecordStore();
  const graphStore = new GraphStore(memgraph);

  const adapters = new Map<SourceType, BaseRecordAdapter>();

  if (source === "notion") {
    const notionClient = new NotionMCPClient();
    adapters.set("notion", new NotionAdapter(notionClient));
  }

  const graphIndexer = new GraphIndexerService(
    recordStore,
    graphStore,
    adapters
  );

  await graphIndexer.indexAll(source);
};

type IndexGraphJobData = {
  source: SourceType;
};

type IndexGraphJobResult = void;

export const indexGraphWorker = new Worker<
  IndexGraphJobData,
  IndexGraphJobResult
>(QUEUE_NAME.INDEX_GRAPH, processor, {
  connection: createRedisConnection(),
  concurrency: 2,
  autorun: false,
});

// Set up worker event handlers
indexGraphWorker.on("completed", (job) => {
  console.log(
    `✅ Graph index job completed: ${job.id} for record ${job.data.source}`
  );
});

indexGraphWorker.on("failed", (job, err) => {
  console.error(
    `❌ Graph index job failed: ${job?.id} for record ${job?.data.source}`,
    err
  );
});

indexGraphWorker.on("error", (err) => {
  console.error("Graph index worker error:", err);
});

indexGraphWorker.on("active", (job) => {
  console.log(
    `🔄 Graph index job started: ${job.id} for record ${job.data.source}`
  );
});

export const indexGraphQueue = new Queue<
  IndexGraphJobData,
  IndexGraphJobResult
>(QUEUE_NAME.INDEX_GRAPH, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 60 * 60, // Keep for 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
      age: 7 * 24 * 60 * 60, // Keep for 7 days
    },
  },
});
