import { ConnectionOptions } from "bullmq";
import { createRedisOptions } from "../../connections/redis.js";

export enum QUEUE_NAME {
  SYNC_MCP_SERVER = "SYNC_MCP_SERVER",
  INDEX_VECTOR = "INDEX_VECTOR",
  INDEX_GRAPH = "INDEX_GRAPH",
}

export const createRedisConnection = (): ConnectionOptions => {
  return {
    ...createRedisOptions(),
    maxRetriesPerRequest: null, // Required for BullMQ
  };
};
