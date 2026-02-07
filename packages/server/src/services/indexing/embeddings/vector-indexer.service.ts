import { randomUUID } from 'crypto';
import pLimit from 'p-limit';

import { env } from '../../../env.js';
import { Record } from '../../../models/record.model.js';
import { RecordStore } from '../../../stores/record.store.js';
import { VectorStore } from '../../../stores/vector.store.js';
import { VectorPoint, SourceType } from '../../../types/index.js';
import { chunkText } from '../../../utils/chunking.js';
import { embed } from '../../../utils/embedding.js';
import logger from '../../../utils/logger.js';

// Create concurrency limiter. Have this outside of the function to ensure the limit applied to all invocations
const limit = pLimit(env.VECTOR_INDEXING_CONCURRENCY ?? 5);

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

  logger.info({
    msg: '🔄 Starting vector indexing',
    source,
    concurrency: env.VECTOR_INDEXING_CONCURRENCY,
  });

  let hasMore = true;
  let batchNumber = 0;

  while (hasMore) {
    // Use new method to fetch only records needing embedding
    // Skip is always 0 because processed records get lastEmbeddedAt set and disappear from query results
    const recordsToProcess = await recordStore.findNeedingEmbedding(source, undefined, {
      limit: 50,
      skip: 0,
      includeDeleted: false,
    });

    if (recordsToProcess.length === 0) {
      hasMore = false;
      break;
    }

    batchNumber++;
    logger.info(`\n🔄 Processing batch ${batchNumber} (${recordsToProcess.length} records)...`);

    // Process batch in parallel
    const promises = recordsToProcess.map((record) =>
      limit(async () => {
        try {
          const vectorIds = await insertRecordToVectorDB(recordStore, vectorStore, record);
          stats.processed++;
          stats.chunks += vectorIds.length;
          return { success: true, chunks: vectorIds.length };
        } catch (err) {
          logger.error({ err, recordId: record._id }, `Error indexing record ${record._id}`);

          // Mark failed record with status 'failed'
          await recordStore.upsert({
            _id: record._id,
            lastEmbeddedAt: new Date(),
            lastEmbeddingStatus: 'failed',
          });

          stats.errors++;
          return { success: false, chunks: 0 };
        }
      }),
    );

    await Promise.all(promises);

    // Log progress
    const progress = `  ✓ Batch ${batchNumber} complete - ${stats.processed} processed, ${stats.chunks} chunks, ${stats.errors} errors`;
    logger.info(progress);
  }

  logger.info({
    msg: '✅ Vector indexing complete',
    source,
    stats: {
      processed: stats.processed,
      chunks: stats.chunks,
      errors: stats.errors,
      skipped: stats.skipped,
    },
  });

  return stats;
}

/**
 * Index a single record into Qdrant
 */
export async function insertRecordToVectorDB(
  recordStore: RecordStore,
  vectorStore: VectorStore,
  record: Record,
): Promise<string[]> {
  // Skip if no content
  if (!record.content || record.content.trim().length === 0) {
    logger.debug({
      msg: '⏭️  Skipping record with no content',
      recordId: record._id,
      recordTitle: record.title,
    });

    // Mark as skipped with status
    await recordStore.upsert({
      _id: record._id,
      lastEmbeddedAt: new Date(),
      lastEmbeddingStatus: 'skipped_no_content',
    });

    return [];
  }

  // Delete existing vectors for this record (old versions with different checksum)
  if (record.lastEmbeddedAt) {
    await vectorStore.deleteOutdatedPoints(record._id, record.checksum);
  }

  // Prepend title to content for better search relevance
  const contentWithTitle = record.title
    ? `ID: ${record.sourceId}\n# ${record.title}\n\n${record.content}`
    : record.content;

  // Chunk the content (including title)
  const chunks = chunkText(contentWithTitle);

  // Generate embeddings for all chunks
  const chunkTexts = chunks.map((chunk) => chunk.text);
  const embeddings = await embed(chunkTexts);

  // Create Qdrant points with minimal payload
  // Metadata (source, people, tags, dates) is fetched from MongoDB via mongoId
  const vectorIds: string[] = [];
  const points = chunks.map<VectorPoint>((chunk, index) => {
    const vectorId = randomUUID();
    vectorIds.push(vectorId);

    return {
      id: vectorId,
      vector: embeddings[index],
      payload: {
        type: 'chunk',
        // Link to MongoDB (required)
        recordId: record._id,
        // Change detection (for re-indexing)
        checksum: record.checksum,
        // Chunk metadata (for result assembly)
        chunkIndex: chunk.index,
        chunkStart: chunk.start,
        chunkEnd: chunk.end,
      },
    };
  });

  // Upsert to Qdrant
  await vectorStore.upsertPoints(points);

  // Update record with vector IDs and success status
  await recordStore.upsert({
    _id: record._id,
    lastEmbeddedAt: new Date(),
    lastEmbeddingStatus: 'success',
  });

  return vectorIds;
}
