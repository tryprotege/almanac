import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { ChunkerService } from "../indexing/chunker.js";
import { EmbedderService } from "../indexing/embedder.js";
import { Record } from "../../models/record.model.js";
import { SourceType } from "../../types/index.js";
import { randomUUID } from "crypto";

/**
 * Vector Indexer Service
 * Post-processes MongoDB entities into Qdrant vector store
 * Handles chunking and embedding of large content
 */
export class VectorIndexerService {
  private chunker: ChunkerService;

  constructor(
    private entityStore: RecordStore,
    private vectorStore: VectorStore,
    private embedder: EmbedderService
  ) {
    this.chunker = new ChunkerService();
  }

  /**
   * Index all entities from a source into Qdrant
   */
  async indexAll(
    source: SourceType,
    options?: {
      entityType?: string;
      batchSize?: number;
      maxChunkSize?: number;
      overlapSize?: number;
    }
  ): Promise<{
    processed: number;
    chunks: number;
    errors: number;
    skipped: number;
  }> {
    const batchSize = options?.batchSize || 50;
    const stats = {
      processed: 0,
      chunks: 0,
      errors: 0,
      skipped: 0,
    };

    console.log(`🔄 Starting vector indexing for source: ${source}`);

    // Ensure Qdrant collection exists
    await this.vectorStore.ensureCollection();

    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch batch of entities
      const entities = await this.entityStore.findBySourceAndType(
        source,
        options?.entityType,
        { limit: batchSize, skip, includeDeleted: false }
      );

      if (entities.length === 0) {
        hasMore = false;
        break;
      }

      // Process batch
      for (const entity of entities) {
        try {
          await this.indexEntity(entity, {
            maxChunkSize: options?.maxChunkSize,
            overlapSize: options?.overlapSize,
          });
          stats.processed++;
        } catch (error) {
          console.error(`❌ Error indexing entity ${entity._id}:`, error);
          stats.errors++;
        }
      }

      skip += entities.length;

      // Log progress
      console.log(
        `📊 Progress: ${stats.processed} processed, ${stats.chunks} chunks, ${stats.errors} errors`
      );
    }

    console.log(`✅ Vector indexing complete for ${source}`);
    console.log(`   Processed: ${stats.processed} entities`);
    console.log(`   Chunks: ${stats.chunks} vectors`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`   Skipped: ${stats.skipped}`);

