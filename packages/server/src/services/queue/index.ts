import { Worker } from "bullmq";

import { indexGraphWorker } from "./index-graph.queue.js";
import { indexVectorWorker } from "./index-vector.queue.js";
import { syncMcpServerWorker } from "./sync.queue.js";
import { QUEUE_NAME } from "./config.js";

const workerMap: Record<QUEUE_NAME, Worker> = {
  [QUEUE_NAME.SYNC_MCP_SERVER]: syncMcpServerWorker,
  [QUEUE_NAME.INDEX_VECTOR]: indexVectorWorker,
  [QUEUE_NAME.INDEX_GRAPH]: indexGraphWorker,
};

export const initWorkers = async () => {
  await Promise.all(Object.values(workerMap).map((worker) => worker.run()));
};
