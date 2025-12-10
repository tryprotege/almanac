import OpenAI from "openai";
import { Entity, Relationship } from "./entity-deduplication.js";
import { chat } from "../../../llm/llm.js";
import logger from "../../../../utils/logger.js";
import sleep from "../../../../utils/sleep.js";

// TODO: Replace with token counting based on model's context window
// Most models support 128K tokens (~512K chars), but varies by model
const MAX_CONTENT_LENGTH = 200_000;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Strip extra quotes from strings that the LLM sometimes adds
 * e.g., ""Anthropic"" -> "Anthropic"
 */
function stripExtraQuotes(str: string): string {
  if (!str) return str;
  let cleaned = str.trim();

  // Remove leading/trailing quotes if they exist
  while (
    cleaned.startsWith('"') &&
    cleaned.endsWith('"') &&
    cleaned.length > 2
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
}

// ============================================================================
// JSON Schemas for Structured Output
// ============================================================================

const ENTITY_EXTRACTION_SCHEMA: Record<string, unknown> = {
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
  },
  required: ["entities"],
  additionalProperties: false,
};

const RELATIONSHIP_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
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
  required: ["relationships"],
  additionalProperties: false,
};

// ============================================================================
// Two-Stage Graph Extraction Functions (Low Reasoning)
// ============================================================================

/**
 * Build entity extraction prompt (Stage 1)
 */
function buildEntityExtractionPrompt(
  content: string,
  entityTypes: string[],
  persona?: string
): string {
  const personaContext = persona ? `USER CONTEXT:\n${persona}\n\n` : "";

  return `${personaContext}---Goal---
Extract named entities from the text document for a knowledge graph.

---Entity Types---
${entityTypes.join(", ")}

You may discover new entity types not in this list.

---CRITICAL NAMING RULES---
Follow these rules STRICTLY for entity names:

1. PERSON entities:
   ✅ Use "First Last" format: "Jane Doe", "John Smith"
   ✅ If only first name: "Jane", "John"
   ✅ If only last name: "Smith"
   ❌ NEVER use: "Doe, Jane" or "Smith, John" (reversed)
   ❌ NEVER use titles: "Dr. Smith", "Mr. Jones"
   ❌ NEVER use initials only: "J.S."

2. ALL entity types:
   ✅ Use the EXACT SAME NAME throughout (case matters!)
   ✅ Use consistent capitalization
   ❌ DON'T use variations: "Task Manager" vs "taskManager"

---Steps---
1. Identify entities:
   - Extract named entities (people, organizations, projects, concepts)
   - Apply NAMING RULES above (especially for people!)
   - Use CONSISTENT NAMING
   - Provide brief description for each

---Output Format---
{
  "entities": [
    { "name": "Alex Smith", "type": "Person", "description": "..." }
  ]
}

---Real Data---
Text:
${content.substring(0, MAX_CONTENT_LENGTH)}

---Output---
Return ONLY valid JSON, no other text.`;
}

/**
 * Build relationship extraction prompt (Stage 2)
 */
function buildRelationshipExtractionPrompt(
  content: string,
  entities: Entity[],
  relationshipTypes: string[],
  persona?: string
): string {
  const personaContext = persona ? `USER CONTEXT:\n${persona}\n\n` : "";

  // Format entity list for prompt
  const entityList = entities
    .map((e) => `- "${e.name}" (${e.type})`)
    .join("\n");

  return `${personaContext}---Goal---
Extract HIGH-VALUE relationships between the provided entities for a knowledge graph.

IMPORTANT: This graph complements a vector embedding system. Extract relationships that:
✅ Enable multi-hop reasoning (e.g., "Who reports to X?", "What blocks Y?")
✅ Capture structure/hierarchy (org charts, dependencies)
✅ Express causality and dependencies
✅ Represent temporal relationships (supersedes, versions)
✅ Show ownership and responsibility

❌ DO NOT extract relationships that embeddings already capture:
- "mentioned_with", "appears_with" (just co-occurrence)
- "related_to", "similar_to" (too vague - use embeddings for this)
- Generic "associated_with" (semantic search handles this)

---Extracted Entities---
${entityList}

---Relationship Types---
${relationshipTypes.join(", ")}

PRIORITIZE these high-value relationship patterns:
- Hierarchical: REPORTS_TO, MANAGES, PART_OF, MEMBER_OF
- Dependencies: BLOCKS, BLOCKED_BY, REQUIRES, DEPENDS_ON
- Actions: ASSIGNED_TO, CREATED_BY, APPROVED_BY, REVIEWED_BY
- Temporal: SUPERSEDES, REPLACES, VERSION_OF
- Domain: REGULATES, APPLIES_TO, IMPLEMENTS, CITES

---CRITICAL MATCHING RULES---
1. Source and target MUST use EXACT entity names from the list above
2. Copy-paste the entity name EXACTLY (including capitalization)
3. If you want to reference "Alex Smith", use "Alex Smith" - not "Alex" or "Smith"
4. Verify each relationship references entities that exist in the list above

---Steps---
1. Identify HIGH-VALUE relationships:
   - Focus on structural, causal, and hierarchical connections
   - Use relationship types above when applicable
   - Strength scoring (only include if >= 5):
     * 9-10: Explicit direct mention
     * 7-8: Strong contextual evidence
     * 5-6: Clear semantic connection
     * Below 5: SKIP (too weak)
   - CRITICAL: Copy entity names EXACTLY from the entities list above

2. VALIDATE before returning:
   - Check: Does EVERY relationship source exist in entities list?
   - Check: Does EVERY relationship target exist in entities list?
   - Check: Are names EXACTLY the same (including capitalization)?
   - Remove any relationships that fail these checks

---Examples of GOOD relationships---
✅ { "source": "Alex Smith", "target": "Sarah Johnson", "type": "REPORTS_TO", "strength": 10 }
✅ { "source": "Project X", "target": "Task Y", "type": "DEPENDS_ON", "strength": 9 }
✅ { "source": "GDPR", "target": "EU Residents", "type": "APPLIES_TO", "strength": 10 }

---Examples of BAD relationships (skip these)---
❌ "Alex and Sarah are mentioned together" → SKIP (use embeddings for co-occurrence)
❌ "Project X is related to Marketing" → SKIP (too vague, embeddings handle this)
❌ "Document mentions Company Y" → SKIP (just a mention, no structural relationship)

---Output Format---
{
  "relationships": [
    {
      "source": "Alex Smith",
      "target": "Project X",
      "type": "WORKS_ON",
      "description": "Alex is lead developer",
      "strength": 9
    }
  ]
}

---Real Data---
Text:
${content.substring(0, MAX_CONTENT_LENGTH)}

---Output---
Return ONLY valid JSON, no other text.`;
}

