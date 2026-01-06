import "dotenv/config";
import { initializeServices } from "../src/mcp/initialization.js";
import { RecordModel } from "../src/models/record.model.js";
import { GraphSchemaModel } from "../src/models/graph-schema.model.js";
import { GraphEmbeddingMetadata } from "../src/models/graph-embedding-metadata.model.js";
import { GraphStore } from "../src/stores/graph.store.js";
import { VectorStore } from "../src/stores/vector.store.js";
import { cleanupOrphanedEmbeddings } from "../src/services/cleanup/embedding-cleanup.service.js";
import * as readline from "readline";
import logger from "../src/utils/logger.js";
import { DataSourceModel } from "../src/models/data-source.model.js";

/**
 * Script to wipe all data from MongoDB, Memgraph, and Qdrant
 *
 * Usage:
 *   pnpm tsx scripts/wipe-data.ts                    # Interactive mode with confirmation
 *   pnpm tsx scripts/wipe-data.ts --force            # Skip confirmation
 *   pnpm tsx scripts/wipe-data.ts --only=mongodb     # Wipe only MongoDB
 *   pnpm tsx scripts/wipe-data.ts --only=memgraph    # Wipe only Memgraph
 *   pnpm tsx scripts/wipe-data.ts --only=qdrant      # Wipe only Qdrant
 *   pnpm tsx scripts/wipe-data.ts --source=linear    # Wipe only Linear data
 *   pnpm tsx scripts/wipe-data.ts --keep-mcp-config  # Keep MCP server configs
 *   pnpm tsx scripts/wipe-data.ts --only=memgraph --reset-schema  # Wipe Memgraph and reset schema
 */

interface WipeOptions {
  force: boolean;
  only?: "mongodb" | "memgraph" | "qdrant";
  source?: string;
  keepMcpConfig: boolean;
  resetSchema: boolean;
}

function parseArgs(): WipeOptions {
  const args = process.argv.slice(2);
  const options: WipeOptions = {
    force: false,
    keepMcpConfig: false,
    resetSchema: false,
  };

  for (const arg of args) {
    if (arg === "--force") {
      options.force = true;
    } else if (arg.startsWith("--only=")) {
      const value = arg.split("=")[1] as "mongodb" | "memgraph" | "qdrant";
      if (!["mongodb", "memgraph", "qdrant"].includes(value)) {
        logger.error(`❌ Invalid --only value: ${value}`);
        logger.error("   Valid values: mongodb, memgraph, qdrant");
        process.exit(1);
      }
      options.only = value;
    } else if (arg.startsWith("--source=")) {
      options.source = arg.split("=")[1];
    } else if (arg === "--keep-mcp-config") {
      options.keepMcpConfig = true;
    } else if (arg === "--reset-schema") {
      options.resetSchema = true;
    }
  }

  return options;
}

async function getStatistics(
  memgraph: any,
  qdrant: any,
  source?: string
): Promise<{
  mongodb: { records: number; schemas: number; mcpConfigs: number };
  memgraph: { nodes: number; relationships: number };
  qdrant: { collections: number; vectors: number };
}> {
  // MongoDB stats
  const recordCount = await RecordModel.countDocuments(
    source ? { source } : {}
  );
  const schemaCount = await GraphSchemaModel.countDocuments();
  const mcpConfigCount = await DataSourceModel.countDocuments();

  // Memgraph stats
  let nodeCount = 0;
  let relCount = 0;
  try {
    const nodeQuery = source
      ? `MATCH (n {source: '${source}'}) RETURN count(n) as count`
      : "MATCH (n) RETURN count(n) as count";
    const nodeResult = await memgraph.executeQuery(nodeQuery);
    nodeCount = nodeResult[0]?.count?.toNumber?.() || nodeResult[0]?.count || 0;

    const relQuery = source
      ? `MATCH (n {source: '${source}'})-[r]->() RETURN count(r) as count`
      : "MATCH ()-[r]->() RETURN count(r) as count";
    const relResult = await memgraph.executeQuery(relQuery);
    relCount = relResult[0]?.count?.toNumber?.() || relResult[0]?.count || 0;
  } catch (err) {
    logger.warn({ err }, "Could not get Memgraph stats");
  }

  // Qdrant stats
  let collectionCount = 0;
  let vectorCount = 0;
  try {
    const collections = await qdrant.client.getCollections();
    collectionCount = collections.collections?.length || 0;

    // Count vectors across all collections
    for (const collection of collections.collections || []) {
      const info = await qdrant.client.getCollection(collection.name);
      vectorCount += info.points_count || 0;
    }
  } catch (err) {
    logger.warn({ err }, "Could not get Qdrant stats");
  }

  return {
    mongodb: {
      records: recordCount,
      schemas: schemaCount,
      mcpConfigs: mcpConfigCount,
    },
    memgraph: {
      nodes: nodeCount,
      relationships: relCount,
    },
    qdrant: {
      collections: collectionCount,
      vectors: vectorCount,
    },
  };
}

