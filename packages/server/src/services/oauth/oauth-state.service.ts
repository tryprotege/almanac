import crypto from "crypto";
import { RedisConnection } from "../../connections/redis.js";
import logger from "../../utils/logger.js";

/**
 * OAuth State Management Service
 * Handles CSRF protection for OAuth flows using Redis for state storage
 */
export class OAuthStateService {
  private readonly STATE_PREFIX = "oauth:state:";
  private readonly STATE_TTL = 600; // 10 minutes

  constructor(private redis: RedisConnection) {}

  /**
   * Generate and store a new OAuth state token
   * @param service - Service name (github, notion, slack)
   * @returns State token string
   */
  async generateState(service: string): Promise<string> {
    const state = crypto.randomBytes(32).toString("hex");
    const key = `${this.STATE_PREFIX}${state}`;

    try {
      await this.redis.client.setex(key, this.STATE_TTL, service);
      logger.debug({ service, state }, "Generated OAuth state token");
      return state;
    } catch (err) {
      logger.error({ err, service }, "Failed to store OAuth state");
      throw new Error("Failed to generate OAuth state");
    }
  }

  /**
   * Verify and consume an OAuth state token
   * @param state - State token to verify
   * @returns Service name if valid, null if invalid or expired
   */
  async verifyAndConsumeState(state: string): Promise<string | null> {
    const key = `${this.STATE_PREFIX}${state}`;

    try {
      const service = await this.redis.client.get(key);

      if (!service) {
        logger.warn({ state }, "Invalid or expired OAuth state token");
        return null;
      }

      // Delete the state token (one-time use)
      await this.redis.client.del(key);

      logger.debug(
        { service, state },
        "Verified and consumed OAuth state token"
      );
      return service;
    } catch (err) {
      logger.error({ err, state }, "Failed to verify OAuth state");
      return null;
    }
  }

  /**
   * Clean up expired state tokens (called periodically)
   */
  async cleanupExpiredStates(): Promise<void> {
    try {
      // Redis automatically expires keys with TTL, so this is mainly for logging
      const keys = await this.redis.client.keys(`${this.STATE_PREFIX}*`);
      logger.debug({ count: keys.length }, "Active OAuth state tokens");
    } catch (err) {
      logger.error({ err }, "Failed to cleanup OAuth states");
    }
  }
}
