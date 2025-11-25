import { randomUUID } from "crypto";
import { QdrantPoint } from "../types/index.js";
import { QdrantConnection } from "../shared/database/qdrant.js";
import { validateVectorDimensions } from "../shared/utils/index.js";
import { env } from "../env.js";

export class QdrantRepository {
  constructor(private qdrant: QdrantConnection) {}

  /**
   * Get collection name for workspace
   */
  private getWorkspaceCollectionName(workspaceId: string): string {
    return `ws_${workspaceId}_vectors`;
  }

  /**
   * Ensure workspace collection exists
   */
  async ensureWorkspaceCollection(
    workspaceId: string,
    vectorSize?: number
  ): Promise<void> {
    const collectionName = this.getWorkspaceCollectionName(workspaceId);
    const dimensions = vectorSize ?? env.EMBEDDING_DIMENSIONS;

    try {
      // Check if collection exists
      const collections = await this.qdrant.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === collectionName
      );

      if (!exists) {
        await this.qdrant.createCollection(
          collectionName,
          dimensions,
          "Cosine"
        );
        console.log(
          `✅ Created Qdrant collection: ${collectionName} (${dimensions} dimensions, model: ${env.LLM_EMBEDDING_MODEL})`
        );
      }
    } catch (error) {
      console.error(`Error ensuring collection ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Upsert a single point
   */
  async upsertPoint(
    workspaceId: string,
    point: Omit<QdrantPoint, "id"> & { id?: string }
  ): Promise<string> {
    const id = point.id || randomUUID();
    const fullPoint: QdrantPoint = {
      ...point,
      id,
    };

    await this.upsertPoints(workspaceId, [fullPoint]);
    return id;
  }

  /**
   * Upsert multiple points
   */
  async upsertPoints(
    workspaceId: string,
    points: QdrantPoint[]
  ): Promise<void> {
    if (points.length === 0) return;

    const collectionName = this.getWorkspaceCollectionName(workspaceId);

    // Validate all vectors have correct dimensions
    const expectedDimensions = env.EMBEDDING_DIMENSIONS;
    for (let i = 0; i < points.length; i++) {
      validateVectorDimensions(
        points[i].vector,
        expectedDimensions,
        `point ${i} (${points[i].id})`
      );
    }

    // Ensure collection exists before upserting
    await this.ensureWorkspaceCollection(workspaceId);

    await this.qdrant.client.upsert(collectionName, {
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
    workspaceId: string,
    vector: number[],
    options?: {
      limit?: number;
      filter?: Record<string, any>;
      scoreThreshold?: number;
    }
  ): Promise<
    Array<{ id: string; score: number; payload: QdrantPoint["payload"] }>
  > {
    const collectionName = this.getWorkspaceCollectionName(workspaceId);

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
      collectionName,
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
    workspaceId: string,
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

    return this.search(workspaceId, vector, {
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
  async deletePoints(workspaceId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const collectionName = this.getWorkspaceCollectionName(workspaceId);

    await this.qdrant.client.delete(collectionName, {
      wait: true,
      points: ids,
    });
  }

  /**
   * Delete points by MongoDB ID
   */
  async deleteByMongoId(workspaceId: string, mongoId: string): Promise<void> {
    const collectionName = this.getWorkspaceCollectionName(workspaceId);

    await this.qdrant.client.delete(collectionName, {
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
  async getPoint(workspaceId: string, id: string): Promise<QdrantPoint | null> {
    const collectionName = this.getWorkspaceCollectionName(workspaceId);

    try {
      const points = await this.qdrant.client.retrieve(collectionName, {
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
