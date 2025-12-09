import { embed } from "../../../utils/embedding.js";
import { VectorStore } from "../../../stores/vector.store.js";
import { RecordStore } from "../../../stores/record.store.js";
import { GraphStore } from "../../../stores/graph.store.js";
import {
  SourceType,
  EntityVectorPayload,
  RelationshipVectorPayload,
} from "../../../types/index.js";
import { Record } from "../../../models/record.model.js";
import { computeChecksum } from "../../../utils/checksum.js";

// ============================================
// Entity Embedding Functions
// ============================================

/**
 * Create semantic text representation of an entity for embedding
 */
function createEntityText(record: Record): string {
  const description = record.content.substring(0, 300);
  return `${record.title}\n${record.recordType}\n${description}`;
}

/**
 * Index all entity embeddings for a source (with batching)
 */
export async function indexEntityEmbeddings(
  source: SourceType,
  deps: {
    vectorStore: VectorStore;
    recordStore: RecordStore;
    graphStore: GraphStore;
  }
): Promise<{ indexed: number; errors: number; skipped: number }> {
  const stats = { indexed: 0, errors: 0, skipped: 0 };
  const BATCH_SIZE = 500; // Process 500 entities at a time

  console.log(`🔮 Indexing entity embeddings for source: ${source}`);

  // Fetch all records for source
  const records = await deps.recordStore.findBySourceAndType(source, "", {
    includeDeleted: false,
  });

  if (records.length === 0) {
    console.log(`⚠️  No records found for ${source}`);
    return stats;
  }

  console.log(`   Found ${records.length} entities to process`);

  // Fetch existing embeddings to check checksums
  const existingEmbeddings = new Map<string, string>();
  try {
    const existing = await deps.vectorStore.search([0, 0, 0], {
      limit: records.length,
      filter: {
        must: [
          { key: "type", match: { value: "entity" } },
          { key: "source", match: { value: source } },
        ],
      },
    });
    existing.forEach((e) => {
      if (e.payload.checksum) {
        existingEmbeddings.set(
          e.payload.mongoId as string,
          e.payload.checksum as string
        );
      }
    });
  } catch (err) {
    console.log(`   No existing embeddings found, creating all`);
  }

  // Batch fetch node degrees
  const nodeIds = records.map((r) => r._id);
  const degreeCounts = await deps.graphStore.getNodeRelationshipCounts(nodeIds);

  // Filter records that need embedding (checksum changed)
  const recordsToEmbed = records.filter((record) => {
    const existing = existingEmbeddings.get(record._id);
    const needsUpdate = !existing || existing !== record.checksum;
    if (!needsUpdate) {
      stats.skipped++;
    }
    return needsUpdate;
  });

  if (recordsToEmbed.length === 0) {
    console.log(`✅ All ${stats.skipped} entity embeddings are up to date`);
    return stats;
  }

  console.log(
    `   Embedding ${recordsToEmbed.length} entities (${stats.skipped} skipped)`
  );

  // Process in batches
  for (let i = 0; i < recordsToEmbed.length; i += BATCH_SIZE) {
    const batch = recordsToEmbed.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(recordsToEmbed.length / BATCH_SIZE);

    console.log(
      `   Batch ${batchNum}/${totalBatches}: Processing ${batch.length} entities...`
    );

    try {
      // Create entity text for embedding
      const entityTexts = batch.map((record) => createEntityText(record));

      // Generate embeddings
      const embeddings = await embed(entityTexts);

      // Create vector points
      const points = batch.map((record, index) => ({
        id: `entity_${record._id}`,
        vector: embeddings[index],
        payload: {
          type: "entity" as const,
          mongoId: record._id,
          recordType: record.recordType,
          source: record.source,
          degree: degreeCounts.get(record._id) || 0,
          checksum: record.checksum,
        } as EntityVectorPayload,
      }));

      // Upsert to Qdrant
      await deps.vectorStore.upsertPoints(points);
      stats.indexed += points.length;

      // Update record metadata with embedding timestamp and model version
      for (const record of batch) {
        await deps.recordStore.upsert({
          _id: record._id,
          lastEmbeddedAt: new Date(),
          embeddingModelVersion: process.env.LLM_EMBEDDING_MODEL || "unknown",
        });
      }
    } catch (err) {
      console.error(`   Error in batch ${batchNum}:`, err);
      stats.errors += batch.length;
    }
  }

  console.log(
    `✅ Indexed ${stats.indexed} entity embeddings (${stats.skipped} skipped, ${stats.errors} errors)`
  );
  return stats;
}

