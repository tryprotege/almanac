import { Queue, Worker, Job } from "bullmq";
import { IndexRequest, IndexResponse } from "../../contracts/index.js";
import { IndexingService } from "../indexing/indexing.service.js";
import { env } from "../../env.js";
import { Redis } from "ioredis";

/**
 * Indexer Service - Worker + Queue System
 * Handles asynchronous indexing jobs using BullMQ
 */

// Job data type
interface IndexJob {
  request: IndexRequest;
  priority?: "high" | "normal" | "low";
}

// Job status storage
interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  request: IndexRequest;
  response?: IndexResponse;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export class IndexerService {
  private queue: Queue;
  private worker: Worker;
  private jobStatuses: Map<string, JobStatus>;
  private redis: Redis;

  constructor(
    private indexingService: IndexingService,
    private redisConnection?: {
      host: string;
      port: number;
      password?: string;
    }
  ) {
    // Use provided connection or default from env
    const connection = redisConnection || {
      host: env.REDIS_HOST || "localhost",
      port: Number(env.REDIS_PORT || 6379),
      password: env.REDIS_PASSWORD,
    };

    // Create Redis client for job status storage
    this.redis = new Redis({
      host: connection.host,
      port: connection.port,
      password: connection.password,
    });

    // Create job status map (could be replaced with Redis)
    this.jobStatuses = new Map();

    // Create queue
    this.queue = new Queue("indexing", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
          age: 24 * 3600, // 24 hours
        },
        removeOnFail: {
          count: 500, // Keep last 500 failed jobs for debugging
        },
      },
    });

    // Create worker
    this.worker = new Worker(
      "indexing",
      async (job: Job<IndexJob>) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: 5, // Process 5 jobs concurrently
      }
    );

    // Setup event listeners
    this.setupEventListeners();

    console.log("✅ Indexer service initialized");
  }

  /**
   * Add indexing job to queue
   */
  async addJob(request: IndexRequest): Promise<{ jobId: string }> {
    const priority = request.options?.priority || "normal";

    // Priority mapping: high=1, normal=2, low=3 (lower number = higher priority)
    const priorityValue = priority === "high" ? 1 : priority === "low" ? 3 : 2;

    const job = await this.queue.add(
      "index",
      { request, priority },
      { priority: priorityValue }
    );

    const jobId = job.id as string;

    // Store initial status
    const status: JobStatus = {
      jobId,
      status: "queued",
      request,
      queuedAt: new Date(),
    };

    this.jobStatuses.set(jobId, status);
    await this.saveJobStatus(status);

    console.log(`[Queue] Added job ${jobId} with priority ${priority}`);

    return { jobId };
  }

  /**
   * Add multiple jobs in batch
   */
  async addBatch(requests: IndexRequest[]): Promise<{ jobIds: string[] }> {
    const jobs = requests.map((request) => ({
      name: "index",
      data: { request, priority: request.options?.priority || "normal" },
      opts: {
        priority:
          request.options?.priority === "high"
            ? 1
            : request.options?.priority === "low"
            ? 3
            : 2,
      },
    }));

    const addedJobs = await this.queue.addBulk(jobs);
    const jobIds = addedJobs.map((job) => job.id as string);

    // Store statuses
    for (let i = 0; i < addedJobs.length; i++) {
      const status: JobStatus = {
        jobId: jobIds[i],
        status: "queued",
        request: requests[i],
        queuedAt: new Date(),
      };
      this.jobStatuses.set(jobIds[i], status);
      await this.saveJobStatus(status);
    }

    console.log(`[Queue] Added ${jobIds.length} jobs in batch`);

    return { jobIds };
  }

  /**
   * Get job status
   */
  async getStatus(jobId: string): Promise<IndexResponse> {
    // Try to get from cache first
    let status = this.jobStatuses.get(jobId);

    // If not in cache, try to load from Redis
    if (!status) {
      const loadedStatus = await this.loadJobStatus(jobId);
      if (loadedStatus) {
        status = loadedStatus;
        this.jobStatuses.set(jobId, loadedStatus);
      }
    }

    if (!status) {
      return {
        jobId,
        status: "failed",
        error: "Job not found",
      };
    }

    if (status.response) {
      return status.response;
    }

    // Job is still in progress
    return {
      jobId,
      status: status.status,
    };
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job<IndexJob>): Promise<IndexResponse> {
    const jobId = job.id as string;
    const { request } = job.data;

    console.log(`[Worker] Processing job ${jobId}`);

    // Update status to processing
    const status = this.jobStatuses.get(jobId);
    if (status) {
      status.status = "processing";
      status.startedAt = new Date();
      await this.saveJobStatus(status);
    }

    try {
      // Call the indexing service
      const response = await this.indexingService.index(request);

      // Update status to completed
      if (status) {
        status.status = "completed";
        status.completedAt = new Date();
        status.response = response;
        await this.saveJobStatus(status);
      }

      console.log(
        `[Worker] Completed job ${jobId}: ${response.stats?.resourcesIndexed} indexed`
      );

      return response;
    } catch (error) {
      console.error(`[Worker] Failed job ${jobId}:`, error);

      const errorResponse: IndexResponse = {
        jobId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };

      // Update status to failed
      if (status) {
        status.status = "failed";
        status.completedAt = new Date();
        status.response = errorResponse;
        await this.saveJobStatus(status);
      }

      throw error; // Re-throw for BullMQ retry logic
    }
  }

  /**
   * Setup event listeners for queue monitoring
   */
  private setupEventListeners() {
    this.worker.on("completed", (job) => {
      console.log(`[Worker] ✅ Job ${job.id} completed`);
    });

    this.worker.on("failed", (job, error) => {
      console.error(`[Worker] ❌ Job ${job?.id} failed:`, error.message);
    });

    this.worker.on("stalled", (jobId) => {
      console.warn(`[Worker] ⚠️  Job ${jobId} stalled`);
    });

    this.queue.on("error", (error) => {
      console.error("[Queue] Error:", error);
    });
  }

  /**
   * Save job status to Redis
   */
  private async saveJobStatus(status: JobStatus): Promise<void> {
    try {
      const key = `job:status:${status.jobId}`;
      await this.redis.setex(
        key,
        86400 * 7, // 7 days TTL
        JSON.stringify(status)
      );
    } catch (error) {
      console.error("Failed to save job status:", error);
    }
  }

  /**
   * Load job status from Redis
   */
  private async loadJobStatus(jobId: string): Promise<JobStatus | null> {
    try {
      const key = `job:status:${jobId}`;
      const data = await this.redis.get(key);
      if (!data) return null;

      const status = JSON.parse(data);
      // Convert date strings back to Date objects
      status.queuedAt = new Date(status.queuedAt);
      if (status.startedAt) status.startedAt = new Date(status.startedAt);
      if (status.completedAt) status.completedAt = new Date(status.completedAt);

      return status;
    } catch (error) {
      console.error("Failed to load job status:", error);
      return null;
    }
  }

  /**
   * Get queue metrics
   */
  async getMetrics() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Pause the queue
   */
  async pause() {
    await this.queue.pause();
    console.log("[Queue] Paused");
  }

  /**
   * Resume the queue
   */
  async resume() {
    await this.queue.resume();
    console.log("[Queue] Resumed");
  }

  /**
   * Graceful shutdown
   */
  async close() {
    console.log("[Indexer] Shutting down...");

    await this.worker.close();
    await this.queue.close();
    await this.redis.quit();

    console.log("[Indexer] Shutdown complete");
  }
}
