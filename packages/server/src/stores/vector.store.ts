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
    Array<{ id: string; score: number; payload: VectorPoint["payload"] }>
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
   * Delete points by MongoDB ID
   */
  async deleteOutdatedPoints(mongoId: string, checksum: string): Promise<void> {
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
   * Delete all vectors of a specific type
   */
  async deleteByType(type: VectorPayloadType): Promise<void> {
    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [{ key: "type", match: { value: type } }],
      },
    });
  }

  /**
   * Delete entity embedding by mongoId
   */
  async deleteEntityEmbedding(mongoId: string): Promise<void> {
    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          { key: "type", match: { value: "entity" } },
          { key: "mongoId", match: { value: mongoId } },
        ],
      },
    });
  }

  /**
   * Delete relationship embedding by source/target/type
   */
  async deleteRelationshipEmbedding(
    sourceId: string,
    targetId: string,
    type: string
  ): Promise<void> {
    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          { key: "type", match: { value: "relationship" } },
          { key: "sourceId", match: { value: sourceId } },
          { key: "targetId", match: { value: targetId } },
          { key: "relType", match: { value: type } },
        ],
      },
    });
  }

  /**
   * Delete all embeddings for a source
   */
  async deleteBySource(source: SourceType): Promise<{
    entities: number;
    relationships: number;
  }> {
    // Get counts before deletion
    const entityCount = await this.qdrant.client.count(this.collectionName, {
      filter: {
        must: [
          { key: "type", match: { value: "entity" } },
          { key: "source", match: { value: source } },
        ],
      },
    });

    const relCount = await this.qdrant.client.count(this.collectionName, {
      filter: {
        must: [
          { key: "type", match: { value: "relationship" } },
          { key: "sourceId", match: { any: [`${source}_`] } },
        ],
      },
    });

    // Delete entity embeddings
    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          { key: "type", match: { value: "entity" } },
          { key: "source", match: { value: source } },
        ],
      },
    });

    // Delete relationship embeddings (filter by sourceId prefix)
    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [{ key: "type", match: { value: "relationship" } }],
      },
    });

    return {
      entities: entityCount.count,
      relationships: relCount.count,
    };
  }

  /**
   * Delete entity embeddings in batch by mongoIds
   */
  async deleteEntityEmbeddingsBatch(mongoIds: string[]): Promise<number> {
    if (mongoIds.length === 0) return 0;

    // Get count before deletion
    const countResult = await this.qdrant.client.count(this.collectionName, {
      filter: {
        must: [
          { key: "type", match: { value: "entity" } },
          { key: "mongoId", match: { any: mongoIds } },
        ],
      },
    });

    // Delete
    await this.qdrant.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          { key: "type", match: { value: "entity" } },
          { key: "mongoId", match: { any: mongoIds } },
        ],
      },
    });

    return countResult.count;
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

  /**
   * Clean up orphaned embeddings (not in MongoDB/Memgraph anymore)
   */
  async cleanupOrphanedEmbeddings(
    validMongoIds: string[],
    validRelationships: Array<{
      sourceId: string;
      targetId: string;
      type: string;
    }>
  ): Promise<{ entities: number; relationships: number }> {
    // Get all entity embeddings
    const allEntities = await this.search([0, 0, 0], {
      limit: 100000,
      filter: {
        must: [{ key: "type", match: { value: "entity" } }],
      },
    });

    // Find orphaned entities (mongoId not in validMongoIds)
    const validIdSet = new Set(validMongoIds);
    const orphanedEntityIds: string[] = [];

    for (const entity of allEntities) {
      const payload = entity.payload as EntityVectorPayload;
      if (!validIdSet.has(payload.mongoId as string)) {
        orphanedEntityIds.push(entity.id);
      }
    }

    // Delete orphaned entities
    if (orphanedEntityIds.length > 0) {
      await this.qdrant.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [{ key: "id", match: { any: orphanedEntityIds } }],
        },
      });
    }

    // Get all relationship embeddings
    const allRelationships = await this.search([0, 0, 0], {
      limit: 100000,
      filter: {
        must: [{ key: "type", match: { value: "relationship" } }],
      },
    });

    // Build set of valid relationships
    const validRelSet = new Set(
      validRelationships.map((r) => `${r.sourceId}_${r.type}_${r.targetId}`)
    );

    const orphanedRelIds: string[] = [];
    for (const rel of allRelationships) {
      const payload = rel.payload as RelationshipVectorPayload;
      const key = `${payload.sourceId}_${payload.relType}_${payload.targetId}`;
      if (!validRelSet.has(key)) {
        orphanedRelIds.push(rel.id);
      }
    }

    // Delete orphaned relationships
    if (orphanedRelIds.length > 0) {
      await this.qdrant.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [{ key: "id", match: { any: orphanedRelIds } }],
        },
      });
    }

    logger.info(
      `Cleaned up ${orphanedEntityIds.length} orphaned entity embeddings and ${orphanedRelIds.length} orphaned relationship embeddings`
    );

    return {
      entities: orphanedEntityIds.length,
      relationships: orphanedRelIds.length,
    };
  }
}

// Export with old name for backwards compatibility during migration
export const QdrantRepository = VectorStore;
