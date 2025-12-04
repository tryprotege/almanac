import OpenAI from "openai";
import { env } from "../env.js";
import logger from "./logger.js";

/**
 * Embedder service - Generates vector embeddings using any OpenAI-compatible API
 */

/**
 * Generate embeddings for multiple texts in batch
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const llm = new OpenAI({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL,
  });
  if (texts.length === 0) {
    return [];
  }

  try {
    const response = await llm.embeddings.create({
      model: env.LLM_EMBEDDING_MODEL,
      input: texts,
    });

    const embeddings = response.data.map(
      (item: { embedding: number[] }) => item.embedding
    );

    return embeddings;
  } catch (err) {
    logger.error({ err }, "Error generating embeddings");
    throw err;
  }
}
