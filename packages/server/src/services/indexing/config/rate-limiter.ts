import type { RateLimitConfig } from "@ebee-oss/indexing-engine";
import logger from "../../../utils/logger.js";

/**
 * Token bucket rate limiter
 * Allows burst traffic while maintaining average rate limit
 */
class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private readonly id: string;

  constructor(config: RateLimitConfig, id: string) {
    this.id = id;

    // Calculate refill rate (tokens per second)
    this.refillRate = config.maxRequests / config.windowSeconds;

    // Set max tokens (with burst capacity if enabled)
    const burstMultiplier =
      config.allowBurst !== false ? config.burstMultiplier || 1.5 : 1;
    this.maxTokens = Math.ceil(config.maxRequests * burstMultiplier);

    // Start with full bucket
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();

    logger.debug(
      {
        id: this.id,
        maxTokens: this.maxTokens,
        refillRate: this.refillRate,
        burstEnabled: config.allowBurst !== false,
      },
      "Token bucket rate limiter initialized"
    );
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsedSeconds * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to consume a token
   * Returns true if successful, false if rate limited
   */
  tryConsume(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available
   * Returns the delay in milliseconds
   */
  async waitForToken(): Promise<number> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }

    // Calculate how long to wait for next token
    const tokensNeeded = 1 - this.tokens;
    const delayMs = Math.ceil((tokensNeeded / this.refillRate) * 1000);

    logger.debug(
      { id: this.id, delayMs, currentTokens: this.tokens },
      "Rate limit: waiting for token"
    );

    await sleep(delayMs);
    this.tokens = 0; // Consumed the token we waited for
    this.lastRefill = Date.now();

    return delayMs;
  }

  /**
   * Get current status for debugging
   */
  getStatus() {
    this.refill();
    return {
      availableTokens: this.tokens,
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
    };
  }
}

/**
 * Exponential backoff rate limiter
 * Reacts to 429 responses with exponential backoff
 */
class ExponentialBackoffRateLimiter {
  private consecutiveErrors: number = 0;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly id: string;

  constructor(config: RateLimitConfig, id: string) {
    this.id = id;
    this.initialBackoffMs = config.initialBackoffMs || 1000;
    this.maxBackoffMs = config.maxBackoffMs || 60000;

    logger.debug(
      {
        id: this.id,
        initialBackoffMs: this.initialBackoffMs,
        maxBackoffMs: this.maxBackoffMs,
      },
      "Exponential backoff rate limiter initialized"
    );
  }

  /**
   * Handle a successful request
   */
  onSuccess(): void {
    this.consecutiveErrors = 0;
  }

  /**
   * Handle a rate limit error
   * Returns the delay to wait before retrying
   */
  async onRateLimit(): Promise<number> {
    this.consecutiveErrors++;

    // Calculate exponential backoff: initialDelay * (2 ^ errors)
    const backoffMs = Math.min(
      this.initialBackoffMs * Math.pow(2, this.consecutiveErrors - 1),
      this.maxBackoffMs
    );

    logger.warn(
      {
        id: this.id,
        consecutiveErrors: this.consecutiveErrors,
        backoffMs,
      },
      "Rate limit hit: backing off"
    );

    await sleep(backoffMs);
    return backoffMs;
  }

  getStatus() {
    return {
      consecutiveErrors: this.consecutiveErrors,
    };
  }
}

/**
 * Retry-After header respecting rate limiter
 * Waits for the duration specified in Retry-After header
 */
class RetryAfterRateLimiter {
  private readonly id: string;

  constructor(_config: RateLimitConfig, id: string) {
    this.id = id;
    logger.debug({ id: this.id }, "Retry-After rate limiter initialized");
  }

  /**
   * Parse Retry-After header and wait
   * @param retryAfter - Value from Retry-After header (seconds or HTTP date)
   */
  async handleRetryAfter(retryAfter: string | number): Promise<number> {
    let delayMs: number;

    if (typeof retryAfter === "number") {
      // Retry-After is in seconds
      delayMs = retryAfter * 1000;
    } else if (typeof retryAfter === "string") {
      // Try parsing as integer seconds
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        delayMs = seconds * 1000;
      } else {
        // Try parsing as HTTP date
        const retryDate = new Date(retryAfter);
        delayMs = Math.max(0, retryDate.getTime() - Date.now());
      }
    } else {
      // Default to 1 second if can't parse
      delayMs = 1000;
    }

