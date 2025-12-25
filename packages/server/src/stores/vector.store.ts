import { randomUUID } from "crypto";
import {
  VectorPoint,
  VectorPayloadType,
  EntityVectorPayload,
  RelationshipVectorPayload,
  SourceType,
} from "../types/index.js";
import { QdrantConnection } from "../connections/qdrant.js";
import { env } from "../env.js";
import logger from "../utils/logger.js";

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
        logger.info(
          `Created Qdrant collection: ${this.collectionName} (${dimensions} dimensions, model: ${env.LLM_EMBEDDING_MODEL})`
        );
      }
    } catch (err) {
      logger.error(
        { err, collectionName: this.collectionName },
        `Error ensuring collection ${this.collectionName}`
      );
      throw err;
    }
  }

  /**
   * Upsert a single point
   */
  async upsertPoint(
    point: Omit<VectorPoint, "id"> & { id?: string }
  ): Promise<string> {
    const id = point.id || randomUUID();
    const fullPoint: VectorPoint = {
      ...point,
      id,
    };

    await this.upsertPoints([fullPoint]);
    return id;
  }

  /**
   * Upsert multiple points
   */
  async upsertPoints(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;

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
    Array<{ id: string; score: number; payload: VectorPoint["payload"] }>
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
      payload: result.payload as VectorPoint["payload"],
    }));
  }

  /**
   * Delete points by MongoDB ID
   */
  async deleteOutdatedPoints(
    recordId: string,
    checksum: string
  ): Promise<void> {
    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          {
            key: "recordId",
            match: {
              value: recordId,
            },
          },
        ],
        must_not: [
          {
            key: "checksum",
            match: {
              value: checksum,
            },
          },
        ],
      },
    });
  }

  /**
   * Get point by ID
   */
  async getPoint(id: string): Promise<VectorPoint | null> {
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
        payload: point.payload as VectorPoint["payload"],
      };
    } catch (err) {
      logger.error({ err, pointId: id }, `Error getting point ${id}`);
      return null;
    }
  }

  /**
   * Search for entities by embedding
   */
  async searchEntities(
    vector: number[],
    options?: {
      limit?: number;
      scoreThreshold?: number;
      source?: SourceType;
    }
  ): Promise<
    Array<{ id: string; score: number; payload: EntityVectorPayload }>
  > {
    const filter: any = {
      must: [{ key: "type", match: { value: "entity" } }],
    };

    if (options?.source) {
      filter.must.push({ key: "source", match: { value: options.source } });
    }

    const results = await this.search(vector, {
      limit: options?.limit || 60,
      scoreThreshold: options?.scoreThreshold || 0.6,
      filter,
    });

    return results as Array<{
      id: string;
      score: number;
      payload: EntityVectorPayload;
    }>;
  }

  /**
   * Search for relationships by embedding
   */
  async searchRelationships(
    vector: number[],
    options?: {
      limit?: number;
      scoreThreshold?: number;
      relType?: string;
    }
  ): Promise<
    Array<{ id: string; score: number; payload: RelationshipVectorPayload }>
  > {
    const filter: any = {
      must: [{ key: "type", match: { value: "relationship" } }],
    };

    if (options?.relType) {
      filter.must.push({ key: "relType", match: { value: options.relType } });
    }

    const results = await this.search(vector, {
      limit: options?.limit || 60,
      scoreThreshold: options?.scoreThreshold || 0.6,
      filter,
    });

    return results as Array<{
      id: string;
      score: number;
      payload: RelationshipVectorPayload;
    }>;
  }

  /**
   * Delete embeddings by their vector IDs
   */
  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [{ key: "id", match: { any: ids } }],
      },
    });
  }
}

// Export with old name for backwards compatibility during migration
export const QdrantRepository = VectorStore;