async function confirmWipe(options: WipeOptions): Promise<boolean> {
  if (options.force) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    let message = "⚠️  WARNING: This will delete ALL data from ";

    if (options.only) {
      message += options.only.toUpperCase();
    } else {
      message += "MongoDB, Memgraph, and Qdrant";
    }

    message += "!\n   Type 'yes' to confirm: ";

    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes");
    });
  });
}

async function wipeMongoDB(
  keepMcpConfig: boolean,
  source?: string
): Promise<void> {
  logger.info(`\n🗑️  Wiping MongoDB${source ? ` (source: ${source})` : ""}...`);

  const filter = source ? { source } : {};

  // Delete records
  const recordResult = await RecordModel.deleteMany(filter);
  logger.info(`   ✓ Deleted ${recordResult.deletedCount} records`);

  // Delete graph embedding metadata
  const embeddingResult = await GraphEmbeddingMetadata.deleteMany(filter);
  logger.info(
    `   ✓ Deleted ${embeddingResult.deletedCount} graph embedding metadata records`
  );

  // Only delete schemas if wiping all data (not source-specific)
  if (!source) {
    const schemaResult = await GraphSchemaModel.deleteMany({});
    logger.info(`   ✓ Deleted ${schemaResult.deletedCount} graph schemas`);
  }

  // Optionally delete MCP configs
  if (!keepMcpConfig) {
    const mcpFilter = source ? { name: source } : {};
    const mcpResult = await DataSourceModel.deleteMany(mcpFilter);
    logger.info(`   ✓ Deleted ${mcpResult.deletedCount} MCP server configs`);
  } else {
    logger.info(`   ⊘ Kept MCP server configs (--keep-mcp-config)`);
  }
}

