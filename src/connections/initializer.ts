/**
 * Database Schema Initializer
 * Ensures all required collections, indexes, and constraints exist on startup
 */

import { MONGODB_SCHEMAS } from "./mongoose.js";
import { QDRANT_SCHEMAS } from "./qdrant.js";
import { MEMGRAPH_SCHEMAS } from "./memgraph.js";
import { env } from "../env.js";
import type { ServiceConnections } from "../mcp/initialization.js";

export interface SchemaInitReport {
  mongodb: {
    collectionsCreated: string[];
    indexesCreated: string[];
    errors: string[];
  };
  qdrant: {
    collectionsCreated: string[];
    errors: string[];
  };
  memgraph: {
    constraintsCreated: string[];
    indexesCreated: string[];
    errors: string[];
  };
  redis: {
    connected: boolean;
    errors: string[];
  };
}

export class SchemaInitializer {
  constructor(private services: ServiceConnections) {}

  async initializeAll(): Promise<SchemaInitReport> {
    console.error("🔧 Initializing database schemas...");

    const report: SchemaInitReport = {
      mongodb: { collectionsCreated: [], indexesCreated: [], errors: [] },
      qdrant: { collectionsCreated: [], errors: [] },
      memgraph: { constraintsCreated: [], indexesCreated: [], errors: [] },
      redis: { connected: false, errors: [] },
    };

    // Run initializations
    await this.initializeMongoDB(report.mongodb);
    await this.initializeQdrant(report.qdrant);
    await this.initializeMemgraph(report.memgraph);
    await this.initializeRedis(report.redis);

    this.printReport(report);

    return report;
  }

