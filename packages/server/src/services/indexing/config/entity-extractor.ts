import type {
  EntityExtractionConfig,
  RelationshipConfig,
  ExtractedEntity,
  ExtractedRelationship,
} from "@ebee-oss/indexing-engine";
import logger from "../../../utils/logger.js";

/**
 * Extract value from record using JSONPath
 * Simple implementation that handles dot notation paths
 */
function extractPath(record: any, path: string): any {
  // Remove leading $. if present
  const cleanPath = path.startsWith("$.") ? path.substring(2) : path;

  // Split by dots and navigate
  const parts = cleanPath.split(".");
  let value = record;

  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }

  return value;
}

/**
 * Extract entities from a record based on config
 */
export function extractEntities(
  record: any,
  entityConfigs: EntityExtractionConfig[]
): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  for (const config of entityConfigs) {
    // Check condition
    if (config.condition) {
      try {
        const conditionFn = new Function(
          "record",
          `return ${config.condition}`
        );
        if (!conditionFn(record)) continue;
      } catch (err) {
        logger.warn(
          { err, condition: config.condition },
          "Error evaluating entity condition"
        );
        continue;
      }
    }

    // Extract ID and title
    const id = extractPath(record, config.idPath);
    const title = extractPath(record, config.titlePath);

    if (!id) {
      logger.debug({ entityName: config.name }, "Entity ID is null, skipping");
      continue;
    }

    // Extract additional properties
    const properties: Record<string, any> = {};
    if (config.properties) {
      for (const [propName, propPath] of Object.entries(config.properties)) {
        const value = extractPath(record, propPath);
        if (value !== undefined) {
          properties[propName] = value;
        }
      }
    }

    entities.push({
      id: `${config.type.toLowerCase()}_${id}`, // Prefix with type for uniqueness
      type: config.type,
      title: title || id,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
    });
  }

  return entities;
}

/**
 * Extract relationships from a record based on config
 */
export function extractRelationships(
  record: any,
  documentId: string,
  documentType: string,
  relationshipConfigs: RelationshipConfig[]
): ExtractedRelationship[] {
  const relationships: ExtractedRelationship[] = [];

  for (const config of relationshipConfigs) {
    // Check condition
    if (config.condition) {
      try {
        const conditionFn = new Function(
          "record",
          `return ${config.condition}`
        );
        if (!conditionFn(record)) continue;
      } catch (err) {
        logger.warn(
          { err, condition: config.condition },
          "Error evaluating relationship condition"
        );
        continue;
      }
    }

    // Extract target ID
    const targetId = extractPath(record, config.targetIdPath);

    if (!targetId) {
      logger.debug(
        { relName: config.name },
        "Target ID is null, skipping relationship"
      );
      continue;
    }

    // Extract source ID if provided, otherwise use document ID
    const sourceId = config.sourceIdPath
      ? extractPath(record, config.sourceIdPath)
      : documentId;

    if (!sourceId) {
      logger.debug(
        { relName: config.name },
        "Source ID is null, skipping relationship"
      );
      continue;
    }

    relationships.push({
      sourceId: sourceId,
      sourceType: config.sourceType || documentType,
      targetId: `${config.targetType.toLowerCase()}_${targetId}`,
      targetType: config.targetType,
      type: config.type,
      confidence: config.confidence || 1.0,
    });
  }

  return relationships;
}