async function wipeMemgraph(
  memgraph: any,
  qdrant: any,
  resetSchema: boolean,
  source?: string
): Promise<void> {
  logger.info(
    `\n🗑️  Wiping Memgraph${source ? ` (source: ${source})` : ""}...`
  );

  try {
    if (source) {
      // Delete source-specific relationships first
      await memgraph.executeQuery(
        `MATCH (n {source: '${source}'})-[r]->() DELETE r`
      );
      logger.info(`   ✓ Deleted relationships for source: ${source}`);

      // Delete source-specific nodes
      await memgraph.executeQuery(`MATCH (n {source: '${source}'}) DELETE n`);
      logger.info(`   ✓ Deleted nodes for source: ${source}`);
    } else {
      // Delete all relationships first
      await memgraph.executeQuery("MATCH ()-[r]->() DELETE r");
      logger.info("   ✓ Deleted all relationships");

      // Delete all nodes
      await memgraph.executeQuery("MATCH (n) DELETE n");
      logger.info("   ✓ Deleted all nodes");
    }

    // Only drop indexes/constraints if wiping all data
    if (!source) {
      // Drop indexes (they will be recreated on next index)
      try {
        await memgraph.executeQuery("DROP INDEX ON :Resource(id)");
        await memgraph.executeQuery("DROP INDEX ON :Resource(type)");
        await memgraph.executeQuery("DROP INDEX ON :Resource(source)");
        logger.info("   ✓ Dropped indexes");
      } catch (err) {
        // Indexes might not exist, that's okay
        logger.info("   ⊘ No indexes to drop");
      }

      // Drop constraints (they will be recreated on next index)
      try {
        await memgraph.executeQuery(
          "DROP CONSTRAINT ON (n:Resource) ASSERT n.id IS UNIQUE"
        );
        logger.info("   ✓ Dropped constraints");
      } catch (err) {
        // Constraints might not exist, that's okay
        logger.info("   ⊘ No constraints to drop");
      }
    }

    // Optionally reset GraphSchema (only if wiping all data)
    if (resetSchema && !source) {
      logger.info("   🔄 Resetting graph schema...");
      const schemaResult = await GraphSchemaModel.deleteMany({});
      logger.info(`   ✓ Deleted ${schemaResult.deletedCount} graph schemas`);
    } else if (!source) {
      logger.info("   ⊘ Kept graph schema (use --reset-schema to reset)");
    }

    // Clean up orphaned embeddings (since graph nodes are gone)
    logger.info("   🧹 Cleaning up orphaned embeddings...");
    const graphStore = new GraphStore(memgraph);
    const vectorStore = new VectorStore(qdrant);
    const { deleted, errors } = await cleanupOrphanedEmbeddings(
      graphStore,
      vectorStore
    );
    logger.info(
      `   ✓ Cleaned up ${deleted} orphaned embeddings${
        errors > 0 ? ` (${errors} errors)` : ""
      }`
    );

    // Clear MongoDB graph timestamps so records will be re-indexed
    logger.info("   🔄 Clearing MongoDB graph timestamps...");
    const filter = source ? { source } : {};
    const result = await RecordModel.updateMany(filter, {
      $unset: { lastGraphIndexAt: "" },
    });
    logger.info(`   ✓ Cleared timestamps for ${result.modifiedCount} records`);
  } catch (err) {
    logger.error({ err }, "Error wiping Memgraph");
    throw err;
  }
}

async function wipeQdrant(qdrant: any, source?: string): Promise<void> {
  logger.info(`\n🗑️  Wiping Qdrant${source ? ` (source: ${source})` : ""}...`);

  try {
    const collections = await qdrant.client.getCollections();

    if (!collections.collections || collections.collections.length === 0) {
      logger.info("   ⊘ No collections to delete");
    } else {
      if (source) {
        // Delete vectors by source filter
        let deletedCount = 0;
        for (const collection of collections.collections) {
          try {
            const result = await qdrant.client.delete(collection.name, {
              filter: {
                must: [{ key: "source", match: { value: source } }],
              },
            });
            deletedCount++;
            logger.info(
              `   ✓ Deleted vectors from collection: ${collection.name}`
            );
          } catch (err) {
            logger.warn(
              { err, collection: collection.name },
              "Could not delete vectors from collection"
            );
          }
        }
        logger.info(`   ✓ Cleaned ${deletedCount} collections`);
      } else {
        // Delete all collections
        for (const collection of collections.collections) {
          await qdrant.client.deleteCollection(collection.name);
          logger.info(`   ✓ Deleted collection: ${collection.name}`);
        }
      }
    }

    // Clean up embedding metadata
    logger.info("   🧹 Cleaning up embedding metadata...");
    const filter = source ? { source } : {};
    const result = await GraphEmbeddingMetadata.deleteMany(filter);
    logger.info(`   ✓ Deleted ${result.deletedCount} metadata records`);

    // Clear MongoDB vector timestamps so records will be re-indexed
    logger.info("   🔄 Clearing MongoDB vector timestamps...");
    const timestampFilter = source ? { source } : {};
    const timestampResult = await RecordModel.updateMany(timestampFilter, {
      $unset: { lastEmbedDate: "", lastEmbeddedAt: "" },
    });
    logger.info(
      `   ✓ Cleared timestamps for ${timestampResult.modifiedCount} records`
    );
  } catch (err) {
    logger.error({ err }, "Error wiping Qdrant");
    throw err;
  }
}

