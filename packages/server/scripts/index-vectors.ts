import "dotenv/config";
import { getServices } from "../src/mcp/initialization.js";
import { RecordStore } from "../src/stores/record.store.js";
import { VectorStore } from "../src/stores/vector.store.js";
import { insertRecordToVectorDB } from "../src/services/indexing/vector-indexer.service.js";
import { SourceType } from "../src/types/index.js";

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
  const records = await recordStore.findBySourceAndType(source, "", {
    includeDeleted: false,
  });

  const indexed = records.filter(
    (record) => record.vectorIds && record.vectorIds.length > 0
  );

  return {
    totalRecords: records.length,
    indexed: indexed.length,
    unindexed: records.length - indexed.length,
  };
}

async function indexVectorRecords() {
  const options = parseArgs();

  console.log("🚀 Vector Indexing Script");
  console.log("========================");
  console.log(`Source: ${options.source || "all"}`);
  console.log(`Limit: ${options.limit} records`);
  console.log(`Batch Size: ${options.batchSize}`);
  console.log(`Force Re-index: ${options.force ? "Yes" : "No"}`);
  console.log("");

  const { qdrant } = await getServices();
  const recordStore = new RecordStore();
  const vectorStore = new VectorStore(qdrant);

  // Ensure collection exists
  await vectorStore.ensureCollection();

  // Get all sources to process
  const sources: SourceType[] = options.source ? [options.source] : ["notion"]; // Add more sources as needed

  for (const source of sources) {
    console.log(`\n📦 Processing source: ${source}`);
    console.log("─".repeat(50));

    // Get statistics before indexing
    const statsBefore = await getVectorStats(recordStore, source);
    console.log(`\n📊 Current Statistics:`);
    console.log(`   Total Records: ${statsBefore.totalRecords}`);
    console.log(`   Already Indexed: ${statsBefore.indexed}`);
    console.log(`   Unindexed: ${statsBefore.unindexed}`);

    if (statsBefore.unindexed === 0 && !options.force) {
      console.log(`\n✅ All records already indexed for ${source}`);
      continue;
    }

    // Find unindexed or all records based on force flag
    console.log(`\n🔍 Finding records to index...`);

    const allRecords = await recordStore.findBySourceAndType(source, "", {
      includeDeleted: false,
    });

    const candidateRecords = options.force
      ? allRecords
      : allRecords.filter(
          (record) => !record.vectorIds || record.vectorIds.length === 0
        );

    if (candidateRecords.length === 0) {
      console.log(`\n✅ No records to index for ${source}`);
      continue;
    }

    // Apply limit
    const recordsToIndex = candidateRecords.slice(0, options.limit);

    console.log(`\n📝 Found ${candidateRecords.length} candidate records`);
    console.log(`🔄 Processing ${recordsToIndex.length} records (limited)...`);

    const stats = {
      processed: 0,
      chunks: 0,
      errors: 0,
      skipped: 0,
    };

    // Process in batches
    for (let i = 0; i < recordsToIndex.length; i += options.batchSize!) {
      const batch = recordsToIndex.slice(i, i + options.batchSize!);
      console.log(
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
        } catch (error) {
          console.error(
            `   ❌ Error indexing record ${record._id}:`,
            error instanceof Error ? error.message : error
          );
          stats.errors++;
        }
      }

      console.log(
        `   Progress: ${stats.processed}/${recordsToIndex.length} processed, ${stats.chunks} chunks created`
      );
    }

    console.log(`\n✅ Vector Indexing Complete for ${source}`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Total Chunks: ${stats.chunks}`);
    console.log(`   Skipped (no content): ${stats.skipped}`);
    console.log(`   Errors: ${stats.errors}`);

    // Get statistics after indexing
    const statsAfter = await getVectorStats(recordStore, source);
    console.log(`\n📊 Final Statistics:`);
    console.log(`   Total Records: ${statsAfter.totalRecords}`);
    console.log(`   Indexed: ${statsAfter.indexed}`);
    console.log(`   Remaining Unindexed: ${statsAfter.unindexed}`);
  }

  console.log(`\n✨ Vector indexing script completed`);
}

const run = async () => {
  await indexVectorRecords();
};

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  });
