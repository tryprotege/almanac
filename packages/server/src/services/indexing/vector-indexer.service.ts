import { RecordStore } from "../../stores/record.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { chunkText } from "../../utils/chunking.js";
import { embed } from "../../utils/embedding.js";
import { Record } from "../../models/record.model.js";
import { SourceType } from "../../types/index.js";
import { randomUUID } from "crypto";
import pLimit from "p-limit";
import { env } from "../../env.js";

/**
 * Vector Indexer Service
 * Post-processes MongoDB records into Qdrant vector store
 * Handles chunking and embedding of large content
 */

/**
 * Index all records from a source into Qdrant with parallel processing
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
    concurrency?: number;
  }
): Promise<{
  processed: number;
  chunks: number;
  errors: number;
  skipped: number;
}> {
  const batchSize = options?.batchSize || 50;
  const concurrency = options?.concurrency || env.VECTOR_INDEXING_CONCURRENCY;
  const stats = {
    processed: 0,
    chunks: 0,
    errors: 0,
    skipped: 0,
  };

  console.log(`🔄 Starting vector indexing for source: ${source}`);
  console.log(`   Concurrency: ${concurrency} parallel records`);

  // Ensure Qdrant collection exists
  await vectorStore.ensureCollection();

  // Create concurrency limiter
  const limit = pLimit(concurrency);

  let skip = 0;
  let hasMore = true;
  let batchNumber = 0;

  while (hasMore) {
    // Fetch batch of records
    const records = await recordStore.findBySourceAndType(
      source,
      options?.recordType,
      { limit: batchSize, skip, includeDeleted: false }
    );

    if (records.length === 0) {
      hasMore = false;
      break;
    }

    batchNumber++;
    console.log(
      `\n🔄 Processing batch ${batchNumber} (${records.length} records)...`
    );

    // Process batch in parallel
    const promises = records.map((record) =>
      limit(async () => {
        try {
          const vectorIds = await insertRecordToVectorDB(
            recordStore,
            vectorStore,
            record
          );
          stats.processed++;
          stats.chunks += vectorIds.length;
          return { success: true, chunks: vectorIds.length };
        } catch (error) {
          console.error(`  ⚠️  Error indexing record ${record._id}:`, error);
          stats.errors++;
          return { success: false, chunks: 0 };
        }
      })
    );

    await Promise.all(promises);

    skip += records.length;

    // Log progress
    const progress = `  ✓ Batch ${batchNumber} complete - ${stats.processed} processed, ${stats.chunks} chunks, ${stats.errors} errors`;
    console.log(progress);
  }

  console.log(`\n✅ Vector indexing complete for ${source}`);
  console.log(`   Processed: ${stats.processed} records`);
  console.log(`   Chunks: ${stats.chunks} vectors`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Skipped: ${stats.skipped}`);

  return stats;
}

/**
 * Index a single record into Qdrant
 */
export async function insertRecordToVectorDB(
  recordStore: RecordStore,
  vectorStore: VectorStore,
  record: Record
): Promise<string[]> {
  // Skip if no content
  if (!record.content || record.content.trim().length === 0) {
    return [];
  }

  // Delete existing vectors for this record
  if (record.vectorIds && record.vectorIds.length > 0) {
    await vectorStore.deletePoints(record.vectorIds);
  }

  // Prepend title to content for better search relevance
  const contentWithTitle = record.title
    ? `# ${record.title}\n\n${record.content}`
    : record.content;

  // Chunk the content (including title)
  const chunks = chunkText(contentWithTitle);

  // Generate embeddings for all chunks
  const chunkTexts = chunks.map((chunk) => chunk.text);
  const embeddings = await embed(chunkTexts);

  // Create Qdrant points with minimal payload
  // Metadata (source, people, tags, dates) is fetched from MongoDB via mongoId
  const vectorIds: string[] = [];
  const points = chunks.map((chunk, index) => {
    const vectorId = randomUUID();
    vectorIds.push(vectorId);

    return {
      id: vectorId,
      vector: embeddings[index],
      payload: {
        // Link to MongoDB (required)
        mongoId: record._id,
        // Change detection (for re-indexing)
        checksum: record.checksum,
        // Display data (avoid extra MongoDB query)
        title: record.title,
        // Chunk metadata (for result assembly)
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        chunkStart: chunk.start,
        chunkEnd: chunk.end,
        totalChunks: chunks.length,
      },
    };
  });

  // Upsert to Qdrant
  await vectorStore.upsertPoints(points);

  // Update record with vector IDs
  await recordStore.upsert({
    _id: record._id,
    vectorIds,
    lastEmbedDate: new Date(),
  });

  return vectorIds;
}
