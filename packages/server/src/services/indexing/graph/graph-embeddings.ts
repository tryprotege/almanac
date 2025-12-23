import { randomUUID } from "crypto";
import { embed } from "../../../utils/embedding.js";
import { VectorStore } from "../../../stores/vector.store.js";
import { RecordStore } from "../../../stores/record.store.js";
import { GraphStore } from "../../../stores/graph.store.js";
import {
  SourceType,
  EntityVectorPayload,
  RelationshipVectorPayload,
} from "../../../types/index.js";
import { GraphEmbeddingMetadata } from "../../../models/graph-embedding-metadata.model.js";
import { computeChecksum } from "../../../utils/checksum.js";
import {
  getEntityEmbeddingText,
  getRelationshipEmbeddingText,
  shouldReembedEntity,
  shouldReembedRelationship,
} from "./entity-conflict-resolution.js";
import { env } from "../../../env.js";
import logger from "../../../utils/logger.js";

// ============================================
// Entity Embedding Functions (Global)
// ============================================

/**
 * Index all entity embeddings for a source
 * Uses GraphEmbeddingMetadata for efficient tracking at global entity level
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
  const BATCH_SIZE = 500;

  logger.info({ msg: `🔮 Indexing entity embeddings`, source });

  // Query MongoDB directly for entities that need embedding (MUCH faster than Memgraph!)
  const entityMetadata = await GraphEmbeddingMetadata.find({
    itemType: "entity",
    source: source,
  });

  if (entityMetadata.length === 0) {
    logger.info({ msg: `⚠️  No entity metadata found for ${source}` });
    return stats;
  }

  // Convert metadata to the format we need
  // Use the first MongoDB document ID as the primary entity ID
  const globalEntities = entityMetadata.map((meta) => ({
    memgraphEntityId: meta.entityId!, // Keep for graph operations
    mongoId: meta.sourceDocumentIds[0], // Use first MongoDB ID as primary
    type: meta.entityType!,
    documentIds: meta.sourceDocumentIds,
  }));

  // Filter entities that need embedding
  const entitiesToEmbed: typeof globalEntities = [];

  for (const entity of globalEntities) {
    const entityText = await getEntityEmbeddingText(
      entity.memgraphEntityId,
      entity.type,
      deps.recordStore
    );
    const contentChecksum = computeChecksum(entityText);

    const needsEmbedding = await shouldReembedEntity(
      entity.mongoId, // Use MongoDB ID for tracking
      contentChecksum,
      entity.mongoId
    );

    if (needsEmbedding) {
      entitiesToEmbed.push(entity);
    } else {
      stats.skipped++;
    }
  }

  if (entitiesToEmbed.length === 0) {
    return stats;
  }

  // Get node degrees for all entities using Memgraph IDs
  const nodeIds = entitiesToEmbed.map((e) => e.memgraphEntityId);
  const degreeCounts = await deps.graphStore.getNodeRelationshipCounts(nodeIds);

  // Process in batches
  for (let i = 0; i < entitiesToEmbed.length; i += BATCH_SIZE) {
    const batch = entitiesToEmbed.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(entitiesToEmbed.length / BATCH_SIZE);

    logger.debug({
      msg: `Batch ${batchNum}/${totalBatches}: Processing ${batch.length} entities...`,
    });

    try {
      // Create entity texts for embedding using Memgraph IDs
      const entityTexts = await Promise.all(
        batch.map((entity) =>
          getEntityEmbeddingText(
            entity.memgraphEntityId,
            entity.type,
            deps.recordStore
          )
        )
      );

      // Generate embeddings
      const embeddings = await embed(entityTexts);

      // Get or create qdrantIds for each entity using MongoDB ID
      const metadataRecords = await Promise.all(
        batch.map((entity) => GraphEmbeddingMetadata.findById(entity.mongoId))
      );

      // Create vector points with UUIDs
      const points = batch.map((entity, index) => {
        const existingQdrantId = metadataRecords[index]?.qdrantId;
        const qdrantId = existingQdrantId || randomUUID();

        return {
          id: qdrantId,
          vector: embeddings[index],
          payload: {
            type: "entity" as const,
            entityId: entity.memgraphEntityId, // Store MongoDB ID for direct lookup
            entityType: entity.type,
            mongoId: entity.mongoId,
            source: source,
            degree: degreeCounts.get(entity.memgraphEntityId) || 0,
            checksum: computeChecksum(entityTexts[index]),
          } as EntityVectorPayload,
        };
      });

      // Upsert to Qdrant
      await deps.vectorStore.upsertPoints(points);
      stats.indexed += points.length;

      // Update or create GraphEmbeddingMetadata using memgraphEntityId as _id
      for (let j = 0; j < batch.length; j++) {
        const entity = batch[j];
        const embeddedChecksum = computeChecksum(entityTexts[j]);
        const qdrantId = points[j].id;

        await GraphEmbeddingMetadata.findOneAndUpdate(
          { _id: entity.memgraphEntityId }, // Use memgraphEntityIdas the primary key
          {
            $set: {
              itemType: "entity",
              entityId: entity.memgraphEntityId, // Keep Memgraph ID for reference
              entityType: entity.type,
              qdrantId: qdrantId,
              embeddedChecksum: embeddedChecksum,
              embeddedAt: new Date(),
              embeddingModelVersion: env.LLM_EMBEDDING_MODEL,
              lastUpdatedBy: entity.documentIds[entity.documentIds.length - 1],
            },
            $addToSet: {
              sourceDocumentIds: { $each: entity.documentIds },
            },
          },
          { upsert: true }
        );
      }
    } catch (err) {
      logger.error({ err, batchNum }, `Error in batch ${batchNum}`);
      stats.errors += batch.length;
    }
  }

  logger.info({
    msg: `✅ Entity embeddings Completed`,
    skipped: stats.skipped,
    errors: stats.errors,
    indexed: stats.indexed,
  });
  return stats;
}

// ============================================
// Relationship Embedding Functions (Global)
// ============================================

/**
 * Index all relationship embeddings for a source
 * Uses GraphEmbeddingMetadata for efficient tracking at global relationship level
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
  const BATCH_SIZE = 500;

  logger.info({ msg: `🔮 Indexing relationship embeddings`, source });

  // Query MongoDB directly for relationships that need embedding (MUCH faster than Memgraph!)
  const relMetadata = await GraphEmbeddingMetadata.find({
    itemType: "relationship",
    source: source,
  });

  if (relMetadata.length === 0) {
    return stats;
  }

  logger.debug({
    msg: `Found ${relMetadata.length} relationships in MongoDB metadata`,
  });

  // Map Memgraph entity IDs to MongoDB document IDs
  // Get all unique entity IDs from relationships
  const uniqueEntityIds = new Set<string>();
  relMetadata.forEach((meta) => {
    if (meta.sourceId) uniqueEntityIds.add(meta.sourceId);
    if (meta.targetId) uniqueEntityIds.add(meta.targetId);
  });

  // Look up MongoDB IDs for these entity IDs
  const entityMetadata = await GraphEmbeddingMetadata.find({
    itemType: "entity",
    entityId: { $in: Array.from(uniqueEntityIds) },
  });

  // Create mapping from Memgraph entity ID to MongoDB document ID
  const entityIdToMongoId = new Map<string, string>();
  entityMetadata.forEach((meta) => {
    if (meta.entityId && meta.sourceDocumentIds.length > 0) {
      entityIdToMongoId.set(meta.entityId, meta.sourceDocumentIds[0]);
    }
  });

  // Convert metadata to the format we need with MongoDB IDs
  const relationships = relMetadata
    .map((meta) => {
      const sourceMongoId = entityIdToMongoId.get(meta.sourceId!);
      const targetMongoId = entityIdToMongoId.get(meta.targetId!);

      // Skip relationships where we can't map to MongoDB IDs
      if (!sourceMongoId || !targetMongoId) {
        logger.warn(
          `Skipping relationship ${meta.sourceId} -> ${meta.targetId}: Cannot map to MongoDB IDs`
        );
        return null;
      }

      return {
        memgraphSourceId: meta.sourceId!,
        memgraphTargetId: meta.targetId!,
        sourceId: sourceMongoId,
        targetId: targetMongoId,
        type: meta.relType!,
        confidence: 1.0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  logger.debug({
    msg: `Found ${relationships.length} relationships to process`,
  });

  // Filter relationships that need embedding
  const relsToEmbed: typeof relationships = [];

  for (const rel of relationships) {
    const relId = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;
    // Use Memgraph IDs for getting the embedding text
    const relForText = {
      sourceId: rel.memgraphSourceId,
      targetId: rel.memgraphTargetId,
      type: rel.type,
      confidence: rel.confidence,
    };
    const relText = await getRelationshipEmbeddingText(
      relForText,
      deps.recordStore
    );
    const checksum = computeChecksum(relText);

    const needsEmbedding = await shouldReembedRelationship(relId, checksum);

    if (needsEmbedding) {
      relsToEmbed.push(rel);
    } else {
      stats.skipped++;
    }
  }

  if (relsToEmbed.length === 0) {
    return stats;
  }

  logger.debug({
    msg: `Embedding ${relsToEmbed.length} relationships (${stats.skipped} skipped)`,
  });

  // Process in batches
  for (let i = 0; i < relsToEmbed.length; i += BATCH_SIZE) {
    const batch = relsToEmbed.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(relsToEmbed.length / BATCH_SIZE);

    logger.debug({
      msg: `Batch ${batchNum}/${totalBatches}: Processing ${batch.length} relationships...`,
    });

    try {
      // Create relationship texts for embedding using Memgraph IDs
      const relTexts = await Promise.all(
        batch.map((rel) => {
          const relForText = {
            sourceId: rel.memgraphSourceId,
            targetId: rel.memgraphTargetId,
            type: rel.type,
            confidence: rel.confidence,
          };
          return getRelationshipEmbeddingText(relForText, deps.recordStore);
        })
      );

      // Generate embeddings
      const embeddings = await embed(relTexts);

      // Get or create qdrantIds for each relationship using MongoDB IDs
      const relIds = batch.map(
        (rel) => `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`
      );
      const metadataRecords = await Promise.all(
        relIds.map((relId) => GraphEmbeddingMetadata.findById(relId))
      );

      // Create vector points with UUIDs
      const points = batch.map((rel, index) => {
        const existingQdrantId = metadataRecords[index]?.qdrantId;
        const qdrantId = existingQdrantId || randomUUID();

        return {
          id: qdrantId,
          vector: embeddings[index],
          payload: {
            type: "relationship" as const,
            sourceId: rel.sourceId, // MongoDB ID
            targetId: rel.targetId, // MongoDB ID
            relType: rel.type,
            confidence: rel.confidence,
            checksum: computeChecksum(relTexts[index]),
          } as RelationshipVectorPayload,
        };
      });

      // Upsert to Qdrant
      await deps.vectorStore.upsertPoints(points);
      stats.indexed += points.length;

      // Update or create GraphEmbeddingMetadata using MongoDB IDs
      for (let j = 0; j < batch.length; j++) {
        const rel = batch[j];
        const relId = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;
        const embeddedChecksum = computeChecksum(relTexts[j]);
        const qdrantId = points[j].id;

        await GraphEmbeddingMetadata.findOneAndUpdate(
          { _id: relId },
          {
            $set: {
              itemType: "relationship",
              sourceId: rel.memgraphSourceId, // Store Memgraph ID for reference
              targetId: rel.memgraphTargetId, // Store Memgraph ID for reference
              relType: rel.type,
              qdrantId: qdrantId,
              embeddedChecksum: embeddedChecksum,
              embeddedAt: new Date(),
              embeddingModelVersion: env.LLM_EMBEDDING_MODEL,
              lastUpdatedBy: source,
              source: source,
            },
          },
          { upsert: true }
        );
      }
    } catch (err) {
      logger.error({ err, batchNum }, `Error in batch ${batchNum}`);
      stats.errors += batch.length;
    }
  }

  logger.info({
    msg: `✅ Indexed relationship embeddings`,
    indexed: stats.indexed,
    skipped: stats.skipped,
    errors: stats.errors,
  });
  return stats;
}

// ============================================
// Cleanup Functions
// ============================================
//
// These functions are used programmatically for targeted cleanup operations.
// For comprehensive cleanup of orphaned embeddings, use cleanupOrphanedEmbeddings
// from embedding-cleanup.service.ts, which is integrated into wipe-data.ts.
//
// ============================================

/**
 * Clean up entity embeddings for deleted records
 */
