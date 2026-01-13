# Data Syncing

How Almanac fetches and synchronizes data from MCP servers.

## Overview

Syncing is the first phase of the indexing pipeline, responsible for fetching raw data from MCP servers and storing it in MongoDB for later processing.

```
MCP Server → Fetch Data → MongoDB → Ready for Indexing
```

## Sync Types

### 1. Initial Sync

First-time sync of all available data.

```typescript
// Trigger via API
POST /api/sync
{
  "dataSource": "slack",
  "mode": "full"
}
```

**Process**:

1. Connect to MCP server
2. Discover available tools/resources
3. Fetch all historical data
4. Store in MongoDB with metadata
5. Mark records as "pending indexing"

**Duration**: Depends on data volume

- Small (< 10K records): 5-15 minutes
- Medium (10K - 100K): 30-60 minutes
- Large (> 100K): Hours

### 2. Incremental Sync

Fetch only new/changed records since last sync.

```typescript
POST /api/sync
{
  "dataSource": "slack",
  "mode": "incremental"
}
```

**Process**:

1. Check last sync timestamp
2. Fetch only new records
3. Update changed records
4. Delete removed records
5. Mark as "pending indexing"

**Duration**: Much faster (seconds to minutes)

### 3. Scheduled Sync

Automatic syncing on a schedule.

```typescript
// Configure via API or UI
PUT /api/sync-config
{
  "dataSource": "slack",
  "schedule": "0 */6 * * *",  // Every 6 hours
  "mode": "incremental"
}
```

**Common Schedules**:

- Every hour: `"0 * * * *"`
- Every 6 hours: `"0 */6 * * *"`
- Daily at 2 AM: `"0 2 * * *"`
- Weekly on Sunday: `"0 0 * * 0"`

## Data Sources

### Slack

**Tools Used**:

- `list_channels` - Get all channels
- `get_channel_history` - Fetch messages
- `get_thread_replies` - Fetch thread replies
- `get_users` - Fetch user info

**Sync Strategy**:

```typescript
{
  paginated: true,
  batchSize: 100,
  rateLimit: 50,  // requests per minute
  supportsIncremental: true,
  timestampField: "ts"
}
```

**Data Stored**:

- Messages
- Thread replies
- Channel metadata
- User profiles
- Reactions

### GitHub

**Tools Used**:

- `list_repos` - Get repositories
- `get_issues` - Fetch issues
- `get_pull_requests` - Fetch PRs
- `get_commits` - Fetch commits
- `get_readme` - Fetch documentation

**Sync Strategy**:

```typescript
{
  paginated: true,
  batchSize: 100,
  rateLimit: 5000,  // GitHub API limit
  supportsIncremental: true,
  timestampField: "updated_at"
}
```

**Data Stored**:

- Issues
- Pull requests
- Commits
- Comments
- README files
- Code files

### Notion

**Tools Used**:

- `search` - Search all content
- `get_page` - Fetch page content
- `get_database` - Fetch database
- `get_blocks` - Fetch page blocks

**Sync Strategy**:

```typescript
{
  paginated: true,
  batchSize: 100,
  rateLimit: 3,  // requests per second
  supportsIncremental: true,
  timestampField: "last_edited_time"
}
```

**Data Stored**:

- Pages
- Databases
- Blocks (text content)
- Properties
- Relations

## Sync Configuration

### Via UI

1. Navigate to Data Sources
2. Select data source
3. Click "Sync Settings"
4. Configure options:
   - Sync mode (full/incremental)
   - Schedule (manual/automatic)
   - Filters (channels, repos, etc.)
5. Save and trigger sync

### Via API

```typescript
// Create sync config
POST /api/sync-config
{
  "dataSource": "slack",
  "mode": "incremental",
  "schedule": "0 */6 * * *",
  "filters": {
    "channels": ["engineering", "product"]
  },
  "options": {
    "includeThreads": true,
    "includeDMs": false,
    "maxHistoryDays": 90
  }
}

// Trigger manual sync
POST /api/sync
{
  "dataSource": "slack",
  "mode": "incremental"
}

// Check sync status
GET /api/sync/status?dataSource=slack
```

## Sync Process Details

### 1. Pre-Sync Validation

Before starting:

```typescript
// Validate MCP server connection
const connected = await mcpClient.ping();
if (!connected) {
  throw new Error("MCP server not connected");
}

// Validate configuration
if (!syncConfig.dataSource) {
  throw new Error("Data source not specified");
}

// Check rate limits
const rateLimit = await checkRateLimit(syncConfig.dataSource);
if (rateLimit.remaining < 10) {
  throw new Error("Rate limit too low, retry later");
}
```

### 2. Data Fetching

Fetch with pagination and rate limiting:

```typescript
const fetchWithPagination = async (tool: string, args: any) => {
  const results = [];
  let cursor = null;

  while (true) {
    // Respect rate limits
    await rateLimiter.wait();

    // Fetch page
    const response = await mcpClient.executeTool(tool, {
      ...args,
      cursor,
    });

    results.push(...response.data);

    // Check if more pages
    if (!response.next_cursor) break;
    cursor = response.next_cursor;
  }

  return results;
};
```

### 3. Data Storage

Store in MongoDB with metadata:

```typescript
const storeRecord = async (record: any, source: string) => {
  await RecordModel.updateOne(
    {
      source,
      sourceId: record.id,
    },
    {
      $set: {
        content: record.content,
        metadata: record.metadata,
        primaryDate: record.timestamp,
        lastSynced: new Date(),
        indexStatus: "pending",
      },
    },
    { upsert: true }
  );
};
```

### 4. Batch Processing

Process in batches for efficiency:

```typescript
const BATCH_SIZE = 100;
const CONCURRENCY = 32;

const processBatches = async (records: any[]) => {
  const batches = chunk(records, BATCH_SIZE);

  await pMap(
    batches,
    async (batch) => {
      await Promise.all(batch.map((r) => storeRecord(r)));
    },
    { concurrency: CONCURRENCY }
  );
};
```

### 5. Error Handling

Handle failures gracefully:

```typescript
try {
  await syncDataSource(config);
} catch (error) {
  // Log error
  logger.error("Sync failed", { error, dataSource: config.dataSource });

  // Update sync status
  await SyncStatus.updateOne(
    { dataSource: config.dataSource },
    {
      status: "failed",
      error: error.message,
      lastAttempt: new Date(),
    }
  );

  // Retry if transient error
  if (isTransientError(error)) {
    scheduleRetry(config);
  }
}
```

## Performance Optimization

### 1. Parallel Fetching

Fetch multiple resources in parallel:

```typescript
// ❌ Sequential (slow)
const channels = await fetchChannels();
const users = await fetchUsers();
const messages = await fetchMessages();

// ✅ Parallel (3x faster)
const [channels, users, messages] = await Promise.all([
  fetchChannels(),
  fetchUsers(),
  fetchMessages(),
]);
```

### 2. Rate Limit Management

Stay within API limits:

```typescript
class RateLimiter {
  private requests = 0;
  private window = 60000; // 1 minute
  private max = 50; // 50 requests per minute

  async wait() {
    if (this.requests >= this.max) {
      const delay = this.window - (Date.now() % this.window);
      await sleep(delay);
      this.requests = 0;
    }
    this.requests++;
  }
}
```

### 3. Incremental Sync Optimization

Only fetch what changed:

```typescript
const lastSync = await getLastSyncTime(dataSource);

// Only fetch records after last sync
const newRecords = await fetchRecords({
  since: lastSync,
  limit: 1000,
});

// Much faster than full sync
console.log(`Fetched ${newRecords.length} new records`);
```

### 4. Caching

Cache frequently accessed data:

```typescript
// Cache channel/user metadata (changes rarely)
const channels = await cache.getOrFetch(
  "slack:channels",
  async () => {
    return await fetchChannels();
  },
  3600
); // Cache for 1 hour

// Don't cache messages (changes frequently)
const messages = await fetchMessages(); // No cache
```

## Monitoring

### Sync Status

Track sync progress:

```typescript
interface SyncStatus {
  dataSource: string;
  status: "idle" | "running" | "completed" | "failed";
  progress: {
    total: number;
    processed: number;
    failed: number;
  };
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}
```

### Metrics

Monitor sync performance:

```typescript
// Track metrics
metrics.gauge("sync.records_processed", recordsProcessed);
metrics.gauge("sync.duration_seconds", duration);
metrics.gauge("sync.rate_limit_remaining", rateLimitRemaining);
metrics.increment("sync.errors", errorCount);
```

### Alerts

Set up alerts for issues:

```typescript
if (syncDuration > 60 * 60 * 1000) {
  // 1 hour
  alert("Sync taking too long", { dataSource, duration: syncDuration });
}

if (errorRate > 0.1) {
  // 10% errors
  alert("High error rate during sync", { dataSource, errorRate });
}

if (rateLimitRemaining < 10) {
  alert("Rate limit nearly exhausted", { dataSource, remaining });
}
```

## Troubleshooting

### Sync Stuck

```bash
# Check sync status
curl http://localhost:3000/api/sync/status?dataSource=slack

# Cancel stuck sync
curl -X POST http://localhost:3000/api/sync/cancel \
  -d '{"dataSource":"slack"}'

# Restart sync
curl -X POST http://localhost:3000/api/sync \
  -d '{"dataSource":"slack","mode":"incremental"}'
```

### Rate Limit Exceeded

```typescript
// Reduce concurrency
CONCURRENCY=16  # Default is 32

// Increase delays
RATE_LIMIT_DELAY=2000  # 2 seconds between requests
```

### Duplicate Records

```typescript
// Check for duplicates
db.records.aggregate([
  {
    $group: {
      _id: { source: "$source", sourceId: "$sourceId" },
      count: { $sum: 1 },
    },
  },
  { $match: { count: { $gt: 1 } } },
]);

// Remove duplicates
await removeDuplicates();
```

### Missing Records

```bash
# Force full resync
curl -X POST http://localhost:3000/api/sync \
  -d '{"dataSource":"slack","mode":"full","force":true}'
```

## Best Practices

### 1. Start with Incremental

```typescript
// ✅ Good - Fast, efficient
schedule: "0 */6 * * *",  // Every 6 hours
mode: "incremental"

// ❌ Bad - Slow, wasteful
schedule: "0 */6 * * *",
mode: "full"  // Don't do full sync repeatedly
```

### 2. Filter Unnecessary Data

```typescript
// ✅ Good - Only sync what you need
filters: {
  channels: ["engineering", "product"],
  excludeArchived: true,
  maxHistoryDays: 90
}

// ❌ Bad - Sync everything
filters: {}  // Will sync all channels, all history
```

### 3. Monitor Sync Health

```typescript
// Set up health checks
setInterval(async () => {
  const status = await getSyncStatus();
  if (status.lastSync < Date.now() - 24 * 60 * 60 * 1000) {
    alert("Sync hasn't run in 24 hours");
  }
}, 60 * 60 * 1000); // Check every hour
```

### 4. Handle Failures Gracefully

```typescript
// Retry with exponential backoff
const retry = async (fn: Function, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
};
```

## Next Steps

- **[Vector Indexing](vector-indexing.md)** - Next phase of the pipeline
- **[Graph Indexing](graph-indexing.md)** - Building the knowledge graph
- **[Data Pipeline Overview](README.md)** - Complete pipeline documentation
