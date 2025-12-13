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

/**
 * Normalize entity names for fuzzy matching
 * This allows matching entities with different cases, dashes, and spacing
 * e.g., "Stable‑coin back product" -> "stable-coin-back-product"
 */
function normalizeEntityName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      // Normalize all unicode dashes/hyphens to regular hyphen
      .replace(/[\u2010-\u2015\u2212\u2013\u2014]/g, "-")
      // Normalize multiple spaces/dashes to single
      .replace(/\s+/g, " ")
      .replace(/-+/g, "-")
      // Convert spaces to dashes for consistent matching
      .replace(/\s/g, "-")
  );
}

// ============================================================================
// JSON Schemas for Structured Output
// ============================================================================

const COMBINED_EXTRACTION_SCHEMA: Record<string, unknown> = {
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

const SINGLE_ENTITY_EXTRACTION_SCHEMA: Record<string, unknown> = {
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

// ============================================================================
// Single-Pass Graph Extraction with Fallback
// ============================================================================

/**
 * Build combined extraction prompt (entities + relationships in one call)
 */
function buildCombinedExtractionPrompt(
  content: string,
  entityTypes: string[],
  relationshipTypes: string[],
  persona?: string
): string {
  const personaContext = persona ? `USER CONTEXT:\n${persona}\n\n` : "";

  return `${personaContext}---Goal---
Extract named entities AND their relationships from the text document for a knowledge graph.

---Entity Types---
${entityTypes.join(", ")}

You may discover new entity types not in this list.

---Relationship Types---
${relationshipTypes.join(", ")}

PRIORITIZE these high-value relationship patterns:
- Hierarchical: REPORTS_TO, MANAGES, PART_OF, MEMBER_OF
- Dependencies: BLOCKS, BLOCKED_BY, REQUIRES, DEPENDS_ON
- Actions: ASSIGNED_TO, CREATED_BY, APPROVED_BY, REVIEWED_BY
- Temporal: SUPERSEDES, REPLACES, VERSION_OF
- Domain: REGULATES, APPLIES_TO, IMPLEMENTS, CITES

---CRITICAL NAMING RULES---
Follow these rules STRICTLY for entity names:

1. PRESERVE EXACT SYNTAX from the text:
   ✅ Keep the EXACT case, spacing, and punctuation as it appears in the text
   ✅ If the text says "stable coin back product", use "stable coin back product"
   ✅ If the text says "Stable-coin Product", use "Stable-coin Product"
   ✅ Preserve dashes, hyphens, and special characters exactly as they appear
   
2. PERSON entities:
   ✅ Use "First Last" format: "Jane Doe", "John Smith"
   ✅ If only first name: "Jane", "John"
   ✅ If only last name: "Smith"
   ❌ NEVER use: "Doe, Jane" or "Smith, John" (reversed)
   ❌ NEVER use titles: "Dr. Smith", "Mr. Jones"
   ❌ NEVER use initials only: "J.S."

3. CONSISTENCY:
   ✅ Use the EXACT SAME NAME throughout (case matters!)
   ✅ Use consistent capitalization as it appears in the source text
   ❌ DON'T use variations: "Task Manager" vs "taskManager"

---CRITICAL MATCHING RULES---
When creating relationships:
1. Source and target MUST reference entities you extracted in the entities array
2. Use EXACT entity names (including capitalization)
3. If you want to create a relationship, you MUST extract both entities first

---Relationship Quality Guidelines---
This graph complements a vector embedding system. Extract relationships that:
✅ Enable multi-hop reasoning (e.g., "Who reports to X?", "What blocks Y?")
✅ Capture structure/hierarchy (org charts, dependencies)
✅ Express causality and dependencies
✅ Represent temporal relationships (supersedes, versions)
✅ Show ownership and responsibility

❌ DO NOT extract relationships that embeddings already capture:
- "mentioned_with", "appears_with" (just co-occurrence)
- "related_to", "similar_to" (too vague - use embeddings for this)
- Generic "associated_with" (semantic search handles this)

---Steps---
1. Extract named entities:
   - Extract all named entities (people, organizations, projects, concepts)
   - Apply NAMING RULES above (especially for people!)
   - Use CONSISTENT NAMING
   - Provide brief description for each

2. Extract HIGH-VALUE relationships:
   - Focus on structural, causal, and hierarchical connections
   - Use relationship types above when applicable
   - Strength scoring (only include if >= 5):
     * 9-10: Explicit direct mention
     * 7-8: Strong contextual evidence
     * 5-6: Clear semantic connection
     * Below 5: SKIP (too weak)
   - CRITICAL: Reference entity names EXACTLY as you extracted them in step 1

3. VALIDATE before returning:
   - Check: Does EVERY relationship source exist in entities array?
   - Check: Does EVERY relationship target exist in entities array?
   - Check: Are names EXACTLY the same (including capitalization)?

---Output Format---
{
  "entities": [
    { "name": "Alex Smith", "type": "Person", "description": "..." }
  ],
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
 * Build fallback prompt to extract a single missing entity
 */
function buildSingleEntityExtractionPrompt(
  content: string,
  entityName: string,
  existingEntityTypes: string[],
  relationshipContext?: string
): string {
  const contextSection = relationshipContext
    ? `---Why We're Looking---
A relationship in the text references "${entityName}":
${relationshipContext}

This suggests the entity exists in the text.

`
    : "";

  return `---Goal---
Find and extract information about a specific entity from the text.

---Entity Name to Find---
"${entityName}"

${contextSection}---Known Entity Types---
${existingEntityTypes.join(", ")}

---Instructions---
1. Search the text for "${entityName}" or variations of it:
   - Look for the exact name "${entityName}"
   - Look for abbreviations or shortened versions
   - Look for longer forms that include this name
   - Look for context clues about what this entity is

2. If found (directly or through variations), extract:
   - The entity type (from the list above, or a new type if appropriate)
   - A brief description of the entity based on the text

3. If NOT found in the text at all, set "found": false

---Output Format---
If found:
{
  "entity": {
    "name": "${entityName}",
    "type": "Person",
    "description": "Brief description from text"
  }
}

If not found:
{
  "entity": null
}

---Real Data---
Text:
${content.substring(0, MAX_CONTENT_LENGTH)}

---Output---
Return ONLY valid JSON, no other text.`;
}

/**
 * Extract a single missing entity using fallback prompt
 */
async function extractMissingEntity(
  client: OpenAI,
  content: string,
  entityName: string,
  existingEntityTypes: string[],
  relationshipContext?: string
): Promise<Entity | null> {
  try {
    const prompt = buildSingleEntityExtractionPrompt(
      content,
      entityName,
      existingEntityTypes,
      relationshipContext
    );

    // Debug: Log the prompt being sent
    logger.debug({
      msg: `📝 Fallback extraction prompt for "${entityName}"`,
      prompt,
    });

    const response = await chat(
      client,
      [
        {
          role: "system",
          content:
            "You are a knowledge graph entity extraction system. Find the specific entity requested in the text. Always respond with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      {
        temperature: 0,
        reasoningEffort: "medium",
        maxTokens: 1000,
        frequencyPenalty: 0.2,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "single_entity_extraction",
            schema: SINGLE_ENTITY_EXTRACTION_SCHEMA,
            strict: true,
          },
        },
      }
    );

    // Debug: Log the raw response
    logger.debug({
      msg: `🤖 Fallback extraction response for "${entityName}"`,
      response,
    });

    let result;
    try {
      result = JSON.parse(response);
    } catch (parseErr) {
      // If JSON.parse fails, log the raw response at ERROR level
      logger.error(
        {
          err: parseErr,
          entityName,
          rawResponse: response,
          responseLength: response?.length,
          responsePreview: response?.substring(0, 500),
        },
        `❌ Failed to parse fallback extraction JSON response for "${entityName}"`
      );
      return null;
    }

    // Debug: Log the parsed result
    logger.debug({ msg: `📊 Parsed result for "${entityName}":`, result });

    if (result.entity !== null) {
      return {
        name: stripExtraQuotes(result.entity.name),
        type: stripExtraQuotes(result.entity.type),
        description: result.entity.description || "No description",
      };
    }

    logger.warn({ msg: `⚠️  LLM returned entity=null for "${entityName}"` });
    return null;
  } catch (err) {
    logger.error(
      { err, entityName },
      `❌ Failed to extract missing entity: "${entityName}"`
    );
    return null;
  }
}

/**
 * Infer entity type from relationship type
 */
function inferEntityTypeFromRelationship(relType: string): string {
  // Map relationship types to likely entity types
  const typeMap: Record<string, string> = {
    MEMBER_OF: "Organization",
    PART_OF: "Organization",
    WORKS_ON: "Project",
    ASSIGNED_TO: "Task",
    REPORTS_TO: "Person",
    MANAGES: "Person",
    CREATED_BY: "Person",
    APPROVED_BY: "Person",
    REVIEWED_BY: "Person",
  };

  return typeMap[relType] || "Entity";
}

/**
 * Create inferential entity when fallback extraction fails
 */
function createInferentialEntity(
  entityName: string,
  relationship: Relationship
): Entity {
  // Determine if this is the source or target
  const isSource = relationship.source === entityName;
  const relType = relationship.type;

  // Infer entity type based on relationship
  const inferredType = isSource
    ? inferEntityTypeFromRelationship(relType)
    : inferEntityTypeFromRelationship(relType);

  return {
    name: entityName,
    type: inferredType,
    description: `Inferred from relationship: ${relationship.source} -[${relationship.type}]-> ${relationship.target}`,
  };
}

/**
 * Extract entities and relationships using single-pass extraction with fallback
 */
async function extractBothFromContent(
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
  let response = "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = buildCombinedExtractionPrompt(
        content,
        existingEntityTypes,
        existingRelationshipTypes,
        persona
      );

      response = await chat(
        client,
        [
          {
            role: "system",
            content:
              "You are a knowledge graph extraction system. Extract entities and relationships from content. Always respond with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        {
          temperature: 0,
          reasoningEffort: "low",
          maxTokens: 10000,
          frequencyPenalty: 0.2,
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "combined_extraction",
              schema: COMBINED_EXTRACTION_SCHEMA,
              strict: true,
            },
          },
        }
      );

      const extracted = JSON.parse(response);

      // Strip extra quotes from entity names and types
      const entities = (extracted.entities || []).map((entity: Entity) => ({
        ...entity,
        name: stripExtraQuotes(entity.name),
        type: stripExtraQuotes(entity.type),
      }));

      // Strip extra quotes from relationship fields
      const relationships = (extracted.relationships || []).map(
        (rel: Relationship) => ({
          ...rel,
          source: stripExtraQuotes(rel.source),
          target: stripExtraQuotes(rel.target),
          type: stripExtraQuotes(rel.type),
        })
      );

      // Log with record context
      const recordInfo = recordContext
        ? ` for "${recordContext.recordTitle}" (ID: ${recordContext.recordId})`
        : "";
      logger.info({
        msg: `📊 Combined Extraction Results`,
        recordInfo,
        contentLength: content.length,
        entitiesExtracted: entities.length,
        relationships: relationships.length,
      });

      if (attempt > 1) {
        logger.debug({
          msg: `✅ Combined extraction succeeded on retry attempt ${attempt}/${maxRetries}`,
        });
      }

      return { entities, relationships };
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
        `❌ Failed to parse combined extraction response (attempt ${attempt}/${maxRetries})`
      );

      if (attempt === maxRetries) {
        logger.error(
          `❌ Combined extraction failed after ${maxRetries} attempts. Returning empty results.`
        );
        return { entities: [], relationships: [] };
      }

      const delayMs = 1000 * Math.pow(2, attempt - 1);
      logger.warn(
        `⚠️  Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
      );
      await sleep(delayMs);
    }
  }

  return { entities: [], relationships: [] };
}

