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

  logger.info(`🔮 Indexing entity embeddings for source: ${source}`);

  // Query MongoDB directly for entities that need embedding (MUCH faster than Memgraph!)
  const entityMetadata = await GraphEmbeddingMetadata.find({
    itemType: "entity",
    source: source,
  });

  if (entityMetadata.length === 0) {
    logger.info(`⚠️  No entity metadata found for ${source}`);
    return stats;
  }

  logger.info(`   Found ${entityMetadata.length} entities in MongoDB metadata`);

  // Convert metadata to the format we need
  const globalEntities = entityMetadata.map((meta) => ({
    entityId: meta.entityId!,
    type: meta.entityType!,
    documentIds: meta.sourceDocumentIds,
  }));

  logger.info(`   Found ${globalEntities.length} global entities to process`);

  // Filter entities that need embedding
  const entitiesToEmbed: typeof globalEntities = [];

  for (const entity of globalEntities) {
    const entityText = await getEntityEmbeddingText(
      entity.entityId,
      entity.type,
      deps.recordStore
    );
    const contentChecksum = computeChecksum(entityText);

    const needsEmbedding = await shouldReembedEntity(
      entity.entityId,
      contentChecksum,
      entity.documentIds[0]
    );

    if (needsEmbedding) {
      entitiesToEmbed.push(entity);
    } else {
      stats.skipped++;
    }
  }

  if (entitiesToEmbed.length === 0) {
    logger.info(`✅ All ${stats.skipped} entity embeddings are up to date`);
    return stats;
  }

  logger.info(
    `   Embedding ${entitiesToEmbed.length} entities (${stats.skipped} skipped)`
  );

  // Get node degrees for all entities
  const nodeIds = entitiesToEmbed.map((e) => e.entityId);
  const degreeCounts = await deps.graphStore.getNodeRelationshipCounts(nodeIds);

  // Process in batches
  for (let i = 0; i < entitiesToEmbed.length; i += BATCH_SIZE) {
    const batch = entitiesToEmbed.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(entitiesToEmbed.length / BATCH_SIZE);

    logger.info(
      `   Batch ${batchNum}/${totalBatches}: Processing ${batch.length} entities...`
    );

    try {
      // Create entity texts for embedding
      const entityTexts = await Promise.all(
        batch.map((entity) =>
          getEntityEmbeddingText(entity.entityId, entity.type, deps.recordStore)
        )
      );

      // Generate embeddings
      const embeddings = await embed(entityTexts);

      // Create vector points
      const points = batch.map((entity, index) => ({
        id: `entity_${entity.entityId}`,
        vector: embeddings[index],
        payload: {
          type: "entity" as const,
          entityId: entity.entityId,
          entityType: entity.type,
          source: source,
          degree: degreeCounts.get(entity.entityId) || 0,
          checksum: computeChecksum(entityTexts[index]),
        } as EntityVectorPayload,
      }));

      // Upsert to Qdrant
      await deps.vectorStore.upsertPoints(points);
      stats.indexed += points.length;

      // Update or create GraphEmbeddingMetadata
      for (let j = 0; j < batch.length; j++) {
        const entity = batch[j];
        const embeddedChecksum = computeChecksum(entityTexts[j]);

        await GraphEmbeddingMetadata.findOneAndUpdate(
          { _id: entity.entityId },
          {
            $set: {
              itemType: "entity",
              entityId: entity.entityId,
              entityType: entity.type,
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

  logger.info(
    `✅ Indexed ${stats.indexed} entity embeddings (${stats.skipped} skipped, ${stats.errors} errors)`
  );
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

  logger.info(`🔮 Indexing relationship embeddings for source: ${source}`);

  // Query MongoDB directly for relationships that need embedding (MUCH faster than Memgraph!)
  const relMetadata = await GraphEmbeddingMetadata.find({
    itemType: "relationship",
    source: source,
  });

  if (relMetadata.length === 0) {
    logger.info(`⚠️  No relationship metadata found for ${source}`);
    return stats;
  }

  logger.info(
    `   Found ${relMetadata.length} relationships in MongoDB metadata`
  );

  // Convert metadata to the format we need
  const relationships = relMetadata.map((meta) => ({
    sourceId: meta.sourceId!,
    targetId: meta.targetId!,
    type: meta.relType!,
    confidence: 1.0, // Default confidence
  }));

  logger.info(`   Found ${relationships.length} relationships to process`);

  // Filter relationships that need embedding
  const relsToEmbed: typeof relationships = [];

  for (const rel of relationships) {
    const relId = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;
    const relText = await getRelationshipEmbeddingText(rel, deps.recordStore);
    const checksum = computeChecksum(relText);

    const needsEmbedding = await shouldReembedRelationship(relId, checksum);

    if (needsEmbedding) {
      relsToEmbed.push(rel);
    } else {
      stats.skipped++;
    }
  }

  if (relsToEmbed.length === 0) {
    logger.info(
      `✅ All ${stats.skipped} relationship embeddings are up to date`
    );
    return stats;
  }

  logger.info(
    `   Embedding ${relsToEmbed.length} relationships (${stats.skipped} skipped)`
  );

  // Process in batches
  for (let i = 0; i < relsToEmbed.length; i += BATCH_SIZE) {
    const batch = relsToEmbed.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(relsToEmbed.length / BATCH_SIZE);

    logger.info(
      `   Batch ${batchNum}/${totalBatches}: Processing ${batch.length} relationships...`
    );

    try {
      // Create relationship texts for embedding
      const relTexts = await Promise.all(
        batch.map((rel) => getRelationshipEmbeddingText(rel, deps.recordStore))
      );

      // Generate embeddings
      const embeddings = await embed(relTexts);

      // Create vector points
      const points = batch.map((rel, index) => {
        const relId = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;
        return {
          id: relId,
          vector: embeddings[index],
          payload: {
            type: "relationship" as const,
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            relType: rel.type,
            confidence: rel.confidence,
            checksum: computeChecksum(relTexts[index]),
          } as RelationshipVectorPayload,
        };
      });

      // Upsert to Qdrant
      await deps.vectorStore.upsertPoints(points);
      stats.indexed += points.length;

      // Update or create GraphEmbeddingMetadata
      for (let j = 0; j < batch.length; j++) {
        const rel = batch[j];
        const relId = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;
        const embeddedChecksum = computeChecksum(relTexts[j]);

        await GraphEmbeddingMetadata.findOneAndUpdate(
          { _id: relId },
          {
            $set: {
              itemType: "relationship",
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              relType: rel.type,
              embeddedChecksum: embeddedChecksum,
              embeddedAt: new Date(),
              embeddingModelVersion: env.LLM_EMBEDDING_MODEL,
              lastUpdatedBy: source,
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

  logger.info(
    `✅ Indexed ${stats.indexed} relationship embeddings (${stats.skipped} skipped, ${stats.errors} errors)`
  );
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
        // Delete from Qdrant using entity point ID format
        const qdrantPointId = `entity_${metadata._id}`;
        await deps.vectorStore.deleteByIds([qdrantPointId]);

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
        // Delete from Qdrant using relationship point ID (which is the _id)
        await deps.vectorStore.deleteByIds([metadata._id]);

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
