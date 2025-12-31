import type {
  EntityExtractionConfig,
  RelationshipConfig,
  ExtractedEntity,
  ExtractedRelationship,
} from "@ebee-oss/indexing-engine";
import logger from "../../../utils/logger.js";

/**
 * Extract array values from a path containing [*]
 */
function extractArrayPath(record: any, path: string): any[] {
  // Remove leading $. if present
  const cleanPath = path.startsWith("$.") ? path.substring(2) : path;

  // Split path at [*]
  const arrayMarkerIndex = cleanPath.indexOf("[*]");
  if (arrayMarkerIndex === -1) {
    // No array marker, shouldn't get here
    return [];
  }

  // Get path to array
  const arrayPath = cleanPath.substring(0, arrayMarkerIndex);
  // Get path after [*]
  const afterArrayPath = cleanPath.substring(arrayMarkerIndex + 3);

  // Navigate to array
  const arrayParts = arrayPath.split(".").filter((p) => p.length > 0);
  let arrayValue = record;

  for (const part of arrayParts) {
    if (arrayValue == null) return [];
    arrayValue = arrayValue[part];
  }

  // If not an array, return empty
  if (!Array.isArray(arrayValue)) {
    return [];
  }

  // Extract from each array element
  if (!afterArrayPath || afterArrayPath.length === 0) {
    // No path after [*], return array items as-is
    return arrayValue;
  }

  // Navigate into each array element
  const afterParts = afterArrayPath
    .substring(afterArrayPath.startsWith(".") ? 1 : 0)
    .split(".")
    .filter((p) => p.length > 0);

  return arrayValue
    .map((item) => {
      let value = item;
      for (const part of afterParts) {
        if (value == null) return undefined;
        value = value[part];
      }
      return value;
    })
    .filter((v) => v !== undefined);
}

/**
 * Extract value from record using JSONPath
 * Supports dot notation paths and array wildcards [*]
 */
function extractPath(record: any, path: string): any | any[] {
  // Check if path contains array wildcard
  if (path.includes("[*]")) {
    return extractArrayPath(record, path);
  }

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

    // Check if we got arrays (from [*] paths)
    const isArrayId = Array.isArray(id);
    const isArrayTitle = Array.isArray(title);

    if (isArrayId) {
      // Multiple entities from array
      const ids = id as any[];
      const titles = isArrayTitle ? (title as any[]) : [];

      for (let i = 0; i < ids.length; i++) {
        const entityId = ids[i];
        if (!entityId) continue;

        // Extract additional properties (arrays matched by index)
        const properties: Record<string, any> = {};
        if (config.properties) {
          for (const [propName, propPath] of Object.entries(
            config.properties
          )) {
            const value = extractPath(record, propPath);
            if (value !== undefined) {
              // If property is array and matches entity array length, use indexed value
              if (Array.isArray(value) && value.length > i) {
                properties[propName] = value[i];
              } else if (!Array.isArray(value)) {
                properties[propName] = value;
              }
            }
          }
        }

        entities.push({
          id: `${config.type.toLowerCase()}_${entityId}`,
          type: config.type,
          title: titles[i] || entityId,
          properties:
            Object.keys(properties).length > 0 ? properties : undefined,
        });
      }
    } else {
      // Single entity
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

    // Check if we got arrays (from [*] paths)
    const isArrayTarget = Array.isArray(targetId);

    if (isArrayTarget) {
      // Multiple relationships from array
      const targetIds = targetId as any[];

      for (const tid of targetIds) {
        if (!tid) continue;

        relationships.push({
          sourceId: sourceId,
          sourceType: config.sourceType || documentType,
          targetId: `${config.targetType.toLowerCase()}_${tid}`,
          targetType: config.targetType,
          type: config.type,
          confidence: config.confidence || 1.0,
        });
      }
    } else {
      // Single relationship
      relationships.push({
        sourceId: sourceId,
        sourceType: config.sourceType || documentType,
        targetId: `${config.targetType.toLowerCase()}_${targetId}`,
        targetType: config.targetType,
        type: config.type,
        confidence: config.confidence || 1.0,
      });
    }
  }

  return relationships;
}
