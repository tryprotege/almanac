import mongoose from 'mongoose';

import { env } from '../env.js';
import logger from '../utils/logger.js';

const createMongoUri = (): string => {
  const { MONGO_HOST, MONGO_PORT, MONGO_USERNAME, MONGO_PASSWORD } = env;
  return `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}`;
};

export interface MongooseConnection {
  connection: typeof mongoose;
  close: () => Promise<void>;
}

/**
 * Connect to MongoDB using Mongoose
 */
export const connectMongoose = async (): Promise<MongooseConnection> => {
  const uri = createMongoUri();

  try {
    await mongoose.connect(uri, {
      dbName: env.MONGO_DB_NAME,
    });

    logger.info({ msg: 'Mongoose connected successfully' });
    const close = async (): Promise<void> => {
      await mongoose.connection.close();
      logger.info({ msg: 'Mongoose disconnected' });
    };

    return {
      connection: mongoose,
      close,
    };
  } catch (err) {
    logger.error({ err }, 'Mongoose connection error');
    throw err;
  }
};
