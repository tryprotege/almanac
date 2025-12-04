import { RedisOptions, Redis } from "ioredis";
import { env } from "../env.js";
import logger from "../utils/logger.js";

export interface RedisConnection {
  client: Redis;
  close: () => Promise<void>;
}

export const createRedisOptions = (): RedisOptions => {
  return {
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT),
    password: env.REDIS_PASSWORD,
    db: parseInt(env.REDIS_DB),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  };
};

export const connectRedis = async (): Promise<RedisConnection> => {
  const options = createRedisOptions();

  try {
    const client = new Redis(options);

    // Wait for connection to be ready
    await new Promise<void>((resolve, reject) => {
      client.on("ready", () => resolve());
      client.on("error", (err) => reject(err));
    });

    logger.info("Redis connected successfully");

    const close = async (): Promise<void> => {
      await client.quit();
      logger.info("Redis disconnected");
    };

    return {
      client,
      close,
    };
  } catch (err) {
    logger.error({ err }, "Redis connection error");
    throw err;
  }
};
