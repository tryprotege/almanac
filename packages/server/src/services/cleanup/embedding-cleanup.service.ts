import { GraphEmbeddingMetadata } from "../../models/graph-embedding-metadata.model.js";
import { GraphStore } from "../../stores/graph.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { SourceType } from "../../types/index.js";
import logger from "../../utils/logger.js";

/**
 * Embedding Cleanup Service
 *
 * This service provides functions for cleaning up orphaned embedding metadata.
 * The cleanupOrphanedEmbeddings function is automatically called by wipe-data.ts
 * when wiping Memgraph or Qdrant to maintain data consistency.
 *
 * Other functions in this file are used for more targeted cleanup operations.
 */

/**
 * Clean up orphaned embedding metadata
 * Removes metadata for entities/relationships that no longer exist
 *
 * Note: This is automatically called by wipe-data.ts when wiping Memgraph
 */
export async function cleanupOrphanedEmbeddings(
  graphStore: GraphStore,
  vectorStore: VectorStore,
  source?: SourceType
): Promise<{ deleted: number; errors: number }> {
  logger.info(
    `🧹 Cleaning up orphaned embedding metadata${
      source ? ` for source: ${source}` : ""
    }...`
  );

  let deleted = 0;
  let errors = 0;

  try {
    // 1. Clean up entities that no longer exist in Memgraph
    const entityQuery: any = { itemType: "entity" };
    if (source) {
      // Find entities whose source documents match the source prefix
      entityQuery.sourceDocumentIds = { $regex: `^${source}_` };
    }

    const entityMetadata = await GraphEmbeddingMetadata.find(entityQuery);
    logger.info(
      `   Found ${entityMetadata.length} entity metadata records to check`
    );

    for (const meta of entityMetadata) {
      try {
        const exists = await graphStore.nodeExists(meta.entityId!);
        if (!exists) {
          // Delete from MongoDB
          await GraphEmbeddingMetadata.deleteOne({ _id: meta._id });

          // Delete from Qdrant using entity point ID format
          try {
            const qdrantPointId = `entity_${meta._id}`;
            await vectorStore.deleteByIds([qdrantPointId]);
          } catch (err) {
            logger.warn(
              { err, pointId: `entity_${meta._id}` },
              "Failed to delete from Qdrant"
            );
          }

          deleted++;
        }
      } catch (err) {
        logger.error(
          { err, metaId: meta._id },
          "Error checking entity existence"
        );
        errors++;
      }
    }

    // 2. Clean up relationships that no longer exist in Memgraph
    const relQuery: any = { itemType: "relationship" };
    if (source) {
      relQuery.sourceId = { $regex: `^${source}_` };
    }

    const relMetadata = await GraphEmbeddingMetadata.find(relQuery);
    logger.info(
      `   Found ${relMetadata.length} relationship metadata records to check`
    );

    for (const meta of relMetadata) {
      try {
        const exists = await graphStore.relationshipExists(
          meta.sourceId!,
          meta.relType!,
          meta.targetId!
        );
        if (!exists) {
          // Delete from MongoDB
          await GraphEmbeddingMetadata.deleteOne({ _id: meta._id });

          // Delete from Qdrant using relationship point ID (which is the _id)
          try {
            await vectorStore.deleteByIds([meta._id]);
          } catch (err) {
            logger.warn(
              { err, pointId: meta._id },
              "Failed to delete from Qdrant"
            );
          }

          deleted++;
        }
      } catch (err) {
        logger.error(
          { err, metaId: meta._id },
          "Error checking relationship existence"
        );
        errors++;
      }
    }

    // 3. Clean up embeddings with no source documents
    const noSourceDocs = await GraphEmbeddingMetadata.find({
      $or: [
        { sourceDocumentIds: { $size: 0 } },
        { sourceDocumentIds: { $exists: false } },
      ],
    });

    logger.info(
      `   Found ${noSourceDocs.length} metadata records with no source documents`
    );

    for (const meta of noSourceDocs) {
      try {
        // Delete from MongoDB
        await GraphEmbeddingMetadata.deleteOne({ _id: meta._id });

        // Delete from Qdrant (construct point ID based on item type)
        try {
          const qdrantPointId =
            meta.itemType === "entity" ? `entity_${meta._id}` : meta._id;
          await vectorStore.deleteByIds([qdrantPointId]);
        } catch (err) {
          const pointId =
            meta.itemType === "entity" ? `entity_${meta._id}` : meta._id;
          logger.warn({ err, pointId }, "Failed to delete from Qdrant");
        }

        deleted++;
      } catch (err) {
        logger.error(
          { err, metaId: meta._id },
          "Error deleting no-source metadata"
        );
        errors++;
      }
    }

    logger.info(
      `✅ Cleaned up ${deleted} orphaned embeddings${
        errors > 0 ? ` (${errors} errors)` : ""
      }`
    );
  } catch (err) {
    logger.error({ err }, "Error during orphan cleanup");
    errors++;
  }

  return { deleted, errors };
}

/**
 * Clean up embedding metadata for a specific source
 * Used when wiping data for a source
 */
export async function cleanupEmbeddingsBySource(
  source: SourceType
): Promise<{ deleted: number }> {
  logger.debug({ msg: `🧹 Cleaning up embedding metadata`, source });

  // Delete all metadata where any source document matches the source prefix
  const result = await GraphEmbeddingMetadata.deleteMany({
    sourceDocumentIds: { $regex: `^${source}_` },
  });

  logger.info({ msg: `✅ Deleted ${result.deletedCount} metadata records` });
  return { deleted: result.deletedCount || 0 };
}

/**
 * Clean up all embedding metadata
 * Used when wiping all data
 */
export async function cleanupAllEmbeddings(): Promise<{ deleted: number }> {
  logger.info(`🧹 Cleaning up all embedding metadata...`);

  const result = await GraphEmbeddingMetadata.deleteMany({});

  logger.info(`   ✅ Deleted ${result.deletedCount} metadata records`);
  return { deleted: result.deletedCount || 0 };
}

/**
 * Remove a document from all embedding metadata provenance
 * Used when deleting a document
 */
export async function removeDocumentFromEmbeddingProvenance(
  documentId: string
): Promise<{ updated: number; deleted: number }> {
  logger.info(
    `🧹 Removing document ${documentId} from embedding provenance...`
  );

  // Remove document from sourceDocumentIds arrays
  const updateResult = await GraphEmbeddingMetadata.updateMany(
    { sourceDocumentIds: documentId },
    { $pull: { sourceDocumentIds: documentId } }
  );

  // Delete metadata that now has no source documents
  const deleteResult = await GraphEmbeddingMetadata.deleteMany({
    sourceDocumentIds: { $size: 0 },
  });

  logger.info(
    `   ✅ Updated ${updateResult.modifiedCount} records, deleted ${deleteResult.deletedCount} with no sources`
  );

  return {
    updated: updateResult.modifiedCount || 0,
    deleted: deleteResult.deletedCount || 0,
  };
}
