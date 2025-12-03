import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../env.js";
import logger from "../utils/logger.js";

export const QDRANT_SCHEMAS = {
  // Collection naming pattern: embeddings_<model>_<dimensions>
  getCollectionName: (model: string, dimensions: number): string => {
    const cleanModel = model.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    return `embeddings_${cleanModel}_${dimensions}`;
  },

  // Model dimension mappings
  MODEL_DIMENSIONS: {
    "qwen/qwen3-embedding-0.6b": 1024,
    "qwen/qwen3-embedding-4b": 2560,
    "qwen/qwen3-embedding-8b": 4096,
  } as Record<string, number>,

  defaultConfig: {
    distance: "Cosine" as const,
    onDiskPayload: true,
  },
} as const;

export interface QdrantConnection {
  client: QdrantClient;
  createCollection: (
    collectionName: string,
    vectorSize: number,
    distance?: "Cosine" | "Euclid" | "Dot"
  ) => Promise<void>;
  close: () => Promise<void>;
}

const createQdrantUrl = (): string => {
  return `http://${env.QDRANT_HOST}:${env.QDRANT_PORT}`;
};

export const connectQdrant = async (): Promise<QdrantConnection> => {
  const url = createQdrantUrl();

  try {
    const client = new QdrantClient({
      url,
      apiKey: env.QDRANT_API_KEY,
    });

    // Test connection by getting collections
    await client.getCollections();
    logger.info("Qdrant connected successfully");

    const createCollection = async (
      collectionName: string,
      vectorSize: number,
      distance: "Cosine" | "Euclid" | "Dot" = "Cosine"
    ): Promise<void> => {
      try {
        await client.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: distance,
          },
        });
        logger.info(`Collection "${collectionName}" created successfully`);
      } catch (error) {
        logger.error(
          { error, collectionName },
          `Error creating collection "${collectionName}"`
        );
        throw error;
      }
    };

    const close = async (): Promise<void> => {
      // Qdrant REST client doesn't require explicit disconnection
      logger.info("Qdrant disconnected");
    };

    return {
      client,
      createCollection,
      close,
    };
  } catch (error) {
    logger.error({ error }, "Qdrant connection error");
    throw error;
  }
};
