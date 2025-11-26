/**
 * Graph Schema Types - Define entity and relationship schemas for workspaces
 */

/**
 * Entity type definition (node type in graph)
 */
export interface EntityType {
  name: string; // e.g., "Task", "Person", "Document"
  description: string; // Human-readable description
  mcpSource?: string; // Optional: which MCP source defines this
  properties?: string[]; // Optional: expected properties
}

/**
 * Relationship type definition (edge type in graph)
 */
export interface RelationshipType {
  name: string; // e.g., "ASSIGNED_TO", "BLOCKS", "MENTIONS"
  description: string; // Human-readable description
  sourceTypes: string[]; // Valid source entity types
  targetTypes: string[]; // Valid target entity types
  bidirectional: boolean; // Can traverse in both directions
  mcpSource?: string; // Optional: which MCP source defines this
}

/**
 * Extraction rules for LLM-based extraction
 */
export interface ExtractionRules {
  autoExtractEntities: boolean;
  autoExtractRelationships: boolean;
  confidenceThreshold: number; // Minimum confidence to store (0.0-1.0)
}

/**
 * Complete graph schema (single-tenant)
 */
export interface GraphSchema {
  _id: string;
  entityTypes: EntityType[];
  relationshipTypes: RelationshipType[];
  extractionRules: ExtractionRules;
  updatedAt: Date;
  createdAt: Date;
}

/**
 * Default schema
 */
export const DEFAULT_GRAPH_SCHEMA: Omit<
  GraphSchema,
  "_id" | "createdAt" | "updatedAt"
> = {
  entityTypes: [
    {
      name: "Document",
      description: "Any document, page, or file",
      properties: ["title", "content", "author"],
    },
    {
      name: "Person",
      description: "Individual person or user",
      properties: ["name", "email"],
    },
    {
      name: "Task",
      description: "Work item, issue, or todo",
      properties: ["title", "status", "assignee"],
    },
    {
      name: "Project",
      description: "Project, workspace, or initiative",
      properties: ["name", "description"],
    },
  ],
  relationshipTypes: [
    {
      name: "ASSIGNED_TO",
      description: "Task or work item assigned to a person",
      sourceTypes: ["Task"],
      targetTypes: ["Person"],
      bidirectional: false,
    },
    {
      name: "BLOCKS",
      description: "One task blocks progress on another task",
      sourceTypes: ["Task"],
      targetTypes: ["Task"],
      bidirectional: false,
    },
    {
      name: "MENTIONS",
      description: "Document mentions or references another entity",
      sourceTypes: ["Document", "Task"],
      targetTypes: ["Document", "Task", "Person", "Project"],
      bidirectional: false,
    },
    {
      name: "RELATED_TO",
      description:
        "Generic semantic relationship between entities on similar topics",
      sourceTypes: ["Document", "Task", "Project"],
      targetTypes: ["Document", "Task", "Project"],
      bidirectional: true,
    },
    {
      name: "DEPENDS_ON",
      description: "One task depends on completion of another",
      sourceTypes: ["Task"],
      targetTypes: ["Task"],
      bidirectional: false,
    },
    {
      name: "PART_OF",
      description: "Entity belongs to or is contained within another",
      sourceTypes: ["Task", "Document"],
      targetTypes: ["Project"],
      bidirectional: false,
    },
    {
      name: "AUTHORED_BY",
      description: "Content created or authored by a person",
      sourceTypes: ["Document", "Task"],
      targetTypes: ["Person"],
      bidirectional: false,
    },
  ],
  extractionRules: {
    autoExtractEntities: true,
    autoExtractRelationships: true,
    confidenceThreshold: 0.6,
  },
};
