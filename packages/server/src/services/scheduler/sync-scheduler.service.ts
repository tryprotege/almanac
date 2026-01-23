import { DataSourceModel } from '../../models/data-source.model.js';
import { MCPSyncStateModel } from '../../models/mcp-sync-state.model.js';
import { SyncMcpServerJobData, syncMcpServerQueue } from '../queue/sync.queue.js';
import { indexVectorQueue } from '../queue/index-vector.queue.js';
import { indexGraphQueue } from '../queue/index-graph.queue.js';
import { env } from '../../env.js';
import logger from '../../utils/logger.js';
import { JobSchedulerJson } from 'bullmq';
import cronParser from 'cron-parser';

// ============================================================================
// Types
// ============================================================================

type DataSource = {
  name: string;
  lastSyncAt: Date | null | undefined;
  isDisabled: boolean;
};

type SchedulerConfig = {
  cronSchedule: string | undefined;
  timezone: string;
};

type SchedulerState = {
  isInitialized: boolean;
};

type SyncDecision = {
  needsSync: boolean;
  reason: string;
  hoursSinceLastSync?: string;
};

type ScheduledJob = {
  name: string;
  id: string | null | undefined;
  pattern: string | undefined;
  next: number;
  tz: string | undefined;
};

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Validate cron expression format
 */
const validateCronExpression = (expression: string): boolean => {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const patterns = [
    /^(\*|([0-9]|[1-5][0-9])(\/[0-9]+)?|\*\/[0-9]+|[0-9]+-[0-9]+)$/, // minute (0-59)
    /^(\*|([0-9]|1[0-9]|2[0-3])(\/[0-9]+)?|\*\/[0-9]+|[0-9]+-[0-9]+)$/, // hour (0-23)
    /^(\*|([1-9]|[12][0-9]|3[01])(\/[0-9]+)?|\*\/[0-9]+|[0-9]+-[0-9]+)$/, // day (1-31)
    /^(\*|([1-9]|1[0-2])(\/[0-9]+)?|\*\/[0-9]+|[0-9]+-[0-9]+)$/, // month (1-12)
    /^(\*|[0-6](\/[0-9]+)?|\*\/[0-9]+|[0-9]+-[0-9]+)$/, // weekday (0-6)
  ];

  return parts.every((part, i) => patterns[i].test(part));
};

/**
 * Convert milliseconds to hours with one decimal place
 */
const millisecondsToHours = (ms: number): string => (ms / (1000 * 60 * 60)).toFixed(1);

/**
 * Get previous scheduled sync time from cron expression
 */
const getPreviousScheduledSync = (
  cronExpression: string,
  timezone: string,
  currentDate: Date = new Date(),
): Date | null => {
  try {
    const interval = cronParser.parseExpression(cronExpression, {
      currentDate,
      tz: timezone,
    });
    return interval.prev().toDate();
  } catch (err) {
    logger.error({ err, cronExpression, timezone }, 'Failed to parse cron expression');
    return null;
  }
};

/**
 * Determine if a data source needs sync based on last sync time and cron schedule
 */
const decideSyncNeed = (
  lastSyncAt: Date | null | undefined,
  cronExpression: string,
  timezone: string,
): SyncDecision => {
  if (!lastSyncAt) {
    return {
      needsSync: true,
      reason: 'never synced',
    };
  }

  const previousScheduledSync = getPreviousScheduledSync(cronExpression, timezone);

  if (!previousScheduledSync) {
    return {
      needsSync: false,
      reason: 'invalid cron expression',
    };
  }

  // If last sync was before the previous scheduled sync time, we need to sync
  const needsSync = lastSyncAt < previousScheduledSync;
  const timeSinceLastSync = Date.now() - lastSyncAt.getTime();
  const hoursSinceLastSync = millisecondsToHours(timeSinceLastSync);

  return {
    needsSync,
    reason: needsSync ? 'missed scheduled sync' : 'synced after last scheduled time',
    hoursSinceLastSync,
  };
};

/**
 * Filter data sources that need sync
 */
const filterDataSourcesNeedingSync = (
  dataSources: DataSource[],
  cronExpression: string,
  timezone: string,
): string[] =>
  dataSources
    .filter((ds) => decideSyncNeed(ds.lastSyncAt, cronExpression, timezone).needsSync)
    .map((ds) => ds.name);

