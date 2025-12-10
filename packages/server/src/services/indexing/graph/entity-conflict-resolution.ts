import { Record } from "../../../models/record.model.js";
import { GraphEmbeddingMetadata } from "../../../models/graph-embedding-metadata.model.js";
import { RecordStore } from "../../../stores/record.store.js";
import logger from "../../../utils/logger.js";

/**
 * Conflict resolution strategies for entities that appear in multiple documents
 */

/**
 * Get the best description for an entity from multiple source documents
 * Uses the document that last updated the entity, falling back to the longest description
 */
export async function getEntityEmbeddingText(
  entityId: string,
  entityType: string,
  recordStore: RecordStore
): Promise<string> {
  // Check if we have metadata for this entity
  const metadata = await GraphEmbeddingMetadata.findById(entityId);

  if (!metadata || metadata.sourceDocumentIds.length === 0) {
    // No metadata yet - this is a new entity
    return `${entityId}\n${entityType}\nNew entity`;
  }

  // Fetch all documents that mention this entity
  const documents = await recordStore.findByIds(metadata.sourceDocumentIds);

  if (documents.length === 0) {
    logger.warn({ entityId }, "No documents found for entity");
    return `${entityId}\n${entityType}\nNo source documents`;
  }

  // Strategy: Use the document that last updated this entity (most current info)
  const lastUpdater = documents.find((d) => d._id === metadata.lastUpdatedBy);

  if (lastUpdater) {
    const description = lastUpdater.content.substring(0, 300);
    return `${lastUpdater.title}\n${entityType}\n${description}`;
  }

  // Fallback: Use the longest description (most informative)
  const longest = documents.sort(
    (a, b) => b.content.length - a.content.length
  )[0];
  const description = longest.content.substring(0, 300);
  return `${longest.title}\n${entityType}\n${description}`;
}

/**
 * Get the best description for a relationship from multiple source documents
 * Uses the document titles of source and target entities
 */
export async function getRelationshipEmbeddingText(
  rel: {
    sourceId: string;
    targetId: string;
    type: string;
    confidence: number;
  },
  recordStore: RecordStore
): Promise<string> {
  // Try to get entity names from their metadata
  const sourceMetadata = await GraphEmbeddingMetadata.findById(rel.sourceId);
  const targetMetadata = await GraphEmbeddingMetadata.findById(rel.targetId);

  let sourceName = "Unknown";
  let targetName = "Unknown";

  // Get source name
  if (sourceMetadata && sourceMetadata.sourceDocumentIds.length > 0) {
    const sourceDoc = await recordStore.findById(
      sourceMetadata.lastUpdatedBy || sourceMetadata.sourceDocumentIds[0]
    );
    if (sourceDoc) {
      sourceName = sourceDoc.title;
    }
  }

  // Get target name
  if (targetMetadata && targetMetadata.sourceDocumentIds.length > 0) {
    const targetDoc = await recordStore.findById(
      targetMetadata.lastUpdatedBy || targetMetadata.sourceDocumentIds[0]
    );
    if (targetDoc) {
      targetName = targetDoc.title;
    }
  }

  // Format: "SourceName\tTargetName\nRelationType\nConfidence: X.X"
  return `${sourceName}\t${targetName}\n${
    rel.type
  }\nConfidence: ${rel.confidence.toFixed(2)}`;
}

/**
 * Determine if an entity needs re-embedding
 * Checks if the content checksum has changed or if it hasn't been embedded yet
 */
export async function shouldReembedEntity(
  entityId: string,
  contentChecksum: string,
  documentId: string
): Promise<boolean> {
  const metadata = await GraphEmbeddingMetadata.findById(entityId);

  if (!metadata) {
    // No metadata - needs embedding
    return true;
  }

  // Check if never embedded
  if (!metadata.embeddedChecksum) {
    return true;
  }

  // Check if content checksum differs from embedded checksum
  if (metadata.contentChecksum !== metadata.embeddedChecksum) {
    return true;
  }

  // Check if this is a new document mentioning the entity
  if (!metadata.sourceDocumentIds.includes(documentId)) {
    // New document - might have new information
    return true;
  }

  // No changes needed
  return false;
}

/**
 * Determine if a relationship needs re-embedding
 * Checks if the content checksum has changed or if it hasn't been embedded yet
 */
export async function shouldReembedRelationship(
  relId: string,
  contentChecksum: string
): Promise<boolean> {
  const metadata = await GraphEmbeddingMetadata.findById(relId);

  if (!metadata) {
    // No metadata - needs embedding
    return true;
  }

  // Check if never embedded
  if (!metadata.embeddedChecksum) {
    return true;
  }

  // Check if content checksum differs from embedded checksum
  return metadata.contentChecksum !== metadata.embeddedChecksum;
}
