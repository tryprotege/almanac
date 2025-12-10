import { Processor, Queue, Worker } from "bullmq";

import { initializeServices } from "../../mcp/initialization.js";
import { MCPServerConfigModel } from "../../models/mcp-config.model.js";
import { GraphStore } from "../../stores/graph.store.js";
import { RecordStore } from "../../stores/record.store.js";
import { SourceType } from "../../types/index.js";
import logger from "../../utils/logger.js";
import { indexAllRecords } from "../indexing/graph/graph-indexer.js";
import { createLLMClient } from "../llm/providers.js";
import { FathomMCPClient } from "../sources/fathom/mcpClient.js";
import { GitHubMCPClient } from "../sources/github/mcpClient.js";
import { NotionMCPClient } from "../sources/notion/mcpClient.js";
import { BaseRecordAdapter } from "../sync/adapters/base-adapter.js";
import { FathomAdapter } from "../sync/adapters/fathom-adapter.js";
import { GitHubAdapter } from "../sync/adapters/github-adapter.js";
import { NotionAdapter } from "../sync/adapters/notion-adapter.js";
import { SlackAdapter } from "../sync/adapters/slack-adapter.js";
import { createRedisConnection, QUEUE_NAME } from "./config.js";
import { env } from "../../env.js";

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
  } else if (source === "slack") {
    const slackMcp = await MCPServerConfigModel.findOne({
      name: "slack",
    });
    const token = slackMcp?.env?.get("SLACK_BOT_TOKEN");

    if (!token) throw new Error("Slack MCP server not configured");

    adapters.set("slack", new SlackAdapter(token));
  }

  if (source === "github") {
    const githubClient = new GitHubMCPClient();
    adapters.set(
      "github",
      new GitHubAdapter(githubClient, {
        includeArchived: false,
        includeForks: true,
        includePrivate: true,
      })
    );
  }

  if (source === "fathom") {
    const fathomClient = new FathomMCPClient();
    adapters.set(
      "fathom",
      new FathomAdapter(fathomClient, {
        includeActionItems: false,
        includeSummaries: true,
        includeTranscripts: true,
      })
    );
  }

  // Create LLM client for extraction
  const openaiClient = createLLMClient();

  // Use functional approach for indexing
  await indexAllRecords(
    source,
    recordStore,
    graphStore,
    adapters,
    openaiClient,
    {
      batchSize: 100,
      concurrency: env.GRAPH_EXTRACTION_CONCURRENCY,
      enableToxicFilter: env.ENABLE_TOXIC_DOCUMENT_FILTER,
      maxEntitiesPerDoc: env.MAX_ENTITIES_PER_DOCUMENT,
      force: false,
    }
  );
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
  logger.info(
    `✅ Graph index job completed: jobId: ${job.id} for record ${job.data.source}`
  );
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
  logger.info(
    `🔄 Graph index job started: jobId: ${job.id} for record ${job.data.source}`
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
