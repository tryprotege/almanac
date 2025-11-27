import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { chunkText } from "../../utils/chunking.js";
import { embed } from "../../utils/embedding.js";
import { Record } from "../../models/record.model.js";
import { SourceType } from "../../types/index.js";
import { randomUUID } from "crypto";
import OpenAI from "openai";

/**
 * Vector Indexer Service
 * Post-processes MongoDB entities into Qdrant vector store
 * Handles chunking and embedding of large content
 */

/**
 * Index all entities from a source into Qdrant
 */
export async function insertAllRecordsToVectorDB(
  recordStore: RecordStore,
  vectorStore: VectorStore,
  source: SourceType,
  options?: {
    recordType?: string;
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
  await vectorStore.ensureCollection();

  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch batch of entities
    const entities = await recordStore.findBySourceAndType(
      source,
      options?.recordType,
      { limit: batchSize, skip, includeDeleted: false }
    );

    if (entities.length === 0) {
      hasMore = false;
      break;
    }

    // Process batch
    for (const entity of entities) {
      try {
        await insertRecordToVectorDB(recordStore, vectorStore, entity);
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
export async function insertRecordToVectorDB(
  recordStore: RecordStore,
  vectorStore: VectorStore,
  entity: Record
): Promise<string[]> {
  // Skip if no content
  if (!entity.content || entity.content.trim().length === 0) {
    return [];
  }

  // Delete existing vectors for this entity
  if (entity.vectorIds && entity.vectorIds.length > 0) {
    await vectorStore.deletePoints(entity.vectorIds);
  }

  // Chunk the content
  const chunks = chunkText(entity.content);

  // Generate embeddings for all chunks
  const chunkTexts = chunks.map((chunk) => chunk.text);
  const embeddings = await embed(chunkTexts);

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
        recordType: entity.recordType,
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
  await vectorStore.upsertPoints(points);

  // Update entity with vector IDs
  await recordStore.upsert({
    _id: entity._id,
    vectorIds,
    lastIndexedAt: new Date(),
  });

  return vectorIds;
}
