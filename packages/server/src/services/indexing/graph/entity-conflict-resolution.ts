import {
  GraphEmbeddingMetadata,
  GraphEmbeddingMetadataSchema,
} from '../../../models/graph-embedding-metadata.model.js';

/**
 * Conflict resolution strategies for entities that appear in multiple documents
 */

/**
 * Get the best description for an entity from multiple source documents
 * Uses LLM-extracted entity description stored in metadata
 */
export function getEntityEmbeddingText(metadata: GraphEmbeddingMetadataSchema): string {
  // Use LLM-extracted description from metadata
  const description = metadata.entityDescription || 'No description available';

  // Format: "EntityType - EntityName\nDescription"
  return `${metadata.entityType} - ${metadata.entityName}\n${description}`;
}

/**
 * Get the best description for a relationship from multiple source documents
 * Uses LLM-extracted relationship description stored in metadata
 */
export async function getRelationshipEmbeddingText(rel: {
  relMetadata: GraphEmbeddingMetadataSchema;
  sourceEntityId: string;
  targetEntityId: string;
  type: string;
}): Promise<string> {
  // Try to get entity names from their GraphEmbeddingMetadata documents
  const sourceMetadata = await GraphEmbeddingMetadata.findById(rel.sourceEntityId);
  const targetMetadata = await GraphEmbeddingMetadata.findById(rel.targetEntityId);

  const sourceName = sourceMetadata?.entityName || 'Unknown';
  const targetName = targetMetadata?.entityName || 'Unknown';

  // Use LLM-extracted description from metadata
  const description = rel.relMetadata.relationshipDescription || 'No description available';

  // Format: "SourceEntity -[RelationType]-> TargetEntity\nDescription"
  // Note: Confidence is NOT included in embedding text to avoid re-embedding when confidence changes
  return `${sourceName} -[${rel.type}]-> ${targetName}\n${description}`;
}

/**
 * Determine if an entity needs re-embedding
 * Checks if the content checksum has changed or if it hasn't been embedded yet
 */
export async function shouldReembedEntity(
  metadata: GraphEmbeddingMetadataSchema,
): Promise<boolean> {
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

  // No changes needed
  return false;
}

/**
 * Determine if a relationship needs re-embedding
 * Checks if the content checksum has changed or if it hasn't been embedded yet
 */
export async function shouldReembedRelationship(
  relId: string,
  _contentChecksum: string,
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
