/**
 * JSON schemas for structured LLM output
 */

export const COMBINED_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "type", "description"],
        additionalProperties: false,
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          type: { type: "string" },
          description: { type: "string" },
          strength: { type: "number" },
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
