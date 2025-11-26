/**
 * Embedding dimension utilities
 */

/**
 * Get embedding dimensions for a given model
 */
export function getEmbeddingDimensions(model: string): number {
  const dimensionMap: Record<string, number> = {
    // Qwen models
    "qwen/qwen3-embedding-0.6b": 1024,
    "qwen/qwen3-embedding-4b": 2560,
    "qwen/qwen3-embedding-8b": 4096,
  };

  const normalizedModel = model.toLowerCase().trim();
  return dimensionMap[normalizedModel] ?? 1024; // Default to 1024
}

/**
 * Validate vector dimensions
 */
export function validateVectorDimensions(
  vector: number[],
  expectedDimensions: number,
  context?: string
): void {
  if (vector.length !== expectedDimensions) {
    throw new DimensionMismatchError(
      vector.length,
      expectedDimensions,
      context
    );
  }
}

/**
 * Custom error for dimension mismatches
 */
export class DimensionMismatchError extends Error {
  constructor(
    public actualDimensions: number,
    public expectedDimensions: number,
    public context?: string
  ) {
    const contextStr = context ? ` (${context})` : "";
    super(
      `Embedding dimension mismatch${contextStr}: ` +
        `expected ${expectedDimensions} dimensions, but got ${actualDimensions}. ` +
        `This usually means the embedding model was changed. ` +
        `To fix this, you must delete and re-create the Qdrant collection with the new dimensions.`
    );
    this.name = "DimensionMismatchError";
  }
}
