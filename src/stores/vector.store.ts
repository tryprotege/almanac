import { randomUUID } from "crypto";
import { QdrantPoint } from "../types/index.js";
import { QdrantConnection } from "../connections/qdrant.js";
import { env } from "../env.js";

/**
 * Vector Store - Single-tenant Qdrant operations
 */
export class VectorStore {
  private readonly collectionName = "embeddings";

  constructor(private qdrant: QdrantConnection) {}

  /**
   * Ensure collection exists
   */
  async ensureCollection(vectorSize?: number): Promise<void> {
    const dimensions = vectorSize ?? env.EMBEDDING_DIMENSIONS;

    try {
      // Check if collection exists
      const collections = await this.qdrant.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === this.collectionName
      );

      if (!exists) {
        await this.qdrant.createCollection(
          this.collectionName,
          dimensions,
          "Cosine"
        );
        console.log(
          `✅ Created Qdrant collection: ${this.collectionName} (${dimensions} dimensions, model: ${env.LLM_EMBEDDING_MODEL})`
        );
      }
    } catch (error) {
      console.error(`Error ensuring collection ${this.collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Upsert a single point
   */
  async upsertPoint(
    point: Omit<QdrantPoint, "id"> & { id?: string }
  ): Promise<string> {
    const id = point.id || randomUUID();
    const fullPoint: QdrantPoint = {
      ...point,
      id,
    };

    await this.upsertPoints([fullPoint]);
    return id;
  }

  /**
   * Upsert multiple points
   */
  async upsertPoints(points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) return;

    // Validate all vectors have correct dimensions
    // const expectedDimensions = env.EMBEDDING_DIMENSIONS;
    // for (let i = 0; i < points.length; i++) {
    //   validateVectorDimensions(
    //     points[i].vector,
    //     expectedDimensions,
    //     `point ${i} (${points[i].id})`
    //   );
    // }

    // Ensure collection exists before upserting
    await this.ensureCollection();

    await this.qdrant.client.upsert(this.collectionName, {
      wait: true,
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });
  }

  /**
   * Search for similar vectors
   */
  async search(
    vector: number[],
    options?: {
      limit?: number;
      filter?: Record<string, any>;
      scoreThreshold?: number;
    }
  ): Promise<
    Array<{ id: string; score: number; payload: QdrantPoint["payload"] }>
  > {
    const searchParams: any = {
      vector,
      limit: options?.limit || 20,
    };

    if (options?.filter) {
      searchParams.filter = options.filter;
    }

    if (options?.scoreThreshold !== undefined) {
      searchParams.score_threshold = options.scoreThreshold;
    }

    const results = await this.qdrant.client.search(
      this.collectionName,
      searchParams
    );

    return results.map((result) => ({
      id: result.id as string,
      score: result.score,
      payload: result.payload as QdrantPoint["payload"],
    }));
  }

  /**
   * Search with pre-filtered MongoDB IDs
   */
  async searchWithMongoFilter(
    vector: number[],
    mongoIds: string[],
    options?: {
      limit?: number;
      scoreThreshold?: number;
    }
  ): Promise<
    Array<{ id: string; score: number; payload: QdrantPoint["payload"] }>
  > {
    if (mongoIds.length === 0) return [];

    return this.search(vector, {
      ...options,
      filter: {
        must: [
          {
            key: "mongoId",
            match: {
              any: mongoIds,
            },
          },
        ],
      },
    });
  }

  /**
   * Delete points by IDs
   */
  async deletePoints(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      points: ids,
    });
  }

  /**
   * Delete points by MongoDB ID
   */
  async deleteByMongoId(mongoId: string): Promise<void> {
    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          {
            key: "mongoId",
            match: {
              value: mongoId,
            },
          },
        ],
      },
    });
  }

  /**
   * Get point by ID
   */
  async getPoint(id: string): Promise<QdrantPoint | null> {
    try {
      const points = await this.qdrant.client.retrieve(this.collectionName, {
        ids: [id],
        with_payload: true,
        with_vector: true,
      });

      if (points.length === 0) return null;

      const point = points[0];
      return {
        id: point.id as string,
        vector: point.vector as number[],
        payload: point.payload as QdrantPoint["payload"],
      };
    } catch (error) {
      console.error(`Error getting point ${id}:`, error);
      return null;
    }
  }
}

// Export with old name for backwards compatibility during migration
export const QdrantRepository = VectorStore;