async function run() {
  const options = parseArgs();

  logger.info("🧹 Data Wipe Script");
  logger.info("===================\n");

  if (options.source) {
    logger.info(`Scope: Source '${options.source}' only`);
  } else if (options.only) {
    logger.info(`Scope: ${options.only.toUpperCase()} only`);
  } else {
    logger.info("Scope: All databases");
  }

  if (options.keepMcpConfig) {
    logger.info("Mode: Keep MCP server configs");
  }

  logger.info("");

  // Initialize services
  const { memgraph, qdrant, mongoose } = await initializeServices();

  // Get current statistics
  logger.info("📊 Current Statistics:");
  logger.info("=====================");
  const statsBefore = await getStatistics(memgraph, qdrant, options.source);

  logger.info("\nMongoDB:");
  logger.info(`  Records: ${statsBefore.mongodb.records}`);
  logger.info(`  Graph Schemas: ${statsBefore.mongodb.schemas}`);
  logger.info(`  MCP Configs: ${statsBefore.mongodb.mcpConfigs}`);

  logger.info("\nMemgraph:");
  logger.info(`  Nodes: ${statsBefore.memgraph.nodes}`);
  logger.info(`  Relationships: ${statsBefore.memgraph.relationships}`);

  logger.info("\nQdrant:");
  logger.info(`  Collections: ${statsBefore.qdrant.collections}`);
  logger.info(`  Vectors: ${statsBefore.qdrant.vectors}`);
  logger.info("");

  // Confirm deletion
  const confirmed = await confirmWipe(options);

  if (!confirmed) {
    logger.info("\n❌ Wipe cancelled");
    process.exit(0);
  }

  logger.info("\n🚀 Starting wipe process...");

  // Perform wipes based on options
  try {
    if (!options.only || options.only === "mongodb") {
      await wipeMongoDB(options.keepMcpConfig, options.source);
    }

    if (!options.only || options.only === "memgraph") {
      await wipeMemgraph(memgraph, qdrant, options.resetSchema, options.source);
    }

    if (!options.only || options.only === "qdrant") {
      await wipeQdrant(qdrant, options.source);
    }

    // Get final statistics
    logger.info("\n📊 Final Statistics:");
    logger.info("===================");
    const statsAfter = await getStatistics(memgraph, qdrant, options.source);

    logger.info("\nMongoDB:");
    logger.info(`  Records: ${statsAfter.mongodb.records}`);
    logger.info(`  Graph Schemas: ${statsAfter.mongodb.schemas}`);
    logger.info(`  MCP Configs: ${statsAfter.mongodb.mcpConfigs}`);

    logger.info("\nMemgraph:");
    logger.info(`  Nodes: ${statsAfter.memgraph.nodes}`);
    logger.info(`  Relationships: ${statsAfter.memgraph.relationships}`);

    logger.info("\nQdrant:");
    logger.info(`  Collections: ${statsAfter.qdrant.collections}`);
    logger.info(`  Vectors: ${statsAfter.qdrant.vectors}`);

    logger.info("\n✨ Wipe completed successfully!");
    logger.info("\nNext steps:");
    logger.info("  1. Run 'pnpm tsx scripts/sync-records.ts' to sync records");
    logger.info("  2. Run 'pnpm tsx scripts/index-graph.ts' to build graph");
    logger.info(
      "  3. Run 'pnpm tsx scripts/index-vectors.ts' to build embeddings"
    );
  } catch (err) {
    logger.error({ err }, "Error during wipe");
    process.exit(1);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Fatal error");
    process.exit(1);
  });
