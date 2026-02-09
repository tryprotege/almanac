import pRetry from 'p-retry';
import { env } from '../env.js';
import logger from './logger.js';
import { llm } from '../services/llm/llm.js';

/**
 * Embedder service - Generates vector embeddings using any OpenAI-compatible API
 */

/**
 * Generate embeddings for multiple texts in batch
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  try {
    const response = await pRetry(
      async () => {
        return await llm.embeddings.create({
          model: env.LLM_EMBEDDING_MODEL,
          input: texts,
        });
      },
      {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        onFailedAttempt: (err) => {
          logger.warn({
            msg: 'Embedding generation attempt failed',
            attempt: err.attemptNumber,
            retriesLeft: err.retriesLeft,
            err,
          });
        },
      },
    );

    // Sort by index to ensure embeddings match input text order
    // The API may return results out of order, especially with parallel processing
    const embeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    return embeddings;
  } catch (err) {
    logger.error({
      msg: 'Error generating embeddings after retries',
      err,
      texts,
    });
    throw err;
  }
}
