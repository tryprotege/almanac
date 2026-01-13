import type { RateLimitConfig } from '@ebee-oss/indexing-engine';
import { RateLimiter } from 'limiter';
import { Mutex } from 'async-mutex';
import logger from '../../../utils/logger.js';

/**
 * Token bucket rate limiter using the 'limiter' library
 * Allows burst traffic while maintaining average rate limit
 */
class TokenBucketRateLimiter {
  private limiter: RateLimiter;
  private readonly id: string;
  private readonly maxTokens: number;
  private readonly intervalMs: number;
  private mutex = new Mutex();
  private currentRate: number; // Current tokens per interval (can be reduced)
  private readonly baseRate: number; // Original rate to restore to
  private successCount: number = 0;
  private readonly recoveryThreshold: number = 10; // Successes needed to restore rate

  constructor(config: RateLimitConfig, id: string) {
    this.id = id;

    // Set max tokens (with burst capacity if explicitly enabled)
    const burstMultiplier = config.allowBurst === true ? config.burstMultiplier || 1.5 : 1;
    this.maxTokens = Math.ceil(config.maxRequests * burstMultiplier);
    this.intervalMs = config.windowSeconds * 1000;
    this.baseRate = this.maxTokens;
    this.currentRate = this.maxTokens;

    // Create limiter with tokensPerInterval and interval in milliseconds
    this.limiter = new RateLimiter({
      tokensPerInterval: this.maxTokens,
      interval: this.intervalMs,
      fireImmediately: true,
    });

    logger.debug(
      {
        id: this.id,
        maxTokens: this.maxTokens,
        intervalSeconds: config.windowSeconds,
        burstEnabled: config.allowBurst === true,
      },
      'Token bucket rate limiter initialized (using limiter library)',
    );
  }

  /**
   * Wait until a token is available (with mutex to serialize access)
   * Returns the delay in milliseconds
   */
  async waitForToken(): Promise<number> {
    // Use async-mutex to properly serialize all callers
    return await this.mutex.runExclusive(async () => {
      const startTime = Date.now();

      // Acquire token (will wait if needed)
      await this.limiter.removeTokens(1);

      const delayMs = Date.now() - startTime;
      const remaining = this.limiter.getTokensRemaining();

      logger.info(
        {
          id: this.id,
          delayMs,
          tokensRemaining: remaining.toFixed(2),
          maxTokens: this.maxTokens,
        },
        `[Rate Limiter] Token consumed (waited ${delayMs}ms) - ${remaining.toFixed(
          2,
        )}/${this.maxTokens} remaining`,
      );

      return delayMs;
    });
  }

  /**
   * Reduce rate temporarily when hitting rate limits
   * @param factor - Reduction factor (0.5 = reduce to 50% of current rate)
   */
  reduceRate(factor: number = 0.5): void {
    this.currentRate = Math.max(1, this.currentRate * factor);
    this.successCount = 0; // Reset success counter

    logger.warn(
      {
        id: this.id,
        newRate: this.currentRate,
        baseRate: this.baseRate,
        reductionFactor: factor,
      },
      'Rate limit reduced due to 429 error',
    );

    // Note: The limiter library doesn't support dynamic rate changes
    // We handle this by adding extra delays in waitForToken when currentRate < baseRate
  }

  /**
   * Track successful request for rate recovery
   */
  onSuccess(): void {
    if (this.currentRate < this.baseRate) {
      this.successCount++;

      // After threshold successes, gradually restore rate
      if (this.successCount >= this.recoveryThreshold) {
        const oldRate = this.currentRate;
        this.currentRate = Math.min(
          this.baseRate,
          this.currentRate * 1.2, // Increase by 20%
        );
        this.successCount = 0;

        if (oldRate !== this.currentRate) {
          logger.info(
            {
              id: this.id,
              newRate: this.currentRate,
              baseRate: this.baseRate,
            },
            'Rate limit recovering after successful requests',
          );
        }
      }
    }
  }