// ============================================
// Relationship Embedding Functions
// ============================================

/**
 * Create semantic text representation of a relationship for embedding
 */
function createRelationshipText(
  rel: { sourceId: string; targetId: string; type: string; confidence: number },
  recordMap: Map<string, Record>
): string {
  const source = recordMap.get(rel.sourceId);
  const target = recordMap.get(rel.targetId);

  // Format: "SourceName\tTargetName\nRelationType\nConfidence: X.X"
  return `${source?.title || "Unknown"}\t${target?.title || "Unknown"}\n${
    rel.type
  }\nConfidence: ${rel.confidence.toFixed(2)}`;
}

/**
 * Compute checksum for a relationship
 * Based on: sourceId, targetId, type, confidence
 */
function computeRelationshipChecksum(rel: {
  sourceId: string;
  targetId: string;
  type: string;
  confidence: number;
}): string {
  return computeChecksum({
    sourceId: rel.sourceId,
    targetId: rel.targetId,
    type: rel.type,
    confidence: rel.confidence,
  });
}

/**
 * Index all relationship embeddings for a source (with batching and checksum validation)
 */
export async function indexRelationshipEmbeddings(
  source: SourceType,
  deps: {
    vectorStore: VectorStore;
    graphStore: GraphStore;
    recordStore: RecordStore;
  }
): Promise<{ indexed: number; errors: number; skipped: number }> {
  const stats = { indexed: 0, errors: 0, skipped: 0 };
  const BATCH_SIZE = 500; // Process 500 relationships at a time

  console.log(`🔮 Indexing relationship embeddings for source: ${source}`);

  // Get all relationships from graph
  const relationships = await deps.graphStore.getAllRelationships({ source });

  if (relationships.length === 0) {
    console.log(`⚠️  No relationships found for ${source}`);
    return stats;
  }

  console.log(`   Found ${relationships.length} relationships to process`);

  // Compute checksums for all relationships
  const relChecksums = new Map<string, string>();
  relationships.forEach((rel) => {
    const id = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;
    relChecksums.set(id, computeRelationshipChecksum(rel));
  });

  // Fetch existing embeddings to check checksums
  const existingEmbeddings = new Map<string, string>();
  try {
    const existing = await deps.vectorStore.search([0, 0, 0], {
      limit: relationships.length,
      filter: {
        must: [
          { key: "type", match: { value: "relationship" } },
          {
            key: "sourceId",
            match: { any: relationships.map((r) => r.sourceId) },
          },
        ],
      },
    });
    existing.forEach((e) => {
      if (e.payload.checksum) {
        existingEmbeddings.set(e.id, e.payload.checksum as string);
      }
    });
  } catch (err) {
    console.log(`   No existing relationship embeddings found, creating all`);
  }

  // Filter relationships that need embedding (checksum changed)
  const relsToEmbed = relationships.filter((rel) => {
    const id = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;
    const newChecksum = relChecksums.get(id);
    const existing = existingEmbeddings.get(id);
    const needsUpdate = !existing || existing !== newChecksum;
    if (!needsUpdate) {
      stats.skipped++;
    }
    return needsUpdate;
  });

  if (relsToEmbed.length === 0) {
    console.log(
      `✅ All ${stats.skipped} relationship embeddings are up to date`
    );
    return stats;
  }

  console.log(
    `   Embedding ${relsToEmbed.length} relationships (${stats.skipped} skipped)`
  );

  // Fetch entity details for source/target
  const entityIds = new Set<string>();
  relsToEmbed.forEach((rel) => {
    entityIds.add(rel.sourceId);
    entityIds.add(rel.targetId);
  });

  const records = await deps.recordStore.findByIds(Array.from(entityIds));
  const recordMap = new Map(records.map((r) => [r._id, r]));

  // Process in batches
  for (let i = 0; i < relsToEmbed.length; i += BATCH_SIZE) {
    const batch = relsToEmbed.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(relsToEmbed.length / BATCH_SIZE);

    console.log(
      `   Batch ${batchNum}/${totalBatches}: Processing ${batch.length} relationships...`
    );

    try {
      // Create relationship text for embedding
      const relTexts = batch.map((rel) =>
        createRelationshipText(rel, recordMap)
      );

      // Generate embeddings
      const embeddings = await embed(relTexts);

      // Create vector points
      const points = batch.map((rel, index) => {
        const id = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;
        return {
          id,
          vector: embeddings[index],
          payload: {
            type: "relationship" as const,
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            relType: rel.type,
            confidence: rel.confidence,
            checksum: relChecksums.get(id),
          } as RelationshipVectorPayload,
        };
      });

      // Upsert to Qdrant
      await deps.vectorStore.upsertPoints(points);
      stats.indexed += points.length;
    } catch (err) {
      console.error(`   Error in batch ${batchNum}:`, err);
      stats.errors += batch.length;
    }
  }

  console.log(
    `✅ Indexed ${stats.indexed} relationship embeddings (${stats.skipped} skipped, ${stats.errors} errors)`
  );
  return stats;
}

