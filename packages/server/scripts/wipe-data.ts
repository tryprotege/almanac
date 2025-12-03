import "dotenv/config";
import { initializeServices } from "../src/mcp/initialization.js";
import { RecordModel } from "../src/models/record.model.js";
import { GraphSchemaModel } from "../src/models/graph-schema.model.js";
import { MCPServerConfigModel } from "../src/models/mcp-config.model.js";
import readline from "readline";

/**
 * Script to wipe all data from MongoDB, Memgraph, and Qdrant
 *
 * Usage:
 *   pnpm tsx scripts/wipe-data.ts                    # Interactive mode with confirmation
 *   pnpm tsx scripts/wipe-data.ts --force            # Skip confirmation
 *   pnpm tsx scripts/wipe-data.ts --only=mongodb     # Wipe only MongoDB
 *   pnpm tsx scripts/wipe-data.ts --only=memgraph    # Wipe only Memgraph
 *   pnpm tsx scripts/wipe-data.ts --only=qdrant      # Wipe only Qdrant
 *   pnpm tsx scripts/wipe-data.ts --keep-mcp-config  # Keep MCP server configs
 */

interface WipeOptions {
  force: boolean;
  only?: "mongodb" | "memgraph" | "qdrant";
  keepMcpConfig: boolean;
}

function parseArgs(): WipeOptions {
  const args = process.argv.slice(2);
  const options: WipeOptions = {
    force: false,
    keepMcpConfig: false,
  };

  for (const arg of args) {
    if (arg === "--force") {
      options.force = true;
    } else if (arg.startsWith("--only=")) {
      const value = arg.split("=")[1] as "mongodb" | "memgraph" | "qdrant";
      if (!["mongodb", "memgraph", "qdrant"].includes(value)) {
        console.error(`❌ Invalid --only value: ${value}`);
        console.error("   Valid values: mongodb, memgraph, qdrant");
        process.exit(1);
      }
      options.only = value;
    } else if (arg === "--keep-mcp-config") {
      options.keepMcpConfig = true;
    }
  }

  return options;
}