  /**
   * Get current status for debugging
   */
  getStatus() {
    return {
      availableTokens: this.limiter.getTokensRemaining(),
      maxTokens: this.maxTokens,
      currentRate: this.currentRate,
      baseRate: this.baseRate,
      isReduced: this.currentRate < this.baseRate,
      successCount: this.successCount,
      intervalMs: this.intervalMs,
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
      'Exponential backoff rate limiter initialized',
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
      this.maxBackoffMs,
    );

    logger.warn(
      {
        id: this.id,
        consecutiveErrors: this.consecutiveErrors,
        backoffMs,
      },
      'Rate limit hit: backing off',
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
    logger.debug({ id: this.id }, 'Retry-After rate limiter initialized');
  }

  /**
   * Parse Retry-After header and wait
   * @param retryAfter - Value from Retry-After header (seconds or HTTP date)
   */
  async handleRetryAfter(retryAfter: string | number): Promise<number> {
    let delayMs: number;

    if (typeof retryAfter === 'number') {
      // Retry-After is in seconds
      delayMs = retryAfter * 1000;
    } else if (typeof retryAfter === 'string') {
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
      'Rate limit (429): respecting Retry-After header',
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
    TokenBucketRateLimiter | ExponentialBackoffRateLimiter | RetryAfterRateLimiter
  > = new Map();
  private pausedServers: Map<string, Date> = new Map();

  /**
   * Get or create a rate limiter for a specific scope
   */
  getLimiter(
    config: RateLimitConfig,
    scopeId: string,
  ): TokenBucketRateLimiter | ExponentialBackoffRateLimiter | RetryAfterRateLimiter {
    if (this.limiters.has(scopeId)) {
      return this.limiters.get(scopeId)!;
    }

    const strategy = config.strategy || 'token_bucket';
    let limiter: TokenBucketRateLimiter | ExponentialBackoffRateLimiter | RetryAfterRateLimiter;

    switch (strategy) {
      case 'token_bucket':
        limiter = new TokenBucketRateLimiter(config, scopeId);
        break;
      case 'exponential_backoff':
        limiter = new ExponentialBackoffRateLimiter(config, scopeId);
        break;
      case 'respect_retry_after':
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
   * Pause a server for rate limiting purposes
   * @param serverName - Server to pause
   * @param untilTime - Time when server should resume
   */
  pauseServer(serverName: string, untilTime: Date): void {
    this.pausedServers.set(serverName, untilTime);
    logger.warn(
      {
        serverName,
        pausedUntil: untilTime.toISOString(),
        pauseDurationMs: untilTime.getTime() - Date.now(),
      },
      'Server paused for rate limiting',
    );
  }

  /**
   * Check if server is paused and wait if necessary
   * @param serverName - Server to check
   * @returns true if waited for pause, false if no pause
   */
  async waitIfPaused(serverName: string): Promise<boolean> {
    const pausedUntil = this.pausedServers.get(serverName);
    if (pausedUntil && pausedUntil > new Date()) {
      const waitMs = pausedUntil.getTime() - Date.now();
      logger.info({ serverName, waitMs }, `Server is paused, waiting ${waitMs}ms before resuming`);
      await sleep(waitMs);
      this.pausedServers.delete(serverName);
      return true;
    }

    // Clean up expired pause
    if (pausedUntil) {
      this.pausedServers.delete(serverName);
    }

    return false;
  }

  /**
   * Check if a server is currently paused
   */
  isServerPaused(serverName: string): boolean {
    const pausedUntil = this.pausedServers.get(serverName);
    return pausedUntil !== undefined && pausedUntil > new Date();
  }

  /**
   * Reduce rate for a token bucket limiter when hitting rate limits
   */
  reduceRateForScope(scopeId: string, factor: number = 0.5): void {
    const limiter = this.limiters.get(scopeId);
    if (limiter && limiter instanceof TokenBucketRateLimiter) {
      limiter.reduceRate(factor);
    }
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
  scopeId: string,
): Promise<number> {
  if (!config) {
    return 0;
  }

  const limiter = rateLimiterManager.getLimiter(config, scopeId);
  const strategy = config.strategy || 'token_bucket';

  if (strategy === 'token_bucket') {
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
  retryAfter?: string | number,
): Promise<number> {
  if (!config) {
    // Default backoff if no config
    await sleep(1000);
    return 1000;
  }

  const limiter = rateLimiterManager.getLimiter(config, scopeId);
  const strategy = config.strategy || 'token_bucket';

  switch (strategy) {
    case 'respect_retry_after':
      if (retryAfter !== undefined) {
        return await (limiter as RetryAfterRateLimiter).handleRetryAfter(retryAfter);
      }
      // Fallback to 1 second if no Retry-After header
      await sleep(1000);
      return 1000;

    case 'exponential_backoff':
      return await (limiter as ExponentialBackoffRateLimiter).onRateLimit();

    case 'token_bucket':
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
export function notifySuccess(config: RateLimitConfig | undefined, scopeId: string): void {
  if (!config) return;

  const strategy = config.strategy || 'token_bucket';
  const limiter = rateLimiterManager.getLimiter(config, scopeId);

  if (strategy === 'exponential_backoff') {
    (limiter as ExponentialBackoffRateLimiter).onSuccess();
  } else if (strategy === 'token_bucket') {
    (limiter as TokenBucketRateLimiter).onSuccess();
  }
}

/**
 * Notify rate limiter of rate limit error and adjust accordingly
 */
export function notifyRateLimitError(
  config: RateLimitConfig | undefined,
  scopeId: string,
  serverName: string,
  retryAfter?: number,
): void {
  if (!config) return;

  const strategy = config.strategy || 'token_bucket';

  // Reduce rate for token bucket strategy
  if (strategy === 'token_bucket') {
    rateLimiterManager.reduceRateForScope(scopeId, 0.5);
  }

  // Pause server globally if retry-after is provided
  if (retryAfter) {
    const pauseUntil = new Date(Date.now() + retryAfter * 1000);
    rateLimiterManager.pauseServer(serverName, pauseUntil);
  }
}