/**
 * Log sync decision
 */
const logSyncDecision = (
  dataSourceName: string,
  decision: SyncDecision,
  lastSyncAt: Date | null | undefined,
): void => {
  if (decision.needsSync) {
    logger.debug(
      {
        dataSourceName,
        lastSyncAt: lastSyncAt?.toISOString(),
        hoursSinceLastSync: decision.hoursSinceLastSync,
      },
      `Data source ${decision.reason} - needs startup sync`,
    );
  } else {
    logger.debug(
      {
        dataSourceName,
        lastSyncAt: lastSyncAt?.toISOString(),
        hoursSinceLastSync: decision.hoursSinceLastSync,
      },
      'Data source synced recently - skipping startup sync',
    );
  }
};

/**
 * Get current scheduler configuration
 */
const getSchedulerConfig = (): SchedulerConfig => ({
  cronSchedule: env.SYNC_CRON_SCHEDULE,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

/**
 * Generate job ID for a data source
 */
const generateJobId = (prefix: string, dataSourceName: string): string =>
  `${prefix}-${dataSourceName}-${Date.now()}`;

/**
 * Generate schedule job ID
 */
const generateScheduleJobId = (dataSourceName: string): string => `schedule-${dataSourceName}`;

/**
 * Check if job matches data source
 */
const isJobForDataSource = (
  job: { name: string; id?: string | null },
  dataSourceName: string,
): boolean => job.name === dataSourceName || job.id === generateScheduleJobId(dataSourceName);

/**
 * Filter jobs for a specific data source
 */
const filterJobsForDataSource = (
  jobs: Array<{ name: string; id?: string | null; key: string }>,
  dataSourceName: string,
): Array<{ name: string; id?: string | null; key: string }> =>
  jobs.filter((job) => isJobForDataSource(job, dataSourceName));

/**
 * Map repeatable job to scheduled job format
 */
const mapToScheduledJob = (job: JobSchedulerJson<SyncMcpServerJobData>): ScheduledJob => ({
  name: job.name,
  id: job.id,
  pattern: job.pattern,
  next: job.next!,
  tz: job.tz,
});

// ============================================================================
// Effect Functions (I/O, Side Effects)
// ============================================================================

/**
 * Clear all pending jobs from all queues
 */
const clearSyncQueue = async (): Promise<void> => {
  try {
    // Clear sync queue
    const syncJobSchedulers = await syncMcpServerQueue.getJobSchedulers();
    await Promise.all(
      syncJobSchedulers.map((job) => syncMcpServerQueue.removeJobScheduler(job.key)),
    );
    await syncMcpServerQueue.obliterate({ force: true });

    // Clear index vector queue
    await indexVectorQueue.obliterate({ force: true });

    // Clear index graph queue
    await indexGraphQueue.obliterate({ force: true });

    logger.info('Successfully cleared all jobs from sync, vector, and graph queues');
  } catch (err) {
    logger.error({ err }, 'Failed to clear queues - continuing anyway');
  }
};

/**
 * Reset any MCP sync states that were in 'syncing' status when the server stopped.
 * These syncs were interrupted and should be resynced.
 */
const resetIncompleteSyncs = async (): Promise<Set<string>> => {
  try {
    // First, find all incomplete syncs
    const incompleteSyncs = await MCPSyncStateModel.find({ status: 'syncing' }, { serverName: 1 });

    if (incompleteSyncs.length === 0) {
      logger.debug('No incomplete syncs found to reset');
      return new Set();
    }

    const serverNames = new Set(incompleteSyncs.map((sync) => sync.serverName));

    // Then reset them with audit trail
    await MCPSyncStateModel.updateMany(
      { status: 'syncing' },
      {
        $set: {
          status: 'idle',
          updatedAt: new Date(),
          lastError: {
            message: 'Sync interrupted by server shutdown',
            occurredAt: new Date(),
          },
        },
      },
    );

    logger.info(
      { count: serverNames.size, servers: Array.from(serverNames) },
      'Reset incomplete syncs to idle status',
    );

    return serverNames;
  } catch (error) {
    logger.error({ error }, 'Failed to reset incomplete syncs - continuing anyway');
    return new Set();
  }
};

/**
 * Fetch enabled data sources from database
 */
const fetchEnabledDataSources = async (): Promise<DataSource[]> =>
  await DataSourceModel.find({ isDisabled: false });

/**
 * Fetch data source by name from database
 */
const fetchDataSourceByName = async (name: string): Promise<DataSource | null> =>
  await DataSourceModel.findOne({ name });

/**
 * Queue a sync job for a data source
 */
const queueSyncJob = async (
  dataSourceName: string,
  dataSource: DataSource,
  jobIdPrefix: string,
): Promise<void> => {
  await syncMcpServerQueue.add(
    dataSourceName,
    { mcpConfig: dataSource as any },
    { jobId: generateJobId(jobIdPrefix, dataSourceName) },
  );
};

/**
 * Queue a recurring sync job with cron schedule
 */
const queueRecurringSyncJob = async (
  dataSourceName: string,
  dataSource: DataSource,
  cronExpression: string,
  timezone: string,
): Promise<void> => {
  await syncMcpServerQueue.add(
    dataSourceName,
    { mcpConfig: dataSource as any },
    {
      repeat: {
        pattern: cronExpression,
        tz: timezone,
      },
      jobId: generateScheduleJobId(dataSourceName),
    },
  );
};

/**
 * Remove repeatable jobs for a data source
 */
const removeRepeatableJobsForDataSource = async (dataSourceName: string): Promise<void> => {
  const repeatableJobs = await syncMcpServerQueue.getJobSchedulers();
  const jobsToRemove = filterJobsForDataSource(repeatableJobs, dataSourceName);

  await Promise.all(
    jobsToRemove.map(async (job) => {
      await syncMcpServerQueue.removeJobScheduler(job.key);
      logger.debug({ dataSourceName, key: job.key }, 'Removed repeatable job');
    }),
  );
};

/**
 * Remove all repeatable jobs
 */
const removeAllRepeatableJobs = async (): Promise<void> => {
  const repeatableJobs = await syncMcpServerQueue.getJobSchedulers();
  await Promise.all(repeatableJobs.map((job) => syncMcpServerQueue.removeJobScheduler(job.key)));
};

/**
 * Get all repeatable jobs
 */
const getRepeatableJobs = async (): Promise<ScheduledJob[]> => {
  const jobs = await syncMcpServerQueue.getJobSchedulers();
  return jobs.map(mapToScheduledJob);
};

/**
 * Check if any job exists for a data source
 */
const checkJobExistsForDataSource = async (dataSourceName: string): Promise<boolean> => {
  const repeatableJobs = await syncMcpServerQueue.getRepeatableJobs();
  return repeatableJobs.some((job) => isJobForDataSource(job, dataSourceName));
};

// ============================================================================
// Business Logic Functions
// ============================================================================

/**
 * Process startup syncs for data sources that need it
 */
const processStartupSyncs = async (
  dataSources: DataSource[],
  sourcesNeedingSync: string[],
  incompleteSyncs: Set<string>,
  cronSchedule: string,
): Promise<void> => {
  // Combine sources that missed scheduled sync with sources that were interrupted
  const allSourcesNeedingSync = new Set([...sourcesNeedingSync, ...incompleteSyncs]);

  if (allSourcesNeedingSync.size === 0) {
    logger.info(
      { cronSchedule },
      'No data sources need startup sync (all synced after last scheduled time)',
    );
    return;
  }

  logger.info(
    {
      count: allSourcesNeedingSync.size,
      sources: Array.from(allSourcesNeedingSync),
      missedScheduled: sourcesNeedingSync.length,
      interrupted: incompleteSyncs.size,
      cronSchedule,
    },
    'Triggering startup syncs for data sources',
  );

  await Promise.all(
    Array.from(allSourcesNeedingSync).map(async (dataSourceName) => {
      const dataSource = dataSources.find((ds) => ds.name === dataSourceName);
      if (!dataSource) return;

      try {
        const reason = incompleteSyncs.has(dataSourceName) ? 'interrupted' : 'missed-schedule';
        await queueSyncJob(dataSourceName, dataSource, `startup-${reason}`);
        logger.info({ dataSourceName, reason }, 'Queued startup sync for data source');
      } catch (err) {
        logger.error({ err, dataSourceName }, 'Failed to queue startup sync');
      }
    }),
  );
};

/**
 * Schedule recurring syncs for data sources
 */
const scheduleRecurringSyncs = async (
  dataSources: DataSource[],
  cronSchedule: string,
  timezone: string,
): Promise<void> => {
  await Promise.all(
    dataSources.map(async (dataSource) => {
      try {
        // Remove existing schedule
        await removeRepeatableJobsForDataSource(dataSource.name);

        // Fetch fresh data source to ensure we have latest data
        const freshDataSource = await fetchDataSourceByName(dataSource.name);
        if (!freshDataSource) {
          throw new Error(`Data source '${dataSource.name}' not found`);
        }

        // Queue recurring job
        await queueRecurringSyncJob(dataSource.name, freshDataSource, cronSchedule, timezone);

        logger.info(
          {
            dataSourceName: dataSource.name,
            cronExpression: cronSchedule,
            timezone,
          },
          'Scheduled recurring sync job',
        );
      } catch (err) {
        logger.error(
          { err, dataSourceName: dataSource.name },
          'Failed to schedule recurring job during initialization',
        );
      }
    }),
  );
};

/**
 * Schedule a single data source
 */
const scheduleDataSource = async (
  dataSourceName: string,
  cronExpression: string,
  timezone: string,
): Promise<void> => {
  const dataSource = await fetchDataSourceByName(dataSourceName);
  if (!dataSource) {
    throw new Error(`Data source '${dataSourceName}' not found`);
  }

  await removeRepeatableJobsForDataSource(dataSourceName);
  await queueRecurringSyncJob(dataSourceName, dataSource, cronExpression, timezone);

  logger.debug(
    { dataSourceName, cronExpression, timezone },
    'Scheduled recurring sync job with BullMQ',
  );
};

/**
 * Unschedule a data source
 */
const unscheduleDataSource = async (dataSourceName: string): Promise<void> => {
  try {
    await removeRepeatableJobsForDataSource(dataSourceName);
  } catch (err) {
    logger.error({ err, dataSourceName }, 'Failed to unschedule job');
  }
};

// ============================================================================
// Main Orchestration Functions
// ============================================================================

/**
 * Initialize the hybrid scheduler
 */
const initialize = async (state: SchedulerState): Promise<SchedulerState> => {
  if (state.isInitialized) {
    logger.warn('Scheduler already initialized');
    return state;
  }

  try {
    logger.info('Initializing hybrid sync scheduler...');

    // Step 0: Clear the sync queue of any pending jobs from previous server session
    logger.info('Clearing sync queue...');
    await clearSyncQueue();

    // Step 1: Reset any incomplete syncs from previous server shutdown
    logger.info('Checking for incomplete syncs...');
    const incompleteSyncs = await resetIncompleteSyncs();

    const config = getSchedulerConfig();
    const dataSources = await fetchEnabledDataSources();

    if (dataSources.length === 0) {
      logger.info('No enabled data sources found - skipping scheduler setup');
      return { isInitialized: true };
    }

    // Step 2: Validate cron schedule (required for startup sync logic)
    if (!config.cronSchedule) {
      logger.info('No SYNC_CRON_SCHEDULE configured - checking for interrupted syncs only');

      // Even without cron schedule, we should resync interrupted syncs
      if (incompleteSyncs.size > 0) {
        await processStartupSyncs(dataSources, [], incompleteSyncs, 'none');
      }

      return { isInitialized: true };
    }

    if (!validateCronExpression(config.cronSchedule)) {
      logger.error(
        { cronSchedule: config.cronSchedule },
        'Invalid SYNC_CRON_SCHEDULE - scheduler disabled',
      );
      return { isInitialized: true };
    }

    // Step 3: Identify and process startup syncs based on cron schedule
    const sourcesNeedingSync = filterDataSourcesNeedingSync(
      dataSources,
      config.cronSchedule,
      config.timezone,
    );

    // Log sync decisions for all data sources
    dataSources.forEach((ds) => {
      const decision = decideSyncNeed(ds.lastSyncAt, config.cronSchedule!, config.timezone);
      logSyncDecision(ds.name, decision, ds.lastSyncAt);
    });

    await processStartupSyncs(
      dataSources,
      sourcesNeedingSync,
      incompleteSyncs,
      config.cronSchedule,
    );

    // Step 4: Setup recurring syncs

    await scheduleRecurringSyncs(dataSources, config.cronSchedule, config.timezone);

    logger.info(
      {
        scheduledCount: dataSources.length,
        cronSchedule: config.cronSchedule,
        timezone: config.timezone,
        startupSyncs: sourcesNeedingSync.length + incompleteSyncs.size,
        interrupted: incompleteSyncs.size,
      },
      'Hybrid sync scheduler initialized successfully',
    );

    return { isInitialized: true };
  } catch (err) {
    logger.error({ err }, 'Failed to initialize sync scheduler');
    throw err;
  }
};

/**
 * Refresh schedules - reinitialize all schedules
 */
const refresh = async (): Promise<SchedulerState> => {
  logger.info('Refreshing sync schedules...');

  try {
    await removeAllRepeatableJobs();
    const newState = { isInitialized: false };
    const result = await initialize(newState);
    logger.info('Sync schedules refreshed');
    return result;
  } catch (err) {
    logger.error({ err }, 'Failed to refresh sync schedules');
    throw err;
  }
};

/**
 * Add a schedule for a new data source
 */
const addDataSource = async (dataSourceName: string): Promise<void> => {
  const config = getSchedulerConfig();
  const dataSource = await fetchDataSourceByName(dataSourceName);

  if (!dataSource) {
    logger.error({ dataSourceName }, 'Data source not found');
    return;
  }

  // Setup recurring sync if cron schedule exists
  if (!config.cronSchedule) {
    logger.info(
      { dataSourceName },
      'No SYNC_CRON_SCHEDULE configured - skipping recurring schedule',
    );
    return;
  }

  if (!validateCronExpression(config.cronSchedule)) {
    logger.error(
      { cronSchedule: config.cronSchedule },
      'Invalid SYNC_CRON_SCHEDULE - skipping recurring schedule',
    );
    return;
  }

  // Check if needs immediate sync based on cron schedule
  const decision = decideSyncNeed(dataSource.lastSyncAt, config.cronSchedule, config.timezone);

  if (decision.needsSync) {
    logger.info(
      { dataSourceName },
      'Triggering immediate sync for new data source (missed scheduled sync)',
    );
    try {
      await queueSyncJob(dataSourceName, dataSource, 'add');
    } catch (err) {
      logger.error({ err, dataSourceName }, 'Failed to queue sync');
    }
  }

  try {
    await scheduleDataSource(dataSourceName, config.cronSchedule, config.timezone);
    logger.info(
      {
        dataSourceName,
        cronSchedule: config.cronSchedule,
        timezone: config.timezone,
      },
      'Added recurring schedule for new data source',
    );
  } catch (err) {
    logger.error({ err, dataSourceName }, 'Failed to add recurring schedule');
  }
};

/**
 * Remove schedule for a data source
 */
const removeDataSource = async (dataSourceName: string): Promise<void> => {
  try {
    await unscheduleDataSource(dataSourceName);
    logger.info({ dataSourceName }, 'Removed schedule for data source');
  } catch (err) {
    logger.error({ err, dataSourceName }, 'Failed to remove schedule');
  }
};

/**
 * Shutdown the scheduler
 */
const shutdown = (): SchedulerState => {
  logger.info('Shutting down sync scheduler...');
  logger.info('Sync scheduler shut down (BullMQ will handle cleanup)');
  return { isInitialized: false };
};

// ============================================================================
// Public API - Stateful Wrapper
// ============================================================================

/**
 * Create a sync scheduler with managed state
 */
const createSyncScheduler = () => {
  let state: SchedulerState = { isInitialized: false };

  return {
    initialize: async () => {
      state = await initialize(state);
    },

    refresh: async () => {
      state = await refresh();
    },

    addDataSource,
    removeDataSource,

    getScheduledJobs: getRepeatableJobs,
    isJobScheduled: checkJobExistsForDataSource,

    shutdown: () => {
      state = shutdown();
    },
  };
};

// Export singleton instance
export const syncScheduler = createSyncScheduler();
