import { Processor, Queue, Worker } from "bullmq";

import { initializeServices } from "../../mcp/initialization.js";
import { GraphStore } from "../../stores/graph.store.js";
import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { SourceType } from "../../types/index.js";
import logger from "../../utils/logger.js";
import { indexAllRecords } from "../indexing/graph/graph-indexer.js";
import {
  indexEntityEmbeddings,
  indexRelationshipEmbeddings,
} from "../indexing/graph/graph-embeddings.js";
import { createRedisConnection, QUEUE_NAME } from "./config.js";
import { env } from "../../env.js";
import { llm } from "../llm/llm.js";

const processor: Processor<
  IndexGraphJobData,
  IndexGraphJobResult,
  string
> = async ({ data: { source } }) => {
  // Initialize services
  const { memgraph, qdrant } = await initializeServices();

  // Create stores
  const recordStore = new RecordStore();
  const graphStore = new GraphStore(memgraph);
  const vectorStore = new VectorStore(qdrant);

  // Use functional approach for indexing
  // Note: Removed adapter dependency - relationships now come from
  // config-driven extractedRelationships in transformed records
  const result = await indexAllRecords(source, recordStore, graphStore, llm, {
    batchSize: 100,
    concurrency: env.GRAPH_EXTRACTION_CONCURRENCY,
    enableToxicFilter: env.ENABLE_TOXIC_DOCUMENT_FILTER,
    maxEntitiesPerDoc: env.MAX_ENTITIES_PER_DOCUMENT,
    force: false,
  });

  // Index entity and relationship embeddings after graph extraction
  if (result.nodes > 0 || result.relationships > 0) {
    logger.info({
      msg: `🔮 Indexing entity and relationship embeddings for ${source}`,
    });

    const deps = { vectorStore, recordStore, graphStore };

    const entityStats = await indexEntityEmbeddings(source, deps);
    const relStats = await indexRelationshipEmbeddings(source, deps);

    logger.info({
      msg: `✅ Embedding indexing complete`,
      entityEmbeddingsIndexed: entityStats.indexed,
      entityEmbeddingsSkipped: entityStats.skipped,
      relationshipEmbeddingsIndexed: relStats.indexed,
      relationshipEmbeddingsSkipped: relStats.skipped,
    });
  }

  console.log("✅✅✅✅✅ done", source);
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
  lockDuration: 5 * 60 * 60 * 1000,
});

// Set up worker event handlers
indexGraphWorker.on("completed", (job) => {
  logger.info({
    msg: `✅ Graph index job completed: jobId: ${job.id} for record ${job.data.source}`,
  });
});

indexGraphWorker.on("failed", (job, err) => {
  logger.error(
    { err },
    `❌ Graph index job failed: jobId: ${job?.id} for record ${job?.data.source}`
  );
});

indexGraphWorker.on("error", (err) => {
  logger.error({ err }, "Graph index worker error");
});

indexGraphWorker.on("active", (job) => {
  logger.info({
    msg: `🔄 Graph index job started: jobId: ${job.id} for record ${job.data.source}`,
  });
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
