import { RedisConnection } from '../connections/redis.js';

/**
 * Cache Store - Redis operations for caching
 */
export class CacheStore {
  constructor(private redis: RedisConnection) {}

  /**
   * Get a value from cache
   */
  async get(key: string): Promise<string | null> {
    return await this.redis.client.get(key);
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.redis.client.setex(key, ttl, value);
    } else {
      await this.redis.client.set(key, value);
    }
  }

  /**
   * Delete a key from cache
   */
  async delete(key: string): Promise<number> {
    return await this.redis.client.del(key);
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.client.exists(key);
    return result === 1;
  }

  /**
   * Set multiple values
   */
  async mset(entries: Record<string, string>): Promise<void> {
    const args: string[] = [];
    for (const [key, value] of Object.entries(entries)) {
      args.push(key, value);
    }
    await this.redis.client.mset(...args);
  }

  /**
   * Get multiple values
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    return await this.redis.client.mget(...keys);
  }

  /**
   * Increment a numeric value
   */
  async incr(key: string): Promise<number> {
    return await this.redis.client.incr(key);
  }

  /**
   * Decrement a numeric value
   */
  async decr(key: string): Promise<number> {
    return await this.redis.client.decr(key);
  }

  /**
   * Set expiry on a key (in seconds)
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.redis.client.expire(key, seconds);
    return result === 1;
  }

  /**
   * Get keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return await this.redis.client.keys(pattern);
  }

  /**
   * Flush all keys (use with caution!)
   */
  async flushAll(): Promise<void> {
    await this.redis.client.flushall();
  }
}
