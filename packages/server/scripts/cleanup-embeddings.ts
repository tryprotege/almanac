import "dotenv/config";
import { parseArgs } from "node:util";
import { initializeServices } from "../src/mcp/initialization.js";
import { RecordStore } from "../src/stores/record.store.js";
import { GraphStore } from "../src/stores/graph.store.js";
import { VectorStore } from "../src/stores/vector.store.js";
import { SourceType } from "../src/types/index.js";
import {
  cleanupDeletedEntityEmbeddings,
  cleanupDeletedRelationshipEmbeddings,
} from "../src/services/indexing/graph/graph-embeddings.js";
import logger from "../src/utils/logger.js";

/**
 * Cleanup Embeddings Script
 * Removes orphaned entity and relationship embeddings for deleted records
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-embeddings.ts --source=notion
 *   pnpm tsx scripts/cleanup-embeddings.ts --source=github
 *   pnpm tsx scripts/cleanup-embeddings.ts --source=all
 */

async function cleanupEmbeddings() {
  const args = parseArgs({
    options: {
      source: {
        type: "string",
        short: "s",
      },
    },
    allowPositionals: false,
  });

  const source = args.values.source as SourceType | "all" | undefined;

  if (!source) {
    console.error("❌ Error: --source is required");
    console.log("\nUsage:");
    console.log("  pnpm tsx scripts/cleanup-embeddings.ts --source=notion");
    console.log("  pnpm tsx scripts/cleanup-embeddings.ts --source=github");
    console.log("  pnpm tsx scripts/cleanup-embeddings.ts --source=all");
    process.exit(1);
  }

  logger.info({ msg: "🧹 Cleanup Embeddings Script", source });

  const { memgraph, qdrant } = await initializeServices();

  const recordStore = new RecordStore();
  const graphStore = new GraphStore(memgraph);
  const vectorStore = new VectorStore(qdrant);

  const deps = {
    vectorStore,
    recordStore,
    graphStore,
  };

  const sources: SourceType[] =
    source === "all"
      ? ["notion", "github", "fathom", "slack"]
      : [source as SourceType];

  let totalEntityDeleted = 0;
  let totalRelDeleted = 0;

  for (const src of sources) {
    logger.info({ msg: `📦 Processing source: ${src}` });

    try {
      // Clean up entity embeddings
      const entityStats = await cleanupDeletedEntityEmbeddings(src, deps);
      totalEntityDeleted += entityStats.deleted;

      // Clean up relationship embeddings
      const relStats = await cleanupDeletedRelationshipEmbeddings(src, deps);
      totalRelDeleted += relStats.deleted;

      logger.info({
        msg: `✅ Cleaned up ${entityStats.deleted} entity embeddings and ${relStats.deleted} relationship embeddings for ${src}`,
      });
    } catch (err) {
      logger.error({ err, source: src }, `Error cleaning up ${src}`);
    }
  }

  logger.info({ msg: "Cleanup Complete", totalEntityDeleted, totalRelDeleted });
}

const run = async () => {
  await cleanupEmbeddings();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Script error");
    process.exit(1);
  });