export async function cleanupDeletedEntityEmbeddings(
  source: SourceType,
  deps: {
    vectorStore: VectorStore;
    recordStore: RecordStore;
    graphStore: GraphStore;
  }
): Promise<{ deleted: number }> {
  let deleted = 0;

  // Find all entity embeddings for this source
  const entityMetadata = await GraphEmbeddingMetadata.find({
    itemType: "entity",
    sourceDocumentIds: source,
  });

  for (const metadata of entityMetadata) {
    // Skip if not yet embedded
    if (!metadata.embeddedChecksum) {
      continue;
    }

    // Check if all source documents are deleted
    const records = await deps.recordStore.findByIds(
      metadata.sourceDocumentIds
    );
    const allDeleted = records.every((r) => r.deletedAt);

    if (allDeleted) {
      try {
        // Delete from Qdrant using the stored qdrantId
        if (metadata.qdrantId) {
          await deps.vectorStore.deleteByIds([metadata.qdrantId]);
        }

        // Delete metadata
        await GraphEmbeddingMetadata.deleteOne({ _id: metadata._id });

        deleted++;
      } catch (err) {
        logger.error(
          { err, entityId: metadata._id },
          `Error deleting entity embedding ${metadata._id}`
        );
      }
    }
  }

  return { deleted };
}

