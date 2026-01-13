# Rate Limiting in Indexing Configs

Rate limiting helps prevent hitting API rate limits when syncing data from MCP servers.

## Configuration

Rate limits can be configured globally (for all fetchers) or per-fetcher:

### Global Rate Limiting

```json
{
  "version": "1.0",
  "source": "fathom",
  "rateLimit": {
    "maxRequests": 60,
    "windowSeconds": 60,
    "strategy": "token_bucket",
    "allowBurst": true
  },
  "fetchers": {
    ...
  }
}
```

### Per-Fetcher Rate Limiting

Override global settings for specific fetchers:

```json
{
  "fetchers": {
    "list_meetings": {
      "tool": "list_meetings",
      "rateLimit": {
        "maxRequests": 100,
        "windowSeconds": 60
      }
    },
    "get_transcript": {
      "tool": "get_transcript",
      "rateLimit": {
        "maxRequests": 10,
        "windowSeconds": 60,
        "strategy": "exponential_backoff"
      }
    }
  }
}
```

## Configuration Options

### Required Fields

- **maxRequests**: Maximum number of requests allowed in the time window
- **windowSeconds**: Time window in seconds

### Optional Fields

- **strategy**: Rate limiting strategy (default: "token_bucket")

  - `"token_bucket"`: Proactive rate limiting with burst support (recommended)
  - `"exponential_backoff"`: Reactive backoff on 429 errors
  - `"respect_retry_after"`: Wait for Retry-After header from 429 responses

- **allowBurst**: Allow burst traffic beyond average rate (default: true)

  - Only applies to `token_bucket` strategy
  - When true, allows temporary bursts up to `burstMultiplier` times the limit

- **burstMultiplier**: Burst capacity multiplier (default: 1.5)

  - Example: With `maxRequests: 60` and `burstMultiplier: 1.5`, allows bursts up to 90 requests

- **initialBackoffMs**: Initial backoff delay in milliseconds (default: 1000)

  - Only applies to `exponential_backoff` strategy

- **maxBackoffMs**: Maximum backoff delay in milliseconds (default: 60000)
  - Only applies to `exponential_backoff` strategy

## Strategies

### Token Bucket (Recommended)

Proactive rate limiting that smooths out request rates while allowing bursts:

```json
{
  "rateLimit": {
    "maxRequests": 60,
    "windowSeconds": 60,
    "strategy": "token_bucket",
    "allowBurst": true,
    "burstMultiplier": 1.5
  }
}
```

**Best for**: APIs that allow bursts beyond the average rate (like Notion, Fathom)

### Exponential Backoff

Reactive strategy that backs off exponentially when hitting rate limits:

```json
{
  "rateLimit": {
    "maxRequests": 60,
    "windowSeconds": 60,
    "strategy": "exponential_backoff",
    "initialBackoffMs": 1000,
    "maxBackoffMs": 60000
  }
}
```

**Best for**: APIs with unpredictable rate limits

### Respect Retry-After

Waits for the duration specified in the Retry-After header from 429 responses:

```json
{
  "rateLimit": {
    "maxRequests": 60,
    "windowSeconds": 60,
    "strategy": "respect_retry_after"
  }
}
```

**Best for**: APIs that provide Retry-After headers in 429 responses

## Examples

### Fathom API

Fathom allows an average of 3 requests per second with bursts:

```json
{
  "rateLimit": {
    "maxRequests": 180,
    "windowSeconds": 60,
    "strategy": "token_bucket",
    "allowBurst": true,
    "burstMultiplier": 2.0
  }
}
```

### Notion API

Notion has a soft limit of 3 requests per second with bursts:

```json
{
  "rateLimit": {
    "maxRequests": 180,
    "windowSeconds": 60,
    "strategy": "respect_retry_after",
    "allowBurst": true
  }
}
```

### GitHub API

GitHub has different rate limits for different endpoints:

```json
{
  "rateLimit": {
    "maxRequests": 5000,
    "windowSeconds": 3600
  },
  "fetchers": {
    "search_issues": {
      "tool": "search_issues",
      "rateLimit": {
        "maxRequests": 30,
        "windowSeconds": 60
      }
    }
  }
}
```

## Implementation Details

- Rate limiting is applied per `serverName:toolName` scope
- Each fetcher maintains its own rate limiter instance
- Rate limiters are automatically managed and cleaned up
- Concurrent requests (from `forEach` config) respect rate limits
- 429 errors trigger automatic retry with backoff

## Monitoring

Rate limit status is logged at DEBUG level:

```
[DEBUG] Token bucket rate limiter initialized
  id: "fathom:list_meetings"
  maxTokens: 90
  refillRate: 1.5
  burstEnabled: true

[DEBUG] Rate limit: waiting for token
  id: "fathom:get_transcript"
  delayMs: 667
  currentTokens: 0.33

[WARN] Rate limit hit: backing off
  id: "fathom:get_transcript"
  consecutiveErrors: 1
  backoffMs: 1000
```
