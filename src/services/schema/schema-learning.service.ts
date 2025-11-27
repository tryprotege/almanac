import {
  EntityType,
  RelationshipType,
} from "../../models/graph-schema.model.js";
import { IndexRequest } from "../../types/index.js";

/**
 * Service for learning entity and relationship types from MCP data
 */
export class SchemaLearningService {
  /**
   * Extract entity types from MCP tool result
   */
  extractEntityTypes(request: IndexRequest): EntityType[] {
    const entityTypes: EntityType[] = [];
    const mcpSource = `${request.source.type}_${request.source.serverId}`;

    // Analyze the tool result content
    if (!request.toolResult.content) return entityTypes;

    for (const item of request.toolResult.content) {
      if (item.type === "text" && item.text) {
        try {
          const data = JSON.parse(item.text);

          // Extract entity types from data structure
          if (Array.isArray(data)) {
            for (const obj of data) {
              const entityType = this.inferEntityTypeFromObject(obj, mcpSource);
              if (entityType) {
                entityTypes.push(entityType);
              }
            }
          } else if (typeof data === "object") {
            const entityType = this.inferEntityTypeFromObject(data, mcpSource);
            if (entityType) {
              entityTypes.push(entityType);
            }
          }
        } catch {
          // Not JSON, skip
        }
      }
    }

    // Deduplicate by name
    const uniqueTypes = new Map<string, EntityType>();
    for (const type of entityTypes) {
      if (!uniqueTypes.has(type.name)) {
        uniqueTypes.set(type.name, type);
      }
    }

    return Array.from(uniqueTypes.values());
  }

  /**
   * Infer entity type from a data object
   */
  private inferEntityTypeFromObject(
    obj: any,
    mcpSource: string
  ): EntityType | null {
    if (!obj || typeof obj !== "object") return null;

    // Look for common type indicators
    const type =
      obj.type ||
      obj.object ||
      obj.kind ||
      obj.entity_type ||
      this.inferTypeFromProperties(obj);

    if (!type) return null;

    // Capitalize first letter
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);

    // Extract properties
    const properties = Object.keys(obj).filter(
      (key) => !["id", "_id", "type", "object", "kind"].includes(key)
    );