    // Cap at 5 minutes for safety
    delayMs = Math.min(delayMs, 300000);

    logger.warn(
      { id: this.id, delayMs, retryAfter },
      "Rate limit (429): respecting Retry-After header"
    );

    await sleep(delayMs);
    return delayMs;
  }

  getStatus() {
    return {};
  }
}

/**
 * Rate limiter manager
 * Creates and manages rate limiters per server/fetcher
 */
export class RateLimiterManager {
  private limiters: Map<
    string,
    | TokenBucketRateLimiter
    | ExponentialBackoffRateLimiter
    | RetryAfterRateLimiter
  > = new Map();

  /**
   * Get or create a rate limiter for a specific scope
   */
  getLimiter(
    config: RateLimitConfig,
    scopeId: string
  ):
    | TokenBucketRateLimiter
    | ExponentialBackoffRateLimiter
    | RetryAfterRateLimiter {
    if (this.limiters.has(scopeId)) {
      return this.limiters.get(scopeId)!;
    }

    const strategy = config.strategy || "token_bucket";
    let limiter:
      | TokenBucketRateLimiter
      | ExponentialBackoffRateLimiter
      | RetryAfterRateLimiter;

    switch (strategy) {
      case "token_bucket":
        limiter = new TokenBucketRateLimiter(config, scopeId);
        break;
      case "exponential_backoff":
        limiter = new ExponentialBackoffRateLimiter(config, scopeId);
        break;
      case "respect_retry_after":
        limiter = new RetryAfterRateLimiter(config, scopeId);
        break;
      default:
        limiter = new TokenBucketRateLimiter(config, scopeId);
    }

    this.limiters.set(scopeId, limiter);
    return limiter;
  }

  /**
   * Remove a rate limiter
   */
  removeLimiter(scopeId: string): void {
    this.limiters.delete(scopeId);
  }

  /**
   * Clear all rate limiters
   */
  clear(): void {
    this.limiters.clear();
  }

  /**
   * Get status of all rate limiters
   */
  getStatus() {
    const status: Record<string, any> = {};
    for (const [id, limiter] of this.limiters.entries()) {
      status[id] = limiter.getStatus();
    }
    return status;
  }
}

// Global rate limiter manager instance
export const rateLimiterManager = new RateLimiterManager();

/**
 * Helper function for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply rate limiting before making a request
 * @returns delay in milliseconds (0 if no delay)
 */
export async function applyRateLimit(
  config: RateLimitConfig | undefined,
  scopeId: string
): Promise<number> {
  if (!config) {
    return 0;
  }

  const limiter = rateLimiterManager.getLimiter(config, scopeId);
  const strategy = config.strategy || "token_bucket";

  if (strategy === "token_bucket") {
    return await (limiter as TokenBucketRateLimiter).waitForToken();
  }

  // For other strategies, no proactive limiting
  return 0;
}

/**
 * Handle a rate limit response (429)
 * @param retryAfter - Optional Retry-After header value
 * @returns delay in milliseconds
 */
export async function handleRateLimitError(
  config: RateLimitConfig | undefined,
  scopeId: string,
  retryAfter?: string | number
): Promise<number> {
  if (!config) {
    // Default backoff if no config
    await sleep(1000);
    return 1000;
  }

  const limiter = rateLimiterManager.getLimiter(config, scopeId);
  const strategy = config.strategy || "token_bucket";

  switch (strategy) {
    case "respect_retry_after":
      if (retryAfter !== undefined) {
        return await (limiter as RetryAfterRateLimiter).handleRetryAfter(
          retryAfter
        );
      }
      // Fallback to 1 second if no Retry-After header
      await sleep(1000);
      return 1000;

    case "exponential_backoff":
      return await (limiter as ExponentialBackoffRateLimiter).onRateLimit();

    case "token_bucket":
      // For token bucket, wait for next token
      return await (limiter as TokenBucketRateLimiter).waitForToken();

    default:
      await sleep(1000);
      return 1000;
  }
}

/**
 * Notify rate limiter of successful request
 */
export function notifySuccess(
  config: RateLimitConfig | undefined,
  scopeId: string
): void {
  if (!config) return;

  const strategy = config.strategy || "token_bucket";
  if (strategy === "exponential_backoff") {
    const limiter = rateLimiterManager.getLimiter(config, scopeId);
    (limiter as ExponentialBackoffRateLimiter).onSuccess();
  }
}
