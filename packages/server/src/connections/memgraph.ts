import neo4j, { Driver, Session, AuthToken } from "neo4j-driver";
import { env } from "../env.js";
import logger from "../utils/logger.js";

export const MEMGRAPH_SCHEMAS = {
  // Node constraints
  constraints: ["CREATE CONSTRAINT ON (n:Resource) ASSERT n.id IS UNIQUE"],

  // Indexes for efficient queries
  indexes: [
    "CREATE INDEX ON :Resource(id)",
    "CREATE INDEX ON :Resource(type)",
    "CREATE INDEX ON :Resource(source)",
  ],
} as const;

export interface MemgraphConnection {
  driver: Driver;
  getSession: () => Session;
  executeQuery: <T = any>(
    query: string,
    parameters?: Record<string, any>
  ) => Promise<T[]>;
  close: () => Promise<void>;
}

const createAuthToken = (username?: string, password?: string): AuthToken => {
  return username && password
    ? neo4j.auth.basic(username, password)
    : { scheme: "none", principal: "", credentials: "" };
};

const createDriver = (): Driver => {
  const uri = `bolt://${env.MEMGRAPH_HOST}:${env.MEMGRAPH_PORT}`;
  const auth = createAuthToken(env.MEMGRAPH_USERNAME, env.MEMGRAPH_PASSWORD);

  return neo4j.driver(uri, auth);
};

export const connectMemgraph = async (): Promise<MemgraphConnection> => {
  try {
    const driver = createDriver();

    // Test connection
    await driver.verifyConnectivity();
    logger.info("Memgraph connected successfully");

    const getSession = (): Session => driver.session();

    const executeQuery = async <T = any>(
      query: string,
      parameters?: Record<string, any>
    ): Promise<T[]> => {
      const session = getSession();

      try {
        const result = await session.run(query, parameters);
        return result.records.map((record) => record.toObject() as T);
      } catch (err) {
        logger.error({ err }, "Memgraph query error");
        throw err;
      } finally {
        await session.close();
      }
    };

    const close = async (): Promise<void> => {
      await driver.close();
      logger.info("Memgraph disconnected");
    };

    return {
      driver,
      getSession,
      executeQuery,
      close,
    };
  } catch (err) {
    logger.error({ err }, "Memgraph connection error");
    throw err;
  }
};