    return {
      name: typeName,
      description: `${typeName} from ${mcpSource}`,
      mcpSource,
      properties: properties.slice(0, 10), // Limit to top 10 properties
    };
  }

  /**
   * Infer type from object properties
   */
  private inferTypeFromProperties(obj: any): string | null {
    const keys = Object.keys(obj);

    // Common patterns
    if (keys.includes("email") || keys.includes("username")) {
      return "Person";
    }
    if (keys.includes("title") && keys.includes("content")) {
      return "Document";
    }
    if (keys.includes("status") && keys.includes("assignee")) {
      return "Task";
    }
    if (keys.includes("name") && keys.includes("members")) {
      return "Project";
    }

    return null;
  }

  /**
   * Extract relationship types from MCP tool result
   */
  extractRelationshipTypes(request: IndexRequest): RelationshipType[] {
    const relationshipTypes: RelationshipType[] = [];
    const mcpSource = `${request.source.type}_${request.source.serverId}`;

    // Analyze the tool result content
    if (!request.toolResult.content) return relationshipTypes;

    for (const item of request.toolResult.content) {
      if (item.type === "text" && item.text) {
        try {
          const data = JSON.parse(item.text);

          // Look for relationship indicators in data
          if (Array.isArray(data)) {
            for (const obj of data) {
              const relTypes = this.inferRelationshipsFromObject(
                obj,
                mcpSource
              );
              relationshipTypes.push(...relTypes);
            }
          } else if (typeof data === "object") {
            const relTypes = this.inferRelationshipsFromObject(data, mcpSource);
            relationshipTypes.push(...relTypes);
          }
        } catch {
          // Not JSON, skip
        }
      }
    }

    // Deduplicate by name
    const uniqueTypes = new Map<string, RelationshipType>();
    for (const type of relationshipTypes) {
      if (!uniqueTypes.has(type.name)) {
        uniqueTypes.set(type.name, type);
      }
    }

    return Array.from(uniqueTypes.values());
  }

  /**
   * Infer relationships from object properties
   */
  private inferRelationshipsFromObject(
    obj: any,
    mcpSource: string
  ): RelationshipType[] {
    if (!obj || typeof obj !== "object") return [];

    const relationships: RelationshipType[] = [];
    const sourceType = obj.type || "Document";

    // Common relationship patterns
    const relationshipPatterns: Array<{
      keys: string[];
      relType: string;
      description: string;
      targetType: string;
      bidirectional: boolean;
    }> = [
      {
        keys: ["assignee", "assigned_to", "owner"],
        relType: "ASSIGNED_TO",
        description: "Entity assigned to a person",
        targetType: "Person",
        bidirectional: false,
      },
      {
        keys: ["blocks", "blocking"],
        relType: "BLOCKS",
        description: "Entity blocks another entity",
        targetType: sourceType,
        bidirectional: false,
      },
      {
        keys: ["depends_on", "dependencies"],
        relType: "DEPENDS_ON",
        description: "Entity depends on another entity",
        targetType: sourceType,
        bidirectional: false,
      },
      {
        keys: ["parent", "parent_id"],
        relType: "PART_OF",
        description: "Entity is part of another entity",
        targetType: "Project",
        bidirectional: false,
      },
      {
        keys: ["mentions", "references"],
        relType: "MENTIONS",
        description: "Entity mentions another entity",
        targetType: "Document",
        bidirectional: false,
      },
      {
        keys: ["author", "created_by"],
        relType: "AUTHORED_BY",
        description: "Entity created by a person",
        targetType: "Person",
        bidirectional: false,
      },
    ];

    for (const pattern of relationshipPatterns) {
      const hasKey = pattern.keys.some((key) => key in obj);
      if (hasKey) {
        relationships.push({
          name: pattern.relType,
          description: pattern.description,
          sourceTypes: [sourceType],
          targetTypes: [pattern.targetType],
          bidirectional: pattern.bidirectional,
          mcpSource,
        });
      }
    }

    return relationships;
  }

  /**
   * Merge learned types with existing schema (avoid duplicates)
   */
  mergeEntityTypes(
    existing: EntityType[],
    learned: EntityType[]
  ): EntityType[] {
    const merged = new Map<string, EntityType>();

    // Add existing types
    for (const type of existing) {
      merged.set(type.name, type);
    }

    // Merge learned types
    for (const type of learned) {
      if (!merged.has(type.name)) {
        merged.set(type.name, type);
      } else {
        // Merge properties
        const existing = merged.get(type.name)!;
        const newProps = type.properties || [];
        const existingProps = existing.properties || [];
        const allProps = [...new Set([...existingProps, ...newProps])];

        merged.set(type.name, {
          ...existing,
          properties: allProps,
        });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Merge learned relationship types with existing schema
   */
  mergeRelationshipTypes(
    existing: RelationshipType[],
    learned: RelationshipType[]
  ): RelationshipType[] {
    const merged = new Map<string, RelationshipType>();

    // Add existing types
    for (const type of existing) {
      merged.set(type.name, type);
    }

    // Merge learned types
    for (const type of learned) {
      if (!merged.has(type.name)) {
        merged.set(type.name, type);
      } else {
        // Merge source/target types
        const existing = merged.get(type.name)!;
        const allSourceTypes = [
          ...new Set([...existing.sourceTypes, ...type.sourceTypes]),
        ];
        const allTargetTypes = [
          ...new Set([...existing.targetTypes, ...type.targetTypes]),
        ];

        merged.set(type.name, {
          ...existing,
          sourceTypes: allSourceTypes,
          targetTypes: allTargetTypes,
        });
      }
    }

    return Array.from(merged.values());
  }
}