/**
 * Extract entities from content (Stage 1)
 */
async function extractEntitiesFromContent(
  client: OpenAI,
  content: string,
  existingEntityTypes: string[],
  persona?: string,
  maxRetries: number = 3
): Promise<Entity[]> {
  let response = "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = buildEntityExtractionPrompt(
        content,
        existingEntityTypes,
        persona
      );

      response = await chat(
        client,
        [
          {
            role: "system",
            content:
              "You are a knowledge graph entity extraction system. Extract structured entities from content. Always respond with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        {
          temperature: 0,
          reasoningEffort: "low",
          maxTokens: 10000,
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "entity_extraction",
              schema: ENTITY_EXTRACTION_SCHEMA,
              strict: true,
            },
          },
        }
      );

      const cleaned = response
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      const extracted = JSON.parse(cleaned);

      // Strip extra quotes from entity names and types
      const entities = (extracted.entities || []).map((entity: Entity) => ({
        ...entity,
        name: stripExtraQuotes(entity.name),
        type: stripExtraQuotes(entity.type),
      }));

      logger.info(`📊 Entity Extraction Results (Stage 1):`);
      logger.info(`   - Content length: ${content.length} chars`);
      logger.info(`   - Entities extracted: ${entities.length}`);

      if (entities.length > 0) {
        logger.info(
          `   - Sample entities: ${JSON.stringify(
            entities.slice(0, 3),
            null,
            2
          )}`
        );
      }

      if (attempt > 1) {
        logger.info(
          `✅ Entity extraction succeeded on retry attempt ${attempt}/${maxRetries}`
        );
      }

      return entities;
    } catch (err) {
      logger.error(
        {
          err,
          attempt,
          maxRetries,
          rawResponse: response,
          responseLength: response?.length,
          responsePreview: response?.substring(0, 1000),
        },
        `❌ Failed to parse entity extraction response (attempt ${attempt}/${maxRetries})`
      );

      if (attempt === maxRetries) {
        logger.error(
          `❌ Entity extraction failed after ${maxRetries} attempts. Returning empty results.`
        );
        return [];
      }

      const delayMs = 1000 * Math.pow(2, attempt - 1);
      logger.warn(
        `⚠️  Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
      );
      await sleep(delayMs);
    }
  }

  return [];
}

/**
 * Extract relationships from content (Stage 2)
 */
async function extractRelationshipsFromContent(
  client: OpenAI,
  content: string,
  entities: Entity[],
  existingRelationshipTypes: string[],
  persona?: string,
  maxRetries: number = 3,
  recordContext?: {
    recordId: string;
    recordTitle: string;
  }
): Promise<Relationship[]> {
  let response = "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = buildRelationshipExtractionPrompt(
        content,
        entities,
        existingRelationshipTypes,
        persona
      );

      response = await chat(
        client,
        [
          {
            role: "system",
            content:
              "You are a knowledge graph relationship extraction system. Extract structured relationships between entities. Always respond with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        {
          temperature: 0,
          reasoningEffort: "medium",
          maxTokens: 10000,
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "relationship_extraction",
              schema: RELATIONSHIP_EXTRACTION_SCHEMA,
              strict: true,
            },
          },
        }
      );

      // With structured output, no need to clean - it's guaranteed valid JSON
      const extracted = JSON.parse(response);

      // Strip extra quotes from relationship fields
      const relationships = (extracted.relationships || []).map(
        (rel: Relationship) => ({
          ...rel,
          source: stripExtraQuotes(rel.source),
          target: stripExtraQuotes(rel.target),
          type: stripExtraQuotes(rel.type),
        })
      );

      // Build a set of valid entity names (normalized) for validation
      const validEntityNames = new Set(
        entities.map((e) => e.name.toLowerCase().trim())
      );

      // Validate relationships - filter out those with missing source/target entities
      const validatedRelationships = relationships.filter(
        (rel: Relationship) => {
          const normalizedSource = rel.source.toLowerCase().trim();
          const normalizedTarget = rel.target.toLowerCase().trim();

          const hasValidSource = validEntityNames.has(normalizedSource);
          const hasValidTarget = validEntityNames.has(normalizedTarget);

          if (!hasValidSource || !hasValidTarget) {
            logger.warn(
              `⚠️  Filtered invalid relationship - entity not in extraction list:`
            );
            if (recordContext) {
              logger.warn(`   Record ID: ${recordContext.recordId}`);
              logger.warn(`   Record: "${recordContext.recordTitle}"`);
            }
            logger.warn(
              `   Relationship: ${rel.source} -[${rel.type}]-> ${rel.target}`
            );
            if (!hasValidSource) {
              logger.warn(`   Missing source entity: "${rel.source}"`);
            }
            if (!hasValidTarget) {
              logger.warn(`   Missing target entity: "${rel.target}"`);
            }

            logger.warn(`   Extracted entities (${entities.length}):`);
            entities.forEach((e: Entity) => {
              logger.warn(`     - "${e.name}" (${e.type})`);
            });

            return false;
          }

          return true;
        }
      );

      const filteredCount =
        relationships.length - validatedRelationships.length;

      logger.info(`📊 Relationship Extraction Results (Stage 2):`);
      logger.info(`   - Relationships extracted: ${relationships.length}`);
      if (filteredCount > 0) {
        logger.warn(
          `   - Filtered ${filteredCount} invalid relationships (entities not found)`
        );
        logger.info(
          `   - Valid relationships: ${validatedRelationships.length}`
        );
      }

      if (validatedRelationships.length > 0) {
        logger.info(
          `   - Sample relationships: ${JSON.stringify(
            validatedRelationships.slice(0, 3),
            null,
            2
          )}`
        );
      }

      if (attempt > 1) {
        logger.info(
          `✅ Relationship extraction succeeded on retry attempt ${attempt}/${maxRetries}`
        );
      }

      return validatedRelationships;
    } catch (err) {
      logger.error(
        {
          err,
          attempt,
          maxRetries,
          rawResponse: response,
          responseLength: response?.length,
          responsePreview: response?.substring(0, 1000),
        },
        `❌ Failed to parse relationship extraction response (attempt ${attempt}/${maxRetries})`
      );

      if (attempt === maxRetries) {
        logger.error(
          `❌ Relationship extraction failed after ${maxRetries} attempts. Returning empty results.`
        );
        return [];
      }

      const delayMs = 1000 * Math.pow(2, attempt - 1);
      logger.warn(
        `⚠️  Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
      );
      await sleep(delayMs);
    }
  }

  return [];
}

