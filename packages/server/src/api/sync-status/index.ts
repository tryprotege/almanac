import { Request, Response, Router } from "express";
import { syncMcpServerQueue } from "../../services/queue/sync.queue.js";
import { indexVectorQueue } from "../../services/queue/index-vector.queue.js";
import { indexGraphQueue } from "../../services/queue/index-graph.queue.js";
import logger from "../../utils/logger.js";

const syncStatusRouter: Router = Router();

export interface SyncJobStatus {
  serverName: string;
  status: "queued" | "processing" | "completed" | "failed";
  jobType: "sync" | "index-vector" | "index-graph";
  jobId?: string;
  progress?: number;
  error?: string;
}

export interface SyncStatusResponse {
  syncing: SyncJobStatus[];
  queued: SyncJobStatus[];
}

// GET /api/sync-status - Get current sync job statuses
syncStatusRouter.get("/", async (_req: Request, res: Response) => {
  try {
    // Get jobs from all three queues
    const [
      syncActiveJobs,
      syncWaitingJobs,
      syncDelayedJobs,
      vectorActiveJobs,
      vectorWaitingJobs,
      vectorDelayedJobs,
      graphActiveJobs,
      graphWaitingJobs,
      graphDelayedJobs,
    ] = await Promise.all([
      syncMcpServerQueue.getActive(),
      syncMcpServerQueue.getWaiting(),
      syncMcpServerQueue.getDelayed(),
      indexVectorQueue.getActive(),
      indexVectorQueue.getWaiting(),
      indexVectorQueue.getDelayed(),
      indexGraphQueue.getActive(),
      indexGraphQueue.getWaiting(),
      indexGraphQueue.getDelayed(),
    ]);

    // Map active jobs to status
    const processingStatuses: SyncJobStatus[] = [
      ...syncActiveJobs.map((job) => ({
        serverName: job.data.mcpConfig.name,
        status: "processing" as const,
        jobType: "sync" as const,
        jobId: job.id?.toString(),
        progress: job.progress as number | undefined,
      })),
      ...vectorActiveJobs.map((job) => ({
        serverName: job.data.source,
        status: "processing" as const,
        jobType: "index-vector" as const,
        jobId: job.id?.toString(),
        progress: job.progress as number | undefined,
      })),
      ...graphActiveJobs.map((job) => ({
        serverName: job.data.source,
        status: "processing" as const,
        jobType: "index-graph" as const,
        jobId: job.id?.toString(),
        progress: job.progress as number | undefined,
      })),
    ];

    // Map waiting and delayed jobs to status
    const queuedStatuses: SyncJobStatus[] = [
      ...syncWaitingJobs.map((job) => ({
        serverName: job.data.mcpConfig.name,
        status: "queued" as const,
        jobType: "sync" as const,
        jobId: job.id?.toString(),
      })),
      ...syncDelayedJobs.map((job) => ({
        serverName: job.data.mcpConfig.name,
        status: "queued" as const,
        jobType: "sync" as const,
        jobId: job.id?.toString(),
      })),
      ...vectorWaitingJobs.map((job) => ({
        serverName: job.data.source,
        status: "queued" as const,
        jobType: "index-vector" as const,
        jobId: job.id?.toString(),
      })),
      ...vectorDelayedJobs.map((job) => ({
        serverName: job.data.source,
        status: "queued" as const,
        jobType: "index-vector" as const,
        jobId: job.id?.toString(),
      })),
      ...graphWaitingJobs.map((job) => ({
        serverName: job.data.source,
        status: "queued" as const,
        jobType: "index-graph" as const,
        jobId: job.id?.toString(),
      })),
      ...graphDelayedJobs.map((job) => ({
        serverName: job.data.source,
        status: "queued" as const,
        jobType: "index-graph" as const,
        jobId: job.id?.toString(),
      })),
    ];

    const response: SyncStatusResponse = {
      syncing: processingStatuses,
      queued: queuedStatuses,
    };

    res.json({
      success: true,
      data: response,
    });
  } catch (err) {
    logger.error({ err }, "Error fetching sync status");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/sync-status/:serverName - Get sync status for a specific server
syncStatusRouter.get("/:serverName", async (req: Request, res: Response) => {
  try {
    const { serverName } = req.params;

    // Check all job states for this server across all queues
    const [
      syncActiveJobs,
      syncWaitingJobs,
      syncDelayedJobs,
      syncCompletedJobs,
      syncFailedJobs,
      vectorActiveJobs,
      vectorWaitingJobs,
      vectorDelayedJobs,
      vectorCompletedJobs,
      vectorFailedJobs,
      graphActiveJobs,
      graphWaitingJobs,
      graphDelayedJobs,
      graphCompletedJobs,
      graphFailedJobs,
    ] = await Promise.all([
      syncMcpServerQueue.getActive(),
      syncMcpServerQueue.getWaiting(),
      syncMcpServerQueue.getDelayed(),
      syncMcpServerQueue.getCompleted(),
      syncMcpServerQueue.getFailed(),
      indexVectorQueue.getActive(),
      indexVectorQueue.getWaiting(),
      indexVectorQueue.getDelayed(),
      indexVectorQueue.getCompleted(),
      indexVectorQueue.getFailed(),
      indexGraphQueue.getActive(),
      indexGraphQueue.getWaiting(),
      indexGraphQueue.getDelayed(),
      indexGraphQueue.getCompleted(),
      indexGraphQueue.getFailed(),
    ]);

    // Helper to find job and return status
    const findJobStatus = (
      activeJobs: any[],
      waitingJobs: any[],
      delayedJobs: any[],
      completedJobs: any[],
      failedJobs: any[],
      jobType: "sync" | "index-vector" | "index-graph"
    ): SyncJobStatus | null => {
      // Determine how to match server name based on job type
      const matchesServerName = (job: any) => {
        if (jobType === "sync") {
          return job.data.mcpConfig.name === serverName;
        } else {
          // index-vector and index-graph use source
          return job.data.source === serverName;
        }
      };

      // Check active
      const activeJob = activeJobs.find(matchesServerName);
      if (activeJob) {
        return {
          serverName,
          status: "processing",
          jobType,
          jobId: activeJob.id?.toString(),
          progress: activeJob.progress as number | undefined,
        };
      }

      // Check waiting or delayed
      const queuedJob =
        waitingJobs.find(matchesServerName) ||
        delayedJobs.find(matchesServerName);
      if (queuedJob) {
        return {
          serverName,
          status: "queued",
          jobType,
          jobId: queuedJob.id?.toString(),
        };
      }

      // Check completed
      const recentCompleted = completedJobs
        .filter(matchesServerName)
        .slice(0, 1)[0];
      if (recentCompleted) {
        return {
          serverName,
          status: "completed",
          jobType,
          jobId: recentCompleted.id?.toString(),
        };
      }

      // Check failed
      const recentFailed = failedJobs.filter(matchesServerName).slice(0, 1)[0];
      if (recentFailed) {
        return {
          serverName,
          status: "failed",
          jobType,
          jobId: recentFailed.id?.toString(),
          error: recentFailed.failedReason,
        };
      }

      return null;
    };

    // Check all three queue types
    const syncStatus = findJobStatus(
      syncActiveJobs,
      syncWaitingJobs,
      syncDelayedJobs,
      syncCompletedJobs,
      syncFailedJobs,
      "sync"
    );

    const vectorStatus = findJobStatus(
      vectorActiveJobs,
      vectorWaitingJobs,
      vectorDelayedJobs,
      vectorCompletedJobs,
      vectorFailedJobs,
      "index-vector"
    );

    const graphStatus = findJobStatus(
      graphActiveJobs,
      graphWaitingJobs,
      graphDelayedJobs,
      graphCompletedJobs,
      graphFailedJobs,
      "index-graph"
    );

    // Return all statuses found for this server
    const statuses = [syncStatus, vectorStatus, graphStatus].filter(
      (s) => s !== null
    );

    if (statuses.length > 0) {
      return res.json({
        success: true,
        data: statuses,
      });
    }

    // No jobs found for this server
    res.json({
      success: true,
      data: null,
    });
  } catch (err) {
    logger.error(
      { err, serverName: req.params.serverName },
      "Error fetching sync status for server"
    );
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export { syncStatusRouter };