// ============================================
// Cleanup Functions
// ============================================

/**
 * Clean up entity embeddings for deleted records
 */
export async function cleanupDeletedEntityEmbeddings(
  source: SourceType,
  deps: {
    vectorStore: VectorStore;
    recordStore: RecordStore;
  }
): Promise<{ deleted: number }> {
  console.log(`🧹 Cleaning up deleted entity embeddings for source: ${source}`);

  // Get all active records from MongoDB
  const activeRecords = await deps.recordStore.findBySourceAndType(source, "", {
    includeDeleted: false,
  });

  const activeMongoIds = new Set(activeRecords.map((r) => r._id));

  // Get all entity embeddings for this source from Qdrant
  const allEntities = await deps.vectorStore.search([0, 0, 0], {
    limit: 100000,
    filter: {
      must: [
        { key: "type", match: { value: "entity" } },
        { key: "source", match: { value: source } },
      ],
    },
  });

  // Find embeddings for deleted records
  const deletedMongoIds: string[] = [];
  for (const entity of allEntities) {
    const payload = entity.payload as any;
    if (!activeMongoIds.has(payload.mongoId)) {
      deletedMongoIds.push(payload.mongoId);
    }
  }

  // Delete embeddings for deleted records
  if (deletedMongoIds.length > 0) {
    const deleted = await deps.vectorStore.deleteEntityEmbeddingsBatch(
      deletedMongoIds
    );
    console.log(`   Deleted ${deleted} entity embeddings for deleted records`);
    return { deleted };
  }

  console.log(`   No deleted entity embeddings found`);
  return { deleted: 0 };
}

/**
 * Clean up relationship embeddings for removed relationships
 */
export async function cleanupDeletedRelationshipEmbeddings(
  source: SourceType,
  deps: {
    vectorStore: VectorStore;
    graphStore: GraphStore;
    recordStore: RecordStore;
  }
): Promise<{ deleted: number }> {
  console.log(
    `🧹 Cleaning up deleted relationship embeddings for source: ${source}`
  );

  // Get all active relationships from Memgraph
  const activeRelationships = await deps.graphStore.getAllRelationships({
    source,
  });

  // Build set of valid relationship keys
  const activeRelKeys = new Set(
    activeRelationships.map((r) => `${r.sourceId}_${r.type}_${r.targetId}`)
  );

  // Get all relationship embeddings from Qdrant (filter by source prefix in sourceId)
  const allRelationships = await deps.vectorStore.search([0, 0, 0], {
    limit: 100000,
    filter: {
      must: [{ key: "type", match: { value: "relationship" } }],
    },
  });

  // Filter to only this source and find deleted relationships
  const deletedRelIds: string[] = [];
  for (const rel of allRelationships) {
    const payload = rel.payload as any;
    // Only process relationships for this source
    if (payload.sourceId && payload.sourceId.startsWith(`${source}_`)) {
      const key = `${payload.sourceId}_${payload.relType}_${payload.targetId}`;
      if (!activeRelKeys.has(key)) {
        deletedRelIds.push(rel.id);
      }
    }
  }

  // Delete orphaned relationship embeddings
  if (deletedRelIds.length > 0) {
    await deps.vectorStore.deleteByIds(deletedRelIds);
    console.log(
      `   Deleted ${deletedRelIds.length} relationship embeddings for removed relationships`
    );
    return { deleted: deletedRelIds.length };
  }

  console.log(`   No deleted relationship embeddings found`);
  return { deleted: 0 };
}
