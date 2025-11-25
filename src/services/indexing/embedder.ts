import OpenAI from "openai";
import { validateVectorDimensions } from "../../shared/utils/index.js";

/**
 * Embedder service - Generates vector embeddings using any OpenAI-compatible API
 */
export class EmbedderService {
  private client: OpenAI;
  private model: string;
  private embeddingDimension: number;

  constructor(options: { client: OpenAI; model: string; dimension?: number }) {
    this.client = options.client;
    this.model = options.model;
    this.embeddingDimension = options.dimension || 1024;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
      });

      const embeddings = response.data.map(
        (item: { embedding: number[] }) => item.embedding
      );

      // Validate dimensions for all returned embeddings
      for (let i = 0; i < embeddings.length; i++) {
        validateVectorDimensions(
          embeddings[i],
          this.embeddingDimension,
          `embedding ${i} from model ${this.model}`
        );
      }

      return embeddings;
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw error;
    }
  }

  /**
   * Get the dimension of the embeddings
   */
  getDimension(): number {
    return this.embeddingDimension;
  }

  /**
   * Preprocess text before embedding
   */
  private preprocessText(text: string): string {
    // Trim whitespace
    let processed = text.trim();

    // Limit length to avoid API limits (8k tokens ≈ 32k characters)
    const maxLength = 30000;
    if (processed.length > maxLength) {
      processed = processed.substring(0, maxLength);
    }

    return processed;
  }

  /**
   * Generate embedding with preprocessing
   */
  async embedWithPreprocessing(text: string): Promise<number[]> {
    const processed = this.preprocessText(text);
    return this.embed(processed);
  }

  /**
   * Generate embeddings for multiple texts with preprocessing
   */
  async embedBatchWithPreprocessing(texts: string[]): Promise<number[][]> {
    const processed = texts.map((t) => this.preprocessText(t));
    return this.embedBatch(processed);
  }
}
