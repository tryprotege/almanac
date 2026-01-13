/**
 * Config-based Entity Indexer
 * Saves entities/relationships extracted from structured data (not LLM)
 */

import type { ExtractedEntity, ExtractedRelationship } from '@ebee-oss/indexing-engine';
import { GraphStore } from '../../../stores/graph.store.js';
import { GraphEmbeddingMetadata } from '../../../models/graph-embedding-metadata.model.js';
import { RelationshipMentionStore } from '../../../stores/relationship-mention.store.js';
import { calculateEmbeddingChecksum } from '../../../utils/checksum.js';
import logger from '../../../utils/logger.js';

/**
 * Save config-extracted entities and relationships to graph
 */
export async function indexConfigEntities(
  documentId: string,
  _documentTitle: string,
  source: string,
  extractedEntities: ExtractedEntity[],
  extractedRelationships: ExtractedRelationship[],
  graphStore: GraphStore,
): Promise<void> {
  if (extractedEntities.length === 0 && extractedRelationships.length === 0) {
    return; // Nothing to index
  }

  logger.info({
    msg: '💎 Indexing config-extracted entities',
    documentId,
    entities: extractedEntities.length,
    relationships: extractedRelationships.length,
  });

  // 1. Create entity nodes
  if (extractedEntities.length > 0) {
    await graphStore.upsertEntityNodes(
      extractedEntities.map((entity) => ({
        id: entity.id,
        type: entity.type,
        title: entity.title,
        description: JSON.stringify(entity.properties || {}), // Store properties as JSON
      })),
    );

    // 2. Link entities to document (MENTIONED_IN)
    const entityLinks = extractedEntities.map((entity) => ({
      entityId: entity.id,
      recordId: documentId,
      confidence: 1.0,
    }));

    await graphStore.linkEntitiesToDocuments(entityLinks);

    // 3. Create MongoDB metadata for entity embeddings
    const entityMetadataOps = extractedEntities.map((entity) => {
      // Create readable description from properties
      let entityDescription = `${entity.type}: ${entity.title}`;
      if (entity.properties) {
        const propPairs = Object.entries(entity.properties)
          .filter(([_, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${k}=${v}`)
          .slice(0, 3); // Limit to 3 properties for brevity
        if (propPairs.length > 0) {
          entityDescription += ` (${propPairs.join(', ')})`;
        }
      }

      const contentChecksum = calculateEmbeddingChecksum({
        entityType: entity.type,
        description: entityDescription,
        text: entity.title,
      });

      return {
        updateOne: {
          filter: { entityId: entity.id },
          update: {
            $set: {
              itemType: 'entity',
              entityId: entity.id,
              entityType: entity.type,
              entityDescription: entityDescription,
              source: source,
              contentChecksum: contentChecksum,
              lastUpdatedBy: source,
              extractionMethod: 'config', // Mark as config-extracted
            },
            $addToSet: {
              sources: source,
              sourceDocumentIds: { $each: [documentId] }, // Use $each for consistency
            },
          },
          upsert: true,
        },
      };
    });

    if (entityMetadataOps.length > 0) {
      await GraphEmbeddingMetadata.bulkWrite(entityMetadataOps);
    }

    logger.info({
      msg: '✅ Created entity nodes',
      count: extractedEntities.length,
      documentId,
    });
  }

  // 4. Create relationship edges (entity-to-entity)
  if (extractedRelationships.length > 0) {
    await graphStore.upsertRelationshipsBatch(
      extractedRelationships.map((rel) => ({
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        type: rel.type,
        confidence: rel.confidence,
      })),
    );

    // 5. Track relationship mentions in MongoDB
    const relationshipMentionStore = new RelationshipMentionStore();
    await relationshipMentionStore.addDocumentMentionsBatch(
      documentId,
      extractedRelationships.map((rel) => ({
        sourceEntityId: rel.sourceId,
        targetEntityId: rel.targetId,
        type: rel.type,
        confidence: rel.confidence,
      })),
    );

    // 6. Create MongoDB metadata for relationship embeddings
    const relMetadataOps = extractedRelationships.map((rel) => {
      const contentChecksum = calculateEmbeddingChecksum({
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        relType: rel.type,
      });

      return {
        updateOne: {
          filter: {
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            relType: rel.type,
          },
          update: {
            $set: {
              itemType: 'relationship',
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              relType: rel.type,
              relationshipDescription: `${rel.sourceType} ${rel.type} ${rel.targetType}`,
              source: source,
              contentChecksum: contentChecksum,
              lastUpdatedBy: source,
              extractionMethod: 'config', // Mark as config-extracted
            },
            $addToSet: {
              sources: source,
              sourceDocumentIds: { $each: [documentId] }, // Use $each for consistency
            },
          },
          upsert: true,
        },
      };
    });

    if (relMetadataOps.length > 0) {
      await GraphEmbeddingMetadata.bulkWrite(relMetadataOps);
    }

    logger.info({
      msg: '✅ Created relationships',
      count: extractedRelationships.length,
      documentId,
    });
  }
}
