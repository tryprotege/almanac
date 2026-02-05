import { embed } from '../../../utils/embedding.js';
import { VectorStore } from '../../../stores/vector.store.js';
import { RecordStore } from '../../../stores/record.store.js';
import { GraphStore } from '../../../stores/graph.store.js';
import {
  SourceType,
  EntityVectorPayload,
  RelationshipVectorPayload,
} from '../../../types/index.js';
import { GraphEmbeddingMetadata } from '../../../models/graph-embedding-metadata.model.js';
import { computeChecksum } from '../../../utils/checksum.js';
import {
  getEntityEmbeddingText,
  getRelationshipEmbeddingText,
} from './entity-conflict-resolution.js';
import { env } from '../../../env.js';
import logger from '../../../utils/logger.js';

// ============================================
// UNIVERSAL UUID SYSTEM DOCUMENTATION
// ============================================
//
// This file uses a universal UUID system where the same UUID is used across:
// - MongoDB _id (GraphEmbeddingMetadata document ID)
// - Memgraph node/relationship ID
// - Qdrant vector point ID
//
// Benefits:
// - Simplified ID management - one ID to rule them all
// - No need for ID mapping between systems
// - Deterministic UUIDs for entities and relationships enable idempotent operations
//
// UUID Generation:
// - Entities: Deterministic UUID based on SHA-256 hash of entityType:normalizedName
// - Relationships: Deterministic UUID based on SHA-256 hash of sourceId:type:targetId
// - This ensures the same entity/relationship always gets the same UUID
//
// ============================================

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
  },
): Promise<{ indexed: number; errors: number; skipped: number }> {
  const stats = { indexed: 0, errors: 0, skipped: 0 };
  const BATCH_SIZE = 500;

  logger.info({ msg: `🔮 Indexing entity embeddings`, source });

  // Query MongoDB directly for entities that need embedding (MUCH faster than Memgraph!)
  const entityMetadata = await GraphEmbeddingMetadata.find({
    itemType: 'entity',
    'sources.0': source, // the 1st source is the primary one
  });

  if (entityMetadata.length === 0) {
    logger.info({ msg: `⚠️  No entity metadata found for ${source}` });
    return stats;
  }

  // Filter entities that need embedding
  const entitiesToEmbed: typeof entityMetadata = [];

  for (const entity of entityMetadata) {
    // Check if entity needs embedding by comparing checksums
    const entityText = getEntityEmbeddingText(entity);
    const currentChecksum = computeChecksum(entityText);
    const needsEmbedding = !entity.embeddedChecksum || entity.embeddedChecksum !== currentChecksum;

    if (needsEmbedding) {
      entitiesToEmbed.push(entity);
    } else {
      stats.skipped++;
    }
  }

  if (entitiesToEmbed.length === 0) {
    return stats;
  }

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
      const entityTexts = batch.map((entity) => getEntityEmbeddingText(entity));

      // Generate embeddings
      const embeddings = await embed(entityTexts);

      // Create vector points using _id as the Qdrant point ID (universal UUID)
      const points = batch.map((entity, index) => {
        return {
          id: entity._id.toString(), // Use MongoDB _id directly as Qdrant point ID
          vector: embeddings[index],
          payload: {
            type: 'entity' as const,
            entityId: entity._id.toString(),
            source: source,
            checksum: computeChecksum(entityTexts[index]),
          } satisfies EntityVectorPayload,
        };
      });

      // Upsert to Qdrant
      await deps.vectorStore.upsertPoints(points);
      stats.indexed += points.length;

      // Update GraphEmbeddingMetadata with embedding info
      for (let j = 0; j < batch.length; j++) {
        const entity = batch[j];
        const embeddedChecksum = computeChecksum(entityTexts[j]);

        await GraphEmbeddingMetadata.updateOne(
          { _id: entity._id },
          {
            $set: {
              itemType: 'entity',
              embeddedChecksum: embeddedChecksum,
              embeddedAt: new Date(),
              embeddingModelVersion: env.LLM_EMBEDDING_MODEL,
            },
          },
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
  },
): Promise<{ indexed: number; errors: number; skipped: number }> {
  const stats = { indexed: 0, errors: 0, skipped: 0 };
  const BATCH_SIZE = 500;

  logger.info({ msg: `🔮 Indexing relationship embeddings`, source });

  // Query MongoDB directly for relationships that need embedding (MUCH faster than Memgraph!)
  const relMetadata = await GraphEmbeddingMetadata.find({
    itemType: 'relationship',
    'sources.0': source, // the 1st source is the primary one
  }).lean();

  if (relMetadata.length === 0) {
    return stats;
  }

  logger.debug({
    msg: `Found ${relMetadata.length} relationships in MongoDB metadata`,
  });

  // With universal UUID system, sourceId and targetId ARE the GraphEmbeddingMetadata document IDs
  // No mapping needed!
  const relationships = relMetadata
    .map((meta) => {
      // Skip relationships with missing entity IDs
      if (!meta.sourceId || !meta.targetId) {
        logger.warn({
          relationshipId: meta._id?.toString(),
          msg: 'Skipping relationship: Missing sourceId or targetId',
        });
        return null;
      }

      return {
        ...meta,
        sourceEntityId: meta.sourceId,
        targetEntityId: meta.targetId,
        confidence: 1.0, // TODO: is it ok to hardcode?
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  logger.debug({
    msg: `Found ${relationships.length} relationships to process`,
  });

  // Filter relationships that need embedding
  const relsToEmbed: typeof relationships = [];

  for (const rel of relationships) {
    // Check if relationship needs embedding by comparing checksums
    const relText = await getRelationshipEmbeddingText({
      relMetadata: rel,
      sourceEntityId: rel.sourceEntityId!,
      targetEntityId: rel.targetEntityId!,
      type: rel.relType!,
    });
    const currentChecksum = computeChecksum(relText);
    const needsEmbedding = !rel.embeddedChecksum || rel.embeddedChecksum !== currentChecksum;

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
      // Create relationship texts for embedding
      const relTexts = await Promise.all(
        batch.map((rel) => {
          return getRelationshipEmbeddingText({
            relMetadata: rel,
            sourceEntityId: rel.sourceEntityId!,
            targetEntityId: rel.targetEntityId!,
            type: rel.relType!,
          });
        }),
      );

      // Generate embeddings
      const embeddings = await embed(relTexts);

      // Create vector points using _id as the Qdrant point ID (universal UUID)
      const points = batch.map((rel, index) => {
        return {
          id: rel._id.toString(), // Use MongoDB _id directly as Qdrant point ID
          vector: embeddings[index],
          payload: {
            type: 'relationship',
            sourceEntityId: rel.sourceEntityId!,
            targetEntityId: rel.targetEntityId!,
            relType: rel.relType!,
            confidence: rel.confidence,
            checksum: computeChecksum(relTexts[index]),
          } satisfies RelationshipVectorPayload,
        };
      });

      // Upsert to Qdrant
      await deps.vectorStore.upsertPoints(points);
      stats.indexed += points.length;

      // Update GraphEmbeddingMetadata with embedding info
      for (let j = 0; j < batch.length; j++) {
        const rel = batch[j];
        const embeddedChecksum = computeChecksum(relTexts[j]);

        await GraphEmbeddingMetadata.updateOne(
          { _id: rel._id },
          {
            $set: {
              itemType: 'relationship',
              embeddedChecksum: embeddedChecksum,
              embeddedAt: new Date(),
              embeddingModelVersion: env.LLM_EMBEDDING_MODEL,
            },
          },
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
  },
): Promise<{ deleted: number }> {
  let deleted = 0;

  // Find all entity embeddings for this source
  const entityMetadata = await GraphEmbeddingMetadata.find({
    itemType: 'entity',
    sourceRecordIds: source,
  });

  for (const metadata of entityMetadata) {
    // Skip if not yet embedded
    if (!metadata.embeddedChecksum) {
      continue;
    }

    // Check if all source documents are deleted
    const records = await deps.recordStore.findByIds(metadata.sourceRecordIds);
    const allDeleted = records.every((r) => r.deletedAt);

    if (allDeleted) {
      try {
        // Delete from Qdrant using the _id (universal UUID)
        await deps.vectorStore.deleteByIds([metadata._id.toString()]);

        // Delete metadata
        await GraphEmbeddingMetadata.deleteOne({ _id: metadata._id });

        deleted++;
      } catch (err) {
        logger.error(
          { err, entityId: metadata._id },
          `Error deleting entity embedding ${metadata._id}`,
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
  },
): Promise<{ deleted: number }> {
  let deleted = 0;

  // Find all relationship embeddings for this source
  const relMetadata = await GraphEmbeddingMetadata.find({
    itemType: 'relationship',
    sourceRecordIds: source,
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
      metadata.targetId,
    );

    if (!exists) {
      try {
        // Delete from Qdrant using the _id (universal UUID)
        await deps.vectorStore.deleteByIds([metadata._id.toString()]);

        // Delete metadata
        await GraphEmbeddingMetadata.deleteOne({ _id: metadata._id });

        deleted++;
      } catch (err) {
        logger.error(
          { err, relId: metadata._id },
          `Error deleting relationship embedding ${metadata._id}`,
        );
      }
    }
  }

  return { deleted };
}
