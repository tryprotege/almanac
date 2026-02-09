import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../env.js';
import logger from '../utils/logger.js';

export interface QdrantConnection {
  client: QdrantClient;
  createCollection: (
    collectionName: string,
    vectorSize: number,
    distance?: 'Cosine' | 'Euclid' | 'Dot',
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
    logger.info({ msg: 'Qdrant connected successfully' });
    const createCollection = async (
      collectionName: string,
      vectorSize: number,
      distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine',
    ): Promise<void> => {
      try {
        await client.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: distance,
          },
        });
        logger.info({
          msg: `Collection "${collectionName}" created successfully`,
        });
      } catch (err) {
        logger.error({ err, collectionName }, `Error creating Qdrant collection`);
        throw err;
      }
    };

    const close = async (): Promise<void> => {
      logger.info({ msg: 'Qdrant disconnected' });
      // Qdrant REST client doesn't require explicit disconnection
    };

    return {
      client,
      createCollection,
      close,
    };
  } catch (err) {
    logger.error({ err }, 'Qdrant connection error');
    throw err;
  }
};
