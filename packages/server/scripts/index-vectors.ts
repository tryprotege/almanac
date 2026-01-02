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
 *   pnpm tsx scripts/index-vectors.ts                    # Index all unindexed records
 *   pnpm tsx scripts/index-vectors.ts --source=notion    # Index specific source
 *   pnpm tsx scripts/index-vectors.ts --limit=100        # Cap at 100 records
 *   pnpm tsx scripts/index-vectors.ts --batch-size=50    # Process in batches of 50
 *   pnpm tsx scripts/index-vectors.ts --force            # Re-index all records (even indexed ones)
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
    limit: undefined, // No limit by default
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

  const indexed = records.filter((record) => record.lastEmbeddedAt);

  return {
    totalRecords: records.length,
    indexed: indexed.length,
    unindexed: records.length - indexed.length,
  };
}

async function indexVectorRecords() {
  const options = parseArgs();

  logger.info({ msg: "🚀 Vector Indexing Script", ...options });

  const { qdrant } = await initializeServices();
  const recordStore = new RecordStore();
  const vectorStore = new VectorStore(qdrant);

  // Ensure collection exists
  await vectorStore.ensureCollection();

  // Get all sources to process
  const sources: SourceType[] = options.source
    ? [options.source]
    : ["notion", "fathom", "github", "slack"]; // Add more sources as needed

  // Show what will be processed
  logger.info({
    msg: `📋 Sources to process: ${sources.join(", ")}`,
    totalSources: sources.length,
  });

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const source = sources[sourceIndex];
    const sourceNum = sourceIndex + 1;

    // Visual separator
    logger.info(`\n${"━".repeat(60)}`);
    logger.info({
      msg: `📦 Source ${sourceNum}/${sources.length}: ${source.toUpperCase()}`,
    });
    logger.info(`${"━".repeat(60)}\n`);

    // Get statistics before indexing
    const statsBefore = await getVectorStats(recordStore, source);
    logger.info({
      msg: `📊 Current Statistics`,
      totalRecords: statsBefore.totalRecords,
      indexed: statsBefore.indexed,
      unindexed: statsBefore.unindexed,
    });

    if (statsBefore.unindexed === 0 && !options.force) {
      logger.info({ msg: `✅ All records already indexed`, source });
      continue;
    }

    const allRecords = await recordStore.findBySourceAndType(source, "", {
      includeDeleted: false,
    });

    const candidateRecords = options.force
      ? allRecords
      : allRecords.filter((record) => !record.lastEmbeddedAt);

    if (candidateRecords.length === 0) {
      logger.info({ msg: `✅ No records to index`, source });
      continue;
    }

    // Apply limit (if specified)
    const recordsToIndex = options.limit
      ? candidateRecords.slice(0, options.limit)
      : candidateRecords;

    logger.info({
      msg: options.limit
        ? `🔄 Processing ${recordsToIndex.length} records (limited to ${options.limit})...`
        : `🔄 Processing ${recordsToIndex.length} records (all unindexed)...`,
    });

    const stats = {
      processed: 0,
      chunks: 0,
      errors: 0,
      skipped: 0,
    };

    const startTime = Date.now();
    const totalBatches = Math.ceil(recordsToIndex.length / options.batchSize!);

    // Process in batches
    for (let i = 0; i < recordsToIndex.length; i += options.batchSize!) {
      const batch = recordsToIndex.slice(i, i + options.batchSize!);
      const batchNum = Math.floor(i / options.batchSize!) + 1;

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

      // Progress update after each batch
      const elapsedMs = Date.now() - startTime;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const percentage = Math.floor(
        (stats.processed / recordsToIndex.length) * 100
      );

      // Format elapsed time
      const minutes = Math.floor(elapsedSec / 60);
      const seconds = elapsedSec % 60;
      const elapsedStr =
        minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

      logger.info({
        msg: `  ⏳ [Batch ${batchNum}/${totalBatches}] ${stats.processed}/${recordsToIndex.length} (${percentage}%) - ${stats.chunks} chunks - ${elapsedStr} elapsed`,
      });
    }

    // Wait a moment for database to settle
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get statistics after indexing
    const statsAfter = await getVectorStats(recordStore, source);

    logger.info({
      msg: `✅ ${source.toUpperCase()} indexing complete`,
      processed: stats.processed,
      totalChunks: stats.chunks,
      skipped: stats.skipped,
      errors: stats.errors,
      delta: {
        indexed: statsAfter.indexed - statsBefore.indexed,
      },
    });
  }

  // Final completion message
  logger.info(`\n${"━".repeat(60)}`);
  logger.info(`✨ ALL SOURCES INDEXED - Job Complete!`);
  logger.info(`${"━".repeat(60)}\n`);
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