/**
 * Extract entities and relationships using single-pass extraction with fallback entity recovery
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
  // Single-pass extraction (entities + relationships together)
  let { entities, relationships } = await extractBothFromContent(
    client,
    content,
    existingEntityTypes,
    existingRelationshipTypes,
    persona,
    maxRetries,
    recordContext
  );

  // Build a set of valid entity names (normalized) for validation
  const validEntityNames = new Set(
    entities.map((e) => normalizeEntityName(e.name))
  );

  // Find missing entities referenced in relationships and group by relationship
  const missingEntitiesMap = new Map<string, Relationship[]>();
  for (const rel of relationships) {
    const normalizedSource = normalizeEntityName(rel.source);
    const normalizedTarget = normalizeEntityName(rel.target);

    if (!validEntityNames.has(normalizedSource)) {
      if (!missingEntitiesMap.has(rel.source)) {
        missingEntitiesMap.set(rel.source, []);
      }
      missingEntitiesMap.get(rel.source)!.push(rel);
    }
    if (!validEntityNames.has(normalizedTarget)) {
      if (!missingEntitiesMap.has(rel.target)) {
        missingEntitiesMap.set(rel.target, []);
      }
      missingEntitiesMap.get(rel.target)!.push(rel);
    }
  }

  // Fallback extraction for missing entities
  if (missingEntitiesMap.size > 0) {
    // Build list of missing entity names
    const missingEntityNames = Array.from(missingEntitiesMap.keys());
    const recordInfo = recordContext
      ? ` for "${recordContext.recordTitle}" (ID: ${recordContext.recordId})`
      : "";

    logger.warn(
      `⚠️  Found ${missingEntitiesMap.size} missing entities in relationships${recordInfo}`
    );
    logger.warn(
      `   Missing entities: ${missingEntityNames
        .map((n) => `"${n}"`)
        .join(", ")}`
    );

    const fallbackLimit = 10; // Limit fallback attempts
    let fallbackCount = 0;
    let extractedCount = 0;
    let inferredCount = 0;

    for (const [missingName, relContexts] of missingEntitiesMap) {
      if (fallbackCount >= fallbackLimit) {
        logger.warn(
          `⚠️  Reached fallback limit (${fallbackLimit}), skipping remaining missing entities`
        );
        break;
      }

      // Use first relationship as context
      const relContext = `${relContexts[0].source} -[${relContexts[0].type}]-> ${relContexts[0].target}`;

      logger.debug({
        msg: `Attempting fallback extraction for: "${missingName}"`,
        context: relContext,
      });

      const entity = await extractMissingEntity(
        client,
        content,
        missingName,
        existingEntityTypes,
        relContext
      );

      if (entity) {
        entities.push(entity);
        validEntityNames.add(normalizeEntityName(entity.name));
        logger.info(
          `   ✅ Fallback extracted: "${entity.name}" (${entity.type})`
        );
        extractedCount++;
      } else {
        // Last resort: Create inferential entity
        const inferredEntity = createInferentialEntity(
          missingName,
          relContexts[0]
        );
        entities.push(inferredEntity);
        validEntityNames.add(normalizeEntityName(inferredEntity.name));
        logger.info(
          `   🔮 Inferential entity created: "${inferredEntity.name}" (${inferredEntity.type})`
        );
        inferredCount++;
      }

      fallbackCount++;
    }
  }

  // Validate relationships after fallback - filter out those with missing entities
  const validatedRelationships = relationships.filter((rel: Relationship) => {
    const normalizedSource = normalizeEntityName(rel.source);
    const normalizedTarget = normalizeEntityName(rel.target);

    const hasValidSource = validEntityNames.has(normalizedSource);
    const hasValidTarget = validEntityNames.has(normalizedTarget);

    if (!hasValidSource || !hasValidTarget) {
      logger.warn(
        `⚠️  Filtered invalid relationship - entity not found even after fallback:`
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

      return false;
    }

    return true;
  });

  const filteredCount = relationships.length - validatedRelationships.length;

  // Summary logging
  const recordInfo = recordContext
    ? `"${recordContext.recordTitle}" (ID: ${recordContext.recordId})`
    : "unknown record";
  logger.info({
    msg: `✅ Single-pass extraction complete`,
    recordInfo,
    entities: entities.length,
    relationships: relationships.length,
  });
  if (filteredCount > 0) {
    logger.warn({
      msg: "Filtered ${filteredCount} invalid relationships (entities not found)",
    });
  }

  return {
    entities,
    relationships: validatedRelationships,
  };
}