  private async initializeMongoDB(
    report: SchemaInitReport["mongodb"]
  ): Promise<void> {
    const db = this.services.mongoose.connection.connection.db;

    if (!db) {
      report.errors.push("MongoDB: Database connection not initialized");
      return;
    }

    try {
      // Get existing collections
      const existingCollections = await db.listCollections().toArray();
      const existingNames = new Set(
        existingCollections.map((c: any) => c.name)
      );

      // Create collections and indexes
      for (const [_key, schema] of Object.entries(MONGODB_SCHEMAS)) {
        const collectionName = schema.collectionName;

        // Create collection if it doesn't exist
        if (!existingNames.has(collectionName)) {
          await db.createCollection(collectionName);
          report.collectionsCreated.push(collectionName);
        }

        // Ensure indexes
        const collection = db.collection(collectionName);
        const existingIndexes = await collection.indexes();
        const existingIndexNames = new Set(
          existingIndexes.map((i: any) => i.name)
        );

        for (const indexSpec of schema.indexes) {
          // Generate index name
          const indexName = Object.keys(indexSpec.key)
            .map((k) => `${k}_${(indexSpec.key as any)[k]}`)
            .join("_");

          // Create index if it doesn't exist
          if (!existingIndexNames.has(indexName)) {
            await collection.createIndex(indexSpec.key, {
              unique: (indexSpec as any).unique,
              name: indexName,
            });
            report.indexesCreated.push(`${collectionName}.${indexName}`);
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      report.errors.push(`MongoDB: ${errorMsg}`);
    }
  }

  private async initializeQdrant(
    report: SchemaInitReport["qdrant"]
  ): Promise<void> {
    try {
      const dimensions = env.EMBEDDING_DIMENSIONS;
      const model = env.LLM_EMBEDDING_MODEL;
      const collectionName = QDRANT_SCHEMAS.getCollectionName(
        model,
        dimensions
      );

      // Check if collection exists
      const collections = await this.services.qdrant.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === collectionName
      );

      if (!exists) {
        // Create collection
        await this.services.qdrant.client.createCollection(collectionName, {
          vectors: {
            size: dimensions,
            distance: QDRANT_SCHEMAS.defaultConfig.distance,
          },
          on_disk_payload: QDRANT_SCHEMAS.defaultConfig.onDiskPayload,
        });

        report.collectionsCreated.push(collectionName);

        // Save metadata to MongoDB
        await this.saveEmbeddingMetadata(collectionName, model, dimensions);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      report.errors.push(`Qdrant: ${errorMsg}`);
    }
  }

  private async initializeMemgraph(
    report: SchemaInitReport["memgraph"]
  ): Promise<void> {
    try {
      const session = this.services.memgraph.getSession();

      try {
        // Create constraints
        for (const constraint of MEMGRAPH_SCHEMAS.constraints) {
          try {
            await session.run(constraint);
            report.constraintsCreated.push(constraint);
          } catch (error) {
            // Constraint might already exist, which is fine
            if (
              error instanceof Error &&
              !error.message.includes("already exists")
            ) {
              throw error;
            }
          }
        }

        // Create indexes
        for (const index of MEMGRAPH_SCHEMAS.indexes) {
          try {
            await session.run(index);
            report.indexesCreated.push(index);
          } catch (error) {
            // Index might already exist, which is fine
            if (
              error instanceof Error &&
              !error.message.includes("already exists")
            ) {
              throw error;
            }
          }
        }
      } finally {
        await session.close();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      report.errors.push(`Memgraph: ${errorMsg}`);
    }
  }

  private async initializeRedis(
    report: SchemaInitReport["redis"]
  ): Promise<void> {
    try {
      // Redis doesn't require schema initialization, just check connection
      const ping = await this.services.redis.client.ping();
      report.connected = ping === "PONG";
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      report.errors.push(`Redis: ${errorMsg}`);
    }
  }

  private async saveEmbeddingMetadata(
    collectionName: string,
    model: string,
    dimensions: number
  ): Promise<void> {
    const db = this.services.mongoose.connection.connection.db;

    if (!db) {
      throw new Error("MongoDB: Database connection not initialized");
    }

    const collection = db.collection("embedding_metadata");

    await collection.updateOne(
      { _id: collectionName as any },
      {
        $set: {
          _id: collectionName,
          model,
          dimensions,
          active: true,
          createdAt: new Date(),
          config: QDRANT_SCHEMAS.defaultConfig,
        },
      },
      { upsert: true }
    );

    // Mark other collections as inactive
    await collection.updateMany(
      { _id: { $ne: collectionName as any } },
      { $set: { active: false } }
    );
  }

  private printReport(report: SchemaInitReport): void {
    console.error("\n📊 Schema Initialization Report:");

    // MongoDB
    if (report.mongodb.collectionsCreated.length > 0) {
      console.error(
        `  MongoDB: Created ${report.mongodb.collectionsCreated.length} collection(s)`
      );
      report.mongodb.collectionsCreated.forEach((c) =>
        console.error(`    ✓ ${c}`)
      );
    }
    if (report.mongodb.indexesCreated.length > 0) {
      console.error(
        `  MongoDB: Created ${report.mongodb.indexesCreated.length} index(es)`
      );
    }
    if (report.mongodb.errors.length > 0) {
      report.mongodb.errors.forEach((e) => console.error(`    ✗ ${e}`));
    }

    // Qdrant
    if (report.qdrant.collectionsCreated.length > 0) {
      console.error(
        `  Qdrant: Created ${report.qdrant.collectionsCreated.length} collection(s)`
      );
      report.qdrant.collectionsCreated.forEach((c) =>
        console.error(`    ✓ ${c}`)
      );
    }
    if (report.qdrant.errors.length > 0) {
      report.qdrant.errors.forEach((e) => console.error(`    ✗ ${e}`));
    }

    // Memgraph
    if (report.memgraph.constraintsCreated.length > 0) {
      console.error(
        `  Memgraph: Created ${report.memgraph.constraintsCreated.length} constraint(s)`
      );
    }
    if (report.memgraph.indexesCreated.length > 0) {
      console.error(
        `  Memgraph: Created ${report.memgraph.indexesCreated.length} index(es)`
      );
    }
    if (report.memgraph.errors.length > 0) {
      report.memgraph.errors.forEach((e) => console.error(`    ✗ ${e}`));
    }

    // Redis
    if (report.redis.connected) {
      console.error(`  Redis: Connected ✓`);
    }
    if (report.redis.errors.length > 0) {
      report.redis.errors.forEach((e) => console.error(`    ✗ ${e}`));
    }

    console.error("✅ Schema initialization complete\n");
  }
}
