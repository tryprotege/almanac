import { randomUUID } from "crypto";
import pLimit from "p-limit";

import { env } from "../../env.js";
import { Record } from "../../models/record.model.js";
import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { VectorPoint, SourceType } from "../../types/index.js";
import { chunkText } from "../../utils/chunking.js";
import { embed } from "../../utils/embedding.js";

// Create concurrency limiter. Have this outside of the function to ensure the limit applied to all invocations
const limit = pLimit(env.VECTOR_INDEXING_CONCURRENCY);

/**
 * Vector Indexer Service
 * Post-processes MongoDB entities into Qdrant vector store
 * Handles chunking and embedding of large content
 */

/**
 * Index all entities from a source into Qdrant with parallel processing
 */
export async function insertAllRecordsToVectorDB(
  recordStore: RecordStore,
  vectorStore: VectorStore,
  source: SourceType
): Promise<{
  processed: number;
  chunks: number;
  errors: number;
  skipped: number;
}> {
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
  let batchNumber = 0;

  while (hasMore) {
    // Fetch batch of entities
    const entities = await recordStore.findBySourceAndType(source, undefined, {
      limit: 100,
      skip,
      includeDeleted: false,
    });

    if (entities.length === 0) {
      hasMore = false;
      break;
    }

    batchNumber++;
    console.log(
      `\n🔄 Processing batch ${batchNumber} (${entities.length} entities)...`
    );

    // Process batch in parallel
    const promises = entities.map((entity) =>
      limit(async () => {
        try {
          const vectorIds = await insertRecordToVectorDB(
            recordStore,
            vectorStore,
            entity
          );
          stats.processed++;
          stats.chunks += vectorIds.length;
          return { success: true, chunks: vectorIds.length };
        } catch (error) {
          console.error(`  ⚠️  Error indexing entity ${entity._id}:`, error);
          stats.errors++;
          return { success: false, chunks: 0 };
        }
      })
    );

    await Promise.all(promises);

    skip += entities.length;

    // Log progress
    const progress = `  ✓ Batch ${batchNumber} complete - ${stats.processed} processed, ${stats.chunks} chunks, ${stats.errors} errors`;
    console.log(progress);
  }

  console.log(`\n✅ Vector indexing complete for ${source}`);
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

  // Prepend title to content for better search relevance
  const contentWithTitle = entity.title
    ? `# ${entity.title}\n\n${entity.content}`
    : entity.content;

  // Chunk the content (including title)
  const chunks = chunkText(contentWithTitle);

  // Generate embeddings for all chunks
  const chunkTexts = chunks.map((chunk) => chunk.text);
  const embeddings = await embed(chunkTexts);

  // Create Qdrant points
  const vectorIds: string[] = [];
  const points = chunks.map<VectorPoint>((chunk, index) => {
    const vectorId = randomUUID();
    vectorIds.push(vectorId);

    return {
      id: vectorId,
      vector: embeddings[index],
      payload: {
        mongoId: entity._id,
        checksum: entity.checksum,
        chunkIndex: chunk.index,
        chunkStart: chunk.start,
        chunkEnd: chunk.end,
        chunkText: chunk.text,
      },
    };
  });

  // Upsert to Qdrant
  await vectorStore.upsertPoints(points);

  // Update entity with vector IDs
  await recordStore.upsert({
    _id: entity._id,
    vectorIds,
    lastEmbedDate: new Date(),
  });

  return vectorIds;
}
