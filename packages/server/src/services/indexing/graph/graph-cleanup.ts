/**
 * Graph Cleanup Functions
 * Cleanup deleted records and orphaned embeddings
 */

import { RecordStore } from "../../../stores/record.store.js";
import { GraphStore } from "../../../stores/graph.store.js";
import { VectorStore } from "../../../stores/vector.store.js";
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
  logger.info(`🧹 Cleaning up graph nodes for deleted records from ${source}`);

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
    logger.info(`🧹 Cleaning up embeddings for deleted records...`);

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
