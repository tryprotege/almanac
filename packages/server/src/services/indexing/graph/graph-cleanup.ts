/**
 * Graph Cleanup Functions
 * Cleanup deleted records and orphaned embeddings
 */

import { RecordStore } from "../../../stores/record.store.js";
import { GraphStore } from "../../../stores/graph.store.js";
import { VectorStore } from "../../../stores/vector.store.js";
import { RelationshipMentionStore } from "../../../stores/relationship-mention.store.js";
import { SourceType } from "../../../types/index.js";
import {
  cleanupDeletedEntityEmbeddings,
  cleanupDeletedRelationshipEmbeddings,
} from "./graph-embeddings.js";
import logger from "../../../utils/logger.js";

export interface CleanupStats {
  nodes: number;
  entityEmbeddings?: number;
  relationshipEmbeddings?: number;
  orphanedRelationships?: number;
  deletedRelationshipMetadata?: number;
}

/**
 * Clean up deleted records and optionally their embeddings
 */
export const cleanupDeletedRecords = async (
  source: SourceType,
  recordStore: RecordStore,
  graphStore: GraphStore,
  vectorStore?: VectorStore,
  options?: {
    cleanupEmbeddings?: boolean;
  }
): Promise<CleanupStats> => {
  logger.debug({
    msg: `🧹 Cleaning up graph nodes for deleted records`,
    source,
  });

  const deletedRecords = await recordStore.findBySourceAndType(source, "", {
    includeDeleted: true,
  });

  const deleted = deletedRecords.filter((record) => record.deletedAt);
  let cleaned = 0;

  for (const record of deleted) {
    try {
      await graphStore.deleteNode(record._id);
      cleaned++;

      // Clear graph node ID
      await recordStore.upsert({
        _id: record._id,
        lastGraphIndexAt: null,
      });
    } catch (err) {
      logger.error(
        { err, recordId: record._id },
        `Error deleting node for record ${record._id}`
      );
    }
  }

  logger.info(
    `✅ Cleaned up ${cleaned} nodes from ${deleted.length} deleted records`
  );

  const result: CleanupStats = { nodes: cleaned };

  // Clean up embeddings if requested and vectorStore is available
  if (options?.cleanupEmbeddings && vectorStore) {
    logger.info({ msg: `🧹 Cleaning up embeddings for deleted records...` });

    const deps = {
      vectorStore,
      recordStore,
      graphStore,
    };

    const entityStats = await cleanupDeletedEntityEmbeddings(source, deps);
    const relStats = await cleanupDeletedRelationshipEmbeddings(source, deps);

    result.entityEmbeddings = entityStats.deleted;
    result.relationshipEmbeddings = relStats.deleted;

    logger.info(
      `   Cleaned up ${entityStats.deleted} entity embeddings and ${relStats.deleted} relationship embeddings`
    );
  }

  return result;
};

/**
 * Clean up document graph (remove relationship mentions and orphaned relationships)
 * Called when a document is re-indexed or deleted
 */
export const cleanupDocumentGraph = async (
  recordId: string,
  graphStore: GraphStore
): Promise<{
  removedMentions: number;
  orphanedRelationships: number;
  deletedMetadata: number;
}> => {
  logger.info({ msg: "🧹 Cleaning up document graph", recordId });

  const relationshipMentionStore = new RelationshipMentionStore();

  // 1. Remove relationship mentions from MongoDB
  const removedMentions = await relationshipMentionStore.removeDocumentMentions(
    recordId
  );

  logger.info({
    msg: "Removed relationship mentions",
    recordId,
    removedMentions,
  });

  // 2. Find orphaned relationships in MongoDB
  const orphanedRels =
    await relationshipMentionStore.findOrphanedRelationships();

  logger.info({
    msg: "Found orphaned relationships",
    count: orphanedRels.length,
  });

  // 3. Delete orphaned relationships from Memgraph
  if (orphanedRels.length > 0) {
    for (const rel of orphanedRels) {
      try {
        await graphStore.deleteRelationship(
          rel.sourceEntityId,
          rel.type,
          rel.targetEntityId
        );
      } catch (err) {
        logger.error({
          msg: "Failed to delete orphaned relationship from Memgraph",
          err,
          relationship: rel,
        });
      }
    }
  }

  // 4. Delete orphaned relationship metadata from MongoDB
  const deletedMetadata =
    await relationshipMentionStore.deleteOrphanedRelationships();

  logger.info({
    msg: "✅ Graph cleanup complete",
    recordId,
    orphanedRelationships: orphanedRels.length,
    deletedMetadata,
  });

  return {
    removedMentions,
    orphanedRelationships: orphanedRels.length,
    deletedMetadata,
  };
};
