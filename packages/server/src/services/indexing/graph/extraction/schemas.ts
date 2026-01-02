/**
 * JSON schemas for structured LLM output
 */

export const COMBINED_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      description:
        "List of entities (people, organizations, concepts, etc.) mentioned in the content",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "The canonical name of the entity as it appears in the content",
          },
          type: {
            type: "string",
            description:
              "The semantic category or type of the entity (e.g., Person, Organization, Technology, Concept)",
          },
          description: {
            type: "string",
            description:
              "A concise summary of the entity's role, attributes, or significance in the content",
          },
        },
        required: ["name", "type", "description"],
        additionalProperties: false,
      },
    },
    relationships: {
      type: "array",
      description:
        "List of meaningful connections between entities extracted from the content",
      items: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description:
              "The name of the source entity in the relationship (must exactly match an entity name)",
          },
          target: {
            type: "string",
            description:
              "The name of the target entity in the relationship (must exactly match an entity name)",
          },
          type: {
            type: "string",
            description:
              "The type or nature of the relationship (e.g., WORKS_AT, CREATED, USES, MENTIONS)",
          },
          description: {
            type: "string",
            description:
              "A brief explanation of how the source and target entities are related",
          },
          strength: {
            type: "number",
            description:
              "A confidence score between 0 and 1 indicating how strong or important this relationship is",
          },
        },
        required: ["source", "target", "type", "description", "strength"],
        additionalProperties: false,
      },
    },
  },
  required: ["entities", "relationships"],
  additionalProperties: false,
};

export const SINGLE_ENTITY_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    entity: {
      oneOf: [
        {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string" },
            description: { type: "string" },
          },
          required: ["name", "type", "description"],
          additionalProperties: false,
        },
        {
          type: "null",
        },
      ],
    },
  },
  required: ["entity"],
  additionalProperties: false,
};