/**
 * Clean up relationship embeddings for deleted records
 */
export async function cleanupDeletedRelationshipEmbeddings(
  source: SourceType,
  deps: {
    vectorStore: VectorStore;
    recordStore: RecordStore;
    graphStore: GraphStore;
  }
): Promise<{ deleted: number }> {
  let deleted = 0;

  // Find all relationship embeddings for this source
  const relMetadata = await GraphEmbeddingMetadata.find({
    itemType: "relationship",
    sourceDocumentIds: source,
  });

  for (const metadata of relMetadata) {
    // Skip if not yet embedded
    if (!metadata.embeddedChecksum) {
      continue;
    }

    // For relationships, check if the relationship still exists in Memgraph
    if (!metadata.sourceId || !metadata.targetId || !metadata.relType) {
      continue;
    }

    const exists = await deps.graphStore.relationshipExists(
      metadata.sourceId,
      metadata.relType,
      metadata.targetId
    );

    if (!exists) {
      try {
        // Delete from Qdrant using the stored qdrantId
        if (metadata.qdrantId) {
          await deps.vectorStore.deleteByIds([metadata.qdrantId]);
        }

        // Delete metadata
        await GraphEmbeddingMetadata.deleteOne({ _id: metadata._id });

        deleted++;
      } catch (err) {
        logger.error(
          { err, relId: metadata._id },
          `Error deleting relationship embedding ${metadata._id}`
        );
      }
    }
  }

  return { deleted };
}
