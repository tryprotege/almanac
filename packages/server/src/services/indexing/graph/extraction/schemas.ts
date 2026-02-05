import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const combinedExtractionZodSchema = z
  .object({
    entities: z
      .array(
        z
          .object({
            name: z
              .string()
              .describe('The canonical name of the entity as it appears in the content'),
            type: z
              .string()
              .describe(
                'The semantic category or type of the entity (e.g., Person, Organization, Technology, Concept)',
              ),
            description: z
              .string()
              .describe(
                "A concise summary of the entity's role, attributes, or significance in the content",
              ),
          })
          .strict(),
      )
      .describe(
        'List of entities (people, organizations, concepts, etc.) mentioned in the content',
      ),

    relationships: z
      .array(
        z
          .object({
            source: z
              .string()
              .describe(
                'The name of the source entity in the relationship (must exactly match an entity name)',
              ),
            target: z
              .string()
              .describe(
                'The name of the target entity in the relationship (must exactly match an entity name)',
              ),
            type: z
              .string()
              .describe(
                'The type or nature of the relationship (e.g., WORKS_AT, CREATED, USES, MENTIONS)',
              ),
            description: z
              .string()
              .describe('A brief explanation of how the source and target entities are related'),
            strength: z
              .number()
              .describe(
                'A confidence score between 0 and 1 indicating how strong or important this relationship is',
              ),
          })
          .strict(),
      )
      .describe('List of meaningful connections between entities extracted from the content'),
  })
  .strict();

export type CombinedExtractionResponse = z.infer<typeof combinedExtractionZodSchema>;

export const combinedExtractionSchema = zodToJsonSchema(combinedExtractionZodSchema, {
  target: 'openAi',
});

const singleEntityZodSchema = z
  .object({
    entity: z.union([
      z
        .object({
          name: z.string(),
          type: z.string(),
          description: z.string(),
        })
        .strict(),
      z.null(),
    ]),
  })
  .strict();

export type SingleEntityResponse = z.infer<typeof singleEntityZodSchema>;

export const singleEntitySchema = zodToJsonSchema(singleEntityZodSchema, {
  target: 'openAi',
});