async function getStatistics(
  memgraph: any,
  qdrant: any
): Promise<{
  mongodb: { records: number; schemas: number; mcpConfigs: number };
  memgraph: { nodes: number; relationships: number };
  qdrant: { collections: number; vectors: number };
}> {
  // MongoDB stats
  const recordCount = await RecordModel.countDocuments();
  const schemaCount = await GraphSchemaModel.countDocuments();
  const mcpConfigCount = await MCPServerConfigModel.countDocuments();

  // Memgraph stats
  let nodeCount = 0;
  let relCount = 0;
  try {
    const nodeResult = await memgraph.executeQuery(
      "MATCH (n) RETURN count(n) as count"
    );
    nodeCount = nodeResult[0]?.count?.toNumber?.() || nodeResult[0]?.count || 0;

    const relResult = await memgraph.executeQuery(
      "MATCH ()-[r]->() RETURN count(r) as count"
    );
    relCount = relResult[0]?.count?.toNumber?.() || relResult[0]?.count || 0;
  } catch (error) {
    console.warn(
      "⚠️  Could not get Memgraph stats:",
      error instanceof Error ? error.message : error
    );
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
  } catch (error) {
    console.warn(
      "⚠️  Could not get Qdrant stats:",
      error instanceof Error ? error.message : error
    );
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

async function wipeMongoDB(keepMcpConfig: boolean): Promise<void> {
  console.log("\n🗑️  Wiping MongoDB...");

  // Delete records
  const recordResult = await RecordModel.deleteMany({});
  console.log(`   ✓ Deleted ${recordResult.deletedCount} records`);

  // Delete graph schemas
  const schemaResult = await GraphSchemaModel.deleteMany({});
  console.log(`   ✓ Deleted ${schemaResult.deletedCount} graph schemas`);

  // Optionally delete MCP configs
  if (!keepMcpConfig) {
    const mcpResult = await MCPServerConfigModel.deleteMany({});
    console.log(`   ✓ Deleted ${mcpResult.deletedCount} MCP server configs`);
  } else {
    console.log(`   ⊘ Kept MCP server configs (--keep-mcp-config)`);
  }
}

async function wipeMemgraph(memgraph: any): Promise<void> {
  console.log("\n🗑️  Wiping Memgraph...");

  try {
    // Delete all relationships first
    await memgraph.executeQuery("MATCH ()-[r]->() DELETE r");
    console.log("   ✓ Deleted all relationships");

    // Delete all nodes
    await memgraph.executeQuery("MATCH (n) DELETE n");
    console.log("   ✓ Deleted all nodes");

    // Drop indexes (they will be recreated on next index)
    try {
      await memgraph.executeQuery("DROP INDEX ON :Resource(id)");
      await memgraph.executeQuery("DROP INDEX ON :Resource(type)");
      await memgraph.executeQuery("DROP INDEX ON :Resource(source)");
      console.log("   ✓ Dropped indexes");
    } catch (error) {
      // Indexes might not exist, that's okay
      console.log("   ⊘ No indexes to drop");
    }

    // Drop constraints (they will be recreated on next index)
    try {
      await memgraph.executeQuery(
        "DROP CONSTRAINT ON (n:Resource) ASSERT n.id IS UNIQUE"
      );
      console.log("   ✓ Dropped constraints");
    } catch (error) {
      // Constraints might not exist, that's okay
      console.log("   ⊘ No constraints to drop");
    }
  } catch (error) {
    console.error("   ❌ Error wiping Memgraph:", error);
    throw error;
  }
}

async function wipeQdrant(qdrant: any): Promise<void> {
  console.log("\n🗑️  Wiping Qdrant...");

  try {
    const collections = await qdrant.client.getCollections();

    if (!collections.collections || collections.collections.length === 0) {
      console.log("   ⊘ No collections to delete");
    } else {
      for (const collection of collections.collections) {
        await qdrant.client.deleteCollection(collection.name);
        console.log(`   ✓ Deleted collection: ${collection.name}`);
      }
    }

    // Clear MongoDB vector timestamps so records will be re-indexed
    console.log("   🔄 Clearing MongoDB vector timestamps...");
    const result = await RecordModel.updateMany(
      {},
      { $unset: { lastEmbedDate: "" } }
    );
    console.log(`   ✓ Cleared timestamps for ${result.modifiedCount} records`);
  } catch (error) {
    console.error("   ❌ Error wiping Qdrant:", error);
    throw error;
  }
}

async function run() {
  const options = parseArgs();

  console.log("🧹 Data Wipe Script");
  console.log("===================\n");

  if (options.only) {
    console.log(`Scope: ${options.only.toUpperCase()} only`);
  } else {
    console.log("Scope: All databases");
  }

  if (options.keepMcpConfig) {
    console.log("Mode: Keep MCP server configs");
  }

  console.log("");

  // Initialize services
  const { memgraph, qdrant, mongoose } = await initializeServices();

  // Get current statistics
  console.log("📊 Current Statistics:");
  console.log("=====================");
  const statsBefore = await getStatistics(memgraph, qdrant);

  console.log("\nMongoDB:");
  console.log(`  Records: ${statsBefore.mongodb.records}`);
  console.log(`  Graph Schemas: ${statsBefore.mongodb.schemas}`);
  console.log(`  MCP Configs: ${statsBefore.mongodb.mcpConfigs}`);

  console.log("\nMemgraph:");
  console.log(`  Nodes: ${statsBefore.memgraph.nodes}`);
  console.log(`  Relationships: ${statsBefore.memgraph.relationships}`);

  console.log("\nQdrant:");
  console.log(`  Collections: ${statsBefore.qdrant.collections}`);
  console.log(`  Vectors: ${statsBefore.qdrant.vectors}`);
  console.log("");

  // Confirm deletion
  const confirmed = await confirmWipe(options);

  if (!confirmed) {
    console.log("\n❌ Wipe cancelled");
    process.exit(0);
  }

  console.log("\n🚀 Starting wipe process...");

  // Perform wipes based on options
  try {
    if (!options.only || options.only === "mongodb") {
      await wipeMongoDB(options.keepMcpConfig);
    }

    if (!options.only || options.only === "memgraph") {
      await wipeMemgraph(memgraph);
    }

    if (!options.only || options.only === "qdrant") {
      await wipeQdrant(qdrant);
    }

    // Get final statistics
    console.log("\n📊 Final Statistics:");
    console.log("===================");
    const statsAfter = await getStatistics(memgraph, qdrant);

    console.log("\nMongoDB:");
    console.log(`  Records: ${statsAfter.mongodb.records}`);
    console.log(`  Graph Schemas: ${statsAfter.mongodb.schemas}`);
    console.log(`  MCP Configs: ${statsAfter.mongodb.mcpConfigs}`);

    console.log("\nMemgraph:");
    console.log(`  Nodes: ${statsAfter.memgraph.nodes}`);
    console.log(`  Relationships: ${statsAfter.memgraph.relationships}`);

    console.log("\nQdrant:");
    console.log(`  Collections: ${statsAfter.qdrant.collections}`);
    console.log(`  Vectors: ${statsAfter.qdrant.vectors}`);

    console.log("\n✨ Wipe completed successfully!");
    console.log("\nNext steps:");
    console.log("  1. Run 'pnpm tsx scripts/sync-records.ts' to sync records");
    console.log("  2. Run 'pnpm tsx scripts/index-graph.ts' to build graph");
    console.log(
      "  3. Run 'pnpm tsx scripts/index-vectors.ts' to build embeddings"
    );
  } catch (error) {
    console.error("\n❌ Error during wipe:", error);
    process.exit(1);
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
