import "dotenv/config";

import { initializeServices } from "../src/mcp/initialization.js";
import { insertRecordToVectorDB } from "../src/services/indexing/embeddings/vector-indexer.service.ts";
import { RecordStore } from "../src/stores/record.store.js";
import { VectorStore } from "../src/stores/vector.store.js";
import { SourceType } from "../src/types/index.js";
import logger from "../src/utils/logger.js";

/**
 * Script to index unindexed records to the vector database
 *
 * Usage:
 *   pnpm tsx scripts/index-vectors.ts
 *   pnpm tsx scripts/index-vectors.ts --source=notion
 *   pnpm tsx scripts/index-vectors.ts --batch-size=50
 *   pnpm tsx scripts/index-vectors.ts --force
 */

interface ScriptOptions {
  source?: SourceType;
  batchSize?: number;
  limit?: number;
  force?: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    batchSize: 50,
    limit: 100,
    force: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--source=")) {
      options.source = arg.split("=")[1] as SourceType;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--force") {
      options.force = true;
    }
  }

  return options;
}

async function getVectorStats(
  recordStore: RecordStore,
  source: SourceType
): Promise<{
  totalRecords: number;
  indexed: number;
  unindexed: number;
}> {
  const records = await recordStore.findBySourceAndType(source, undefined, {
    includeDeleted: false,
  });

  const indexed = records.filter((record) => record.lastEmbedDate);

  return {
    totalRecords: records.length,
    indexed: indexed.length,
    unindexed: records.length - indexed.length,
  };
}

async function indexVectorRecords() {
  const options = parseArgs();

  logger.info("🚀 Vector Indexing Script");
  logger.info("========================");
  logger.info(`Source: ${options.source || "all"}`);
  logger.info(`Limit: ${options.limit} records`);
  logger.info(`Batch Size: ${options.batchSize}`);
  logger.info(`Force Re-index: ${options.force ? "Yes" : "No"}`);
  logger.info("");

  const { qdrant } = await initializeServices();
  const recordStore = new RecordStore();
  const vectorStore = new VectorStore(qdrant);

  // Ensure collection exists
  await vectorStore.ensureCollection();

  // Get all sources to process
  const sources: SourceType[] = options.source ? [options.source] : ["notion"]; // Add more sources as needed

  for (const source of sources) {
    logger.info(`\n📦 Processing source: ${source}`);
    logger.info("─".repeat(50));

    // Get statistics before indexing
    const statsBefore = await getVectorStats(recordStore, source);
    logger.info(`\n📊 Current Statistics:`);
    logger.info(`   Total Records: ${statsBefore.totalRecords}`);
    logger.info(`   Already Indexed: ${statsBefore.indexed}`);
    logger.info(`   Unindexed: ${statsBefore.unindexed}`);

    if (statsBefore.unindexed === 0 && !options.force) {
      logger.info(`\n✅ All records already indexed for ${source}`);
      continue;
    }

    // Find unindexed or all records based on force flag
    logger.info(`\n🔍 Finding records to index...`);

    const allRecords = await recordStore.findBySourceAndType(source, "", {
      includeDeleted: false,
    });

    const candidateRecords = options.force
      ? allRecords
      : allRecords.filter((record) => !record.lastEmbedDate);

    if (candidateRecords.length === 0) {
      logger.info(`\n✅ No records to index for ${source}`);
      continue;
    }

    // Apply limit
    const recordsToIndex = candidateRecords.slice(0, options.limit);

    logger.info(`\n📝 Found ${candidateRecords.length} candidate records`);
    logger.info(`🔄 Processing ${recordsToIndex.length} records (limited)...`);

    const stats = {
      processed: 0,
      chunks: 0,
      errors: 0,
      skipped: 0,
    };

    // Process in batches
    for (let i = 0; i < recordsToIndex.length; i += options.batchSize!) {
      const batch = recordsToIndex.slice(i, i + options.batchSize!);
      logger.info(
        `\n   Batch ${Math.floor(i / options.batchSize!) + 1}/${Math.ceil(
          recordsToIndex.length / options.batchSize!
        )}`
      );

      for (const record of batch) {
        try {
          // Skip records with no content
          if (!record.content || record.content.trim().length === 0) {
            stats.skipped++;
            continue;
          }

          const vectorIds = await insertRecordToVectorDB(
            recordStore,
            vectorStore,
            record
          );

          stats.processed++;
          stats.chunks += vectorIds.length;
        } catch (err) {
          logger.error(
            { err, recordId: record._id },
            `Error indexing record ${record._id}`
          );
          stats.errors++;
        }
      }

      logger.info(
        `   Progress: ${stats.processed}/${recordsToIndex.length} processed, ${stats.chunks} chunks created`
      );
    }

    logger.info(`\n✅ Vector Indexing Complete for ${source}`);
    logger.info(`   Processed: ${stats.processed}`);
    logger.info(`   Total Chunks: ${stats.chunks}`);
    logger.info(`   Skipped (no content): ${stats.skipped}`);
    logger.info(`   Errors: ${stats.errors}`);

    // Get statistics after indexing
    const statsAfter = await getVectorStats(recordStore, source);
    logger.info(`\n📊 Final Statistics:`);
    logger.info(`   Total Records: ${statsAfter.totalRecords}`);
    logger.info(`   Indexed: ${statsAfter.indexed}`);
    logger.info(`   Remaining Unindexed: ${statsAfter.unindexed}`);
  }

  logger.info(`\n✨ Vector indexing script completed`);
}

const run = async () => {
  await indexVectorRecords();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Script error");
    process.exit(1);
  });
