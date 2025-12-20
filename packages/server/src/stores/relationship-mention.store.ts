import { GraphEmbeddingMetadata } from "../models/graph-embedding-metadata.model.js";
import logger from "../utils/logger.js";

/**
 * Store for managing relationship mention tracking in MongoDB
 * Provides atomic operations for adding/removing document mentions
 * Used for orphan detection and cleanup
 */
export class RelationshipMentionStore {
  /**
   * Generate consistent relationship key
   * Format: "sourceId|type|targetId"
   */
  private getRelationshipKey(
    sourceEntityId: string,
    type: string,
    targetEntityId: string
  ): string {
    return `${sourceEntityId}|${type}|${targetEntityId}`;
  }

  /**
   * Add a document mention to a relationship
   * Uses atomic upsert to avoid race conditions
   */
  async addDocumentMention(
    relationship: {
      sourceEntityId: string;
      targetEntityId: string;
      type: string;
      confidence: number;
    },
    documentId: string
  ): Promise<void> {
    const relationshipKey = this.getRelationshipKey(
      relationship.sourceEntityId,
      relationship.type,
      relationship.targetEntityId
    );

    const _id = `rel_${relationshipKey}`;

    await GraphEmbeddingMetadata.findOneAndUpdate(
      { _id },
      {
        $setOnInsert: {
          _id,
          itemType: "relationship",
          sourceId: relationship.sourceEntityId,
          targetId: relationship.targetEntityId,
          relType: relationship.type,
          contentChecksum: relationshipKey, // Use key as checksum for now
          lastUpdatedBy: documentId,
        },
        $addToSet: {
          mentionedInDocuments: {
            documentId,
            confidence: relationship.confidence,
            extractedAt: new Date(),
          },
        },
      },
      { upsert: true }
    );
  }

  /**
   * Batch add mentions for a document
   * More efficient than individual calls for bulk operations
   */
  async addDocumentMentionsBatch(
    documentId: string,
    relationships: Array<{
      sourceEntityId: string;
      targetEntityId: string;
      type: string;
      confidence: number;
    }>
  ): Promise<void> {
    if (relationships.length === 0) return;

    const bulkOps = relationships.map((rel) => {
      const relationshipKey = this.getRelationshipKey(
        rel.sourceEntityId,
        rel.type,
        rel.targetEntityId
      );
      const _id = `rel_${relationshipKey}`;

      return {
        updateOne: {
          filter: { _id },
          update: {
            $setOnInsert: {
              _id,
              itemType: "relationship",
              sourceId: rel.sourceEntityId,
              targetId: rel.targetEntityId,
              relType: rel.type,
              contentChecksum: relationshipKey,
              lastUpdatedBy: documentId,
            },
            $addToSet: {
              mentionedInDocuments: {
                documentId,
                confidence: rel.confidence,
                extractedAt: new Date(),
              },
            },
          },
          upsert: true,
        },
      };
    });

    const result = await GraphEmbeddingMetadata.bulkWrite(bulkOps);

    logger.debug({
      msg: "Added relationship mentions in batch",
      documentId,
      relationshipCount: relationships.length,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    });
  }

  /**
   * Remove all mentions from a document (for re-indexing)
   * Returns the number of relationships modified
   */
  async removeDocumentMentions(documentId: string): Promise<number> {
    const result = await GraphEmbeddingMetadata.updateMany(
      {
        itemType: "relationship",
        "mentionedInDocuments.documentId": documentId,
      },
      {
        $pull: {
          mentionedInDocuments: { documentId } as any,
        },
      }
    );

    logger.debug({
      msg: "Removed document mentions",
      documentId,
      modifiedCount: result.modifiedCount,
    });

    return result.modifiedCount;
  }

  /**
   * Find orphaned relationships (no documents mention them)
   * Used to determine which relationships should be deleted from Memgraph
   */
  async findOrphanedRelationships(): Promise<
    Array<{
      sourceEntityId: string;
      targetEntityId: string;
      type: string;
    }>
  > {
    const orphans = await GraphEmbeddingMetadata.find({
      itemType: "relationship",
      $or: [
        { mentionedInDocuments: { $exists: false } },
        { mentionedInDocuments: { $size: 0 } },
      ],
    }).lean();

    return orphans.map((o) => ({
      sourceEntityId: o.sourceId!,
      targetEntityId: o.targetId!,
      type: o.relType!,
    }));
  }

  /**
   * Delete orphaned relationship metadata
   * Should be called after orphaned relationships are deleted from Memgraph
   */
  async deleteOrphanedRelationships(): Promise<number> {
    const result = await GraphEmbeddingMetadata.deleteMany({
      itemType: "relationship",
      $or: [
        { mentionedInDocuments: { $exists: false } },
        { mentionedInDocuments: { $size: 0 } },
      ],
    });

    logger.debug({
      msg: "Deleted orphaned relationship metadata",
      deletedCount: result.deletedCount,
    });

    return result.deletedCount || 0;
  }

  /**
   * Get all relationships mentioned in a document
   * Useful for debugging and analytics
   */
  async getDocumentRelationships(documentId: string): Promise<
    Array<{
      sourceEntityId: string;
      targetEntityId: string;
      type: string;
      confidence: number;
    }>
  > {
    const relationships = await GraphEmbeddingMetadata.find({
      itemType: "relationship",
      "mentionedInDocuments.documentId": documentId,
    }).lean();

    return relationships.map((r) => {
      const mention = r.mentionedInDocuments?.find(
        (m) => m.documentId === documentId
      );

      return {
        sourceEntityId: r.sourceId!,
        targetEntityId: r.targetId!,
        type: r.relType!,
        confidence: mention?.confidence || 0.8,
      };
    });
  }

  /**
   * Get statistics about relationship mentions
   * Useful for monitoring and debugging
   */
  async getStats(): Promise<{
    totalRelationships: number;
    relationshipsWithMentions: number;
    orphanedRelationships: number;
    averageMentionsPerRelationship: number;
  }> {
    const [totalResult, withMentionsResult, orphanedResult, avgResult] =
      await Promise.all([
        GraphEmbeddingMetadata.countDocuments({ itemType: "relationship" }),
        GraphEmbeddingMetadata.countDocuments({
          itemType: "relationship",
          "mentionedInDocuments.0": { $exists: true },
        }),
        GraphEmbeddingMetadata.countDocuments({
          itemType: "relationship",
          $or: [
            { mentionedInDocuments: { $exists: false } },
            { mentionedInDocuments: { $size: 0 } },
          ],
        }),
        GraphEmbeddingMetadata.aggregate([
          { $match: { itemType: "relationship" } },
          {
            $project: {
              mentionCount: {
                $size: { $ifNull: ["$mentionedInDocuments", []] },
              },
            },
          },
          { $group: { _id: null, avgMentions: { $avg: "$mentionCount" } } },
        ]),
      ]);

    return {
      totalRelationships: totalResult,
      relationshipsWithMentions: withMentionsResult,
      orphanedRelationships: orphanedResult,
      averageMentionsPerRelationship: avgResult[0]?.avgMentions || 0,
    };
  }
}
