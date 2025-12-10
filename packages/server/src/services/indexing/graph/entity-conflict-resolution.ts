import { GraphEmbeddingMetadata } from "../../../models/graph-embedding-metadata.model.js";
import { RecordStore } from "../../../stores/record.store.js";
import logger from "../../../utils/logger.js";

/**
 * Conflict resolution strategies for entities that appear in multiple documents
 */

/**
 * Get the best description for an entity from multiple source documents
 * Uses LLM-extracted entity description stored in metadata
 */
export async function getEntityEmbeddingText(
  entityId: string,
  entityType: string,
  recordStore: RecordStore
): Promise<string> {
  // Check if we have metadata for this entity
  const metadata = await GraphEmbeddingMetadata.findById(entityId);

  if (!metadata) {
    // No metadata yet - this is a new entity
    return `${entityType} - ${entityId}\nNo description available`;
  }

  // Use LLM-extracted description from metadata
  const description = metadata.entityDescription || "No description available";

  // Format: "EntityType - EntityID\nDescription"
  return `${entityType} - ${entityId}\n${description}`;
}

/**
 * Get the best description for a relationship from multiple source documents
 * Uses LLM-extracted relationship description stored in metadata
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
  // Get relationship metadata
  const relId = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;
  const relMetadata = await GraphEmbeddingMetadata.findById(relId);

  // Try to get entity names from their metadata
  const sourceMetadata = await GraphEmbeddingMetadata.findById(rel.sourceId);
  const targetMetadata = await GraphEmbeddingMetadata.findById(rel.targetId);

  const sourceName = sourceMetadata?.entityId || "Unknown";
  const targetName = targetMetadata?.entityId || "Unknown";

  // Use LLM-extracted description from metadata
  const description =
    relMetadata?.relationshipDescription || "No description available";

  // Format: "SourceEntity -[RelationType]-> TargetEntity\nDescription"
  // Note: Confidence is NOT included in embedding text to avoid re-embedding when confidence changes
  return `${sourceName} -[${rel.type}]-> ${targetName}\n${description}`;
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