    return stats;
  }

  /**
   * Index a single entity into Qdrant
   */
  async indexEntity(
    entity: Record,
    options?: {
      maxChunkSize?: number;
      overlapSize?: number;
    }
  ): Promise<string[]> {
    // Skip if no content
    if (!entity.content || entity.content.trim().length === 0) {
      return [];
    }

    // Delete existing vectors for this entity
    if (entity.vectorIds && entity.vectorIds.length > 0) {
      await this.vectorStore.deletePoints(entity.vectorIds);
    }

    // Chunk the content
    const chunks = this.chunker.chunkText(entity.content, {
      maxChunkSize: options?.maxChunkSize || 2000,
      overlapSize: options?.overlapSize || 200,
      splitOn: "paragraph",
    });

    // Generate embeddings for all chunks
    const chunkTexts = chunks.map((chunk) => chunk.text);
    const embeddings = await this.embedder.embedBatch(chunkTexts);

    // Create Qdrant points
    const vectorIds: string[] = [];
    const points = chunks.map((chunk, index) => {
      const vectorId = randomUUID();
      vectorIds.push(vectorId);

      return {
        id: vectorId,
        vector: embeddings[index],
        payload: {
          mongoId: entity._id,
          source: entity.source,
          sourceId: entity.sourceId,
          entityType: entity.recordType,
          title: entity.title,
          chunkIndex: chunk.index,
          chunkText: chunk.text,
          chunkStart: chunk.start,
          chunkEnd: chunk.end,
          totalChunks: chunks.length,
          people: entity.people,
          primaryDate: entity.primaryDate?.toISOString() || null,
          tags: entity.tags,
          syncedAt: entity.syncedAt.toISOString(),
          embeddingVersion: entity.embeddingVersion,
        },
      };
    });

    // Upsert to Qdrant
    await this.vectorStore.upsertPoints(points);

    // Update entity with vector IDs
    await this.entityStore.upsert({
      _id: entity._id,
      vectorIds,
      lastIndexedAt: new Date(),
    });

    return vectorIds;
  }

  /**
   * Index specific entities by IDs
   */
  async indexByIds(
    ids: string[],
    options?: {
      maxChunkSize?: number;
      overlapSize?: number;
    }
  ): Promise<{
    processed: number;
    chunks: number;
    errors: number;
  }> {
    const stats = {
      processed: 0,
      chunks: 0,
      errors: 0,
    };

    console.log(`🔄 Indexing ${ids.length} entities by ID`);

    const entities = await this.entityStore.findByIds(ids);

    for (const entity of entities) {
      try {
        const vectorIds = await this.indexEntity(entity, options);
        stats.processed++;
        stats.chunks += vectorIds.length;
      } catch (error) {
        console.error(
          `❌ Error indexing entity ${entity._id}:`,
          error instanceof Error ? error.message : error
        );
        stats.errors++;
      }
    }

    console.log(`✅ Indexed ${stats.processed} entities`);
    return stats;
  }

  /**
   * Re-index entities that need updating
   * (e.g., after embedding model change)
   */
  async reindexOutdated(
    source: SourceType,
    currentEmbeddingVersion: number,
    options?: {
      batchSize?: number;
      maxChunkSize?: number;
      overlapSize?: number;
    }
  ): Promise<{
    processed: number;
    chunks: number;
    errors: number;
  }> {
    const batchSize = options?.batchSize || 50;
    const stats = {
      processed: 0,
      chunks: 0,
      errors: 0,
    };

    console.log(
      `🔄 Re-indexing outdated entities for source: ${source} (version < ${currentEmbeddingVersion})`
    );

    // Find entities with old embedding version
    const entities = await this.entityStore.findBySourceAndType(source, "", {
      includeDeleted: false,
    });

    const outdated = entities.filter(
      (e) => e.embeddingVersion < currentEmbeddingVersion
    );

    console.log(`Found ${outdated.length} outdated entities`);

    // Process in batches
    for (let i = 0; i < outdated.length; i += batchSize) {
      const batch = outdated.slice(i, i + batchSize);

      for (const entity of batch) {
        try {
          const vectorIds = await this.indexEntity(entity, {
            maxChunkSize: options?.maxChunkSize,
            overlapSize: options?.overlapSize,
          });

          // Update embedding version
          await this.entityStore.upsert({
            _id: entity._id,
            embeddingVersion: currentEmbeddingVersion,
            vectorIds,
            lastIndexedAt: new Date(),
          });

          stats.processed++;
          stats.chunks += vectorIds.length;
        } catch (error) {
          console.error(
            `❌ Error re-indexing entity ${entity._id}:`,
            error instanceof Error ? error.message : error
          );
          stats.errors++;
        }
      }

      console.log(
        `📊 Progress: ${stats.processed}/${outdated.length} re-indexed`
      );
    }

    console.log(`✅ Re-indexing complete`);
    return stats;
  }

  /**
   * Delete vectors for deleted entities
   */
  async cleanupDeletedEntities(source: SourceType): Promise<number> {
    console.log(`🧹 Cleaning up vectors for deleted entities from ${source}`);

    const deletedEntities = await this.entityStore.findBySourceAndType(
      source,
      "",
      { includeDeleted: true }
    );

    const deleted = deletedEntities.filter((e) => e.isDeleted);
    let cleaned = 0;

    for (const entity of deleted) {
      if (entity.vectorIds && entity.vectorIds.length > 0) {
        await this.vectorStore.deletePoints(entity.vectorIds);
        cleaned += entity.vectorIds.length;

        // Clear vector IDs from entity
        await this.entityStore.upsert({
          _id: entity._id,
          vectorIds: [],
        });
      }
    }

    console.log(
      `✅ Cleaned up ${cleaned} vectors from ${deleted.length} deleted entities`
    );
    return cleaned;
  }

  /**
   * Get indexing statistics
   */
  async getStats(source: SourceType): Promise<{
    totalEntities: number;
    indexedEntities: number;
    totalVectors: number;
    averageChunksPerEntity: number;
    notIndexed: number;
  }> {
    const entities = await this.entityStore.findBySourceAndType(source, "", {
      includeDeleted: false,
    });

    const indexed = entities.filter(
      (e) => e.vectorIds && e.vectorIds.length > 0
    );
    const totalVectors = indexed.reduce(
      (sum, e) => sum + (e.vectorIds?.length || 0),
      0
    );

    return {
      totalEntities: entities.length,
      indexedEntities: indexed.length,
      totalVectors,
      averageChunksPerEntity:
        indexed.length > 0 ? totalVectors / indexed.length : 0,
      notIndexed: entities.length - indexed.length,
    };
  }
}
