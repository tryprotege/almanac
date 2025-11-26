import { RedisOptions, Redis } from "ioredis";
import { env } from "../env.js";

export interface RedisConnection {
  client: Redis;
  close: () => Promise<void>;
}

const createRedisOptions = (): RedisOptions => {
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

    console.log("✅ Redis connected successfully");

    const close = async (): Promise<void> => {
      await client.quit();
      console.log("Redis disconnected");
    };

    return {
      client,
      close,
    };
  } catch (error) {
    console.error("❌ Redis connection error:", error);
    throw error;
  }
};