/**
 * Extract entities and relationships using two-stage extraction with low reasoning
 * Stage 1: Extract entities
 * Stage 2: Extract relationships using entities from stage 1
 */
export async function extractGraphFromContent(
  client: OpenAI,
  content: string,
  existingEntityTypes: string[],
  existingRelationshipTypes: string[],
  persona?: string,
  maxRetries: number = 3,
  recordContext?: {
    recordId: string;
    recordTitle: string;
  }
): Promise<{
  entities: Entity[];
  relationships: Relationship[];
}> {
  // Stage 1: Extract entities
  const entities = await extractEntitiesFromContent(
    client,
    content,
    existingEntityTypes,
    persona,
    maxRetries
  );

  // Stage 2: Extract relationships (only if we have entities)
  let relationships: Relationship[] = [];
  if (entities.length > 0) {
    relationships = await extractRelationshipsFromContent(
      client,
      content,
      entities,
      existingRelationshipTypes,
      persona,
      maxRetries,
      recordContext
    );
  } else {
    logger.warn(`⚠️  No entities extracted, skipping relationship extraction`);
  }

  // Summary logging
  logger.info(
    `✅ Two-stage extraction complete: ${recordContext?.recordTitle}`
  );
  logger.info(`   - Entities: ${entities.length}`);
  logger.info(`   - Relationships: ${relationships.length}`);

  return {
    entities,
    relationships,
  };
}
