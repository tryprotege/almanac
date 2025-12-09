import OpenAI from "openai";
import { Entity, Relationship } from "./entity-deduplication.js";
import { chat } from "../../../llm/llm.js";
import logger from "../../../../utils/logger.js";
import sleep from "../../../../utils/sleep.js";

// TODO: Replace with token counting based on model's context window
// Most models support 128K tokens (~512K chars), but varies by model
const MAX_CONTENT_LENGTH = 200_000;

// ============================================================================
// Unified Graph Extraction Functions (No Chunking)
// ============================================================================

/**
 * Build LightRAG-inspired extraction prompt
 */
function buildExtractionPrompt(
  content: string,
  entityTypes: string[],
  relationshipTypes: string[],
  persona?: string
): string {
  const personaContext = persona ? `USER CONTEXT:\n${persona}\n\n` : "";

  return `${personaContext}---Goal---
Given a text document, extract entities and HIGH-VALUE relationships for a knowledge graph.

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

---Entity Types---
${entityTypes.join(", ")}

---Relationship Types---
${relationshipTypes.join(", ")}

PRIORITIZE these high-value relationship patterns:
- Hierarchical: REPORTS_TO, MANAGES, PART_OF, MEMBER_OF
- Dependencies: BLOCKS, BLOCKED_BY, REQUIRES, DEPENDS_ON
- Actions: ASSIGNED_TO, CREATED_BY, APPROVED_BY, REVIEWED_BY
- Temporal: SUPERSEDES, REPLACES, VERSION_OF
- Domain: REGULATES, APPLIES_TO, IMPLEMENTS, CITES

---Steps---
1. Identify entities:
   - Extract named entities (people, organizations, projects, concepts)
   - Use CONSISTENT NAMING (important for relationship matching!)
   - Provide brief description for each

2. Identify HIGH-VALUE relationships:
   - Focus on structural, causal, and hierarchical connections
   - Use relationship types above when applicable
   - Strength scoring (only include if >= 5):
     * 9-10: Explicit direct mention
     * 7-8: Strong contextual evidence
     * 5-6: Clear semantic connection
     * Below 5: SKIP (too weak)
   - ENSURE source/target names EXACTLY MATCH entity names

---Examples of GOOD relationships (extract these)---
✅ "Alex reports to Sarah" → { source: "Alex", target: "Sarah", type: "REPORTS_TO", strength: 10 }
✅ "Project X depends on completing Task Y" → { source: "Project X", target: "Task Y", type: "DEPENDS_ON", strength: 9 }
✅ "GDPR applies to EU residents" → { source: "GDPR", target: "EU residents", type: "APPLIES_TO", strength: 10 }

---Examples of BAD relationships (skip these)---
❌ "Alex and Sarah are mentioned together" → SKIP (use embeddings for co-occurrence)
❌ "Project X is related to Marketing" → SKIP (too vague, embeddings handle this)
❌ "Document mentions Company Y" → SKIP (just a mention, no structural relationship)

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
 * Extract entities and relationships from full document with retry logic
 * LightRAG-inspired unified extraction
 */
export async function extractGraphFromContent(
  client: OpenAI,
  content: string,
  existingEntityTypes: string[],
  existingRelationshipTypes: string[],
  persona?: string,
  maxRetries: number = 3
): Promise<{
  entities: Entity[];
  relationships: Relationship[];
}> {
  let response = ""; // Declare outside try block for error logging

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = buildExtractionPrompt(
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
              "You are a knowledge graph extraction system. Extract structured entities and relationships from content. Always respond with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        {
          temperature: 0.1,
          reasoning_effort: "low",
        }
      );

      const cleaned = response
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      const extracted = JSON.parse(cleaned);

      // Diagnostic logging
      logger.info(`📊 LLM Extraction Results:`);
      logger.info(`   - Content length: ${content.length} chars`);
      logger.info(
        `   - Entities extracted: ${extracted.entities?.length || 0}`
      );
      logger.info(
        `   - Relationships extracted: ${extracted.relationships?.length || 0}`
      );

      if (extracted.relationships && extracted.relationships.length > 0) {
        logger.info(
          `   - Sample relationships: ${JSON.stringify(
            extracted.relationships.slice(0, 3),
            null,
            2
          )}`
        );
      }

      // Success! Log if this was a retry
      if (attempt > 1) {
        logger.info(
          `✅ Extraction succeeded on retry attempt ${attempt}/${maxRetries}`
        );
      }

      return {
        entities: extracted.entities || [],
        relationships: extracted.relationships || [],
      };
    } catch (err) {
      // Log the full raw response and error details
      logger.error(
        {
          err,
          attempt,
          maxRetries,
          rawResponse: response,
          responseLength: response?.length,
          responsePreview: response?.substring(0, 1000),
          responseSuffix: response?.substring(
            Math.max(0, (response?.length || 0) - 500)
          ),
        },
        `❌ Failed to parse extraction response (attempt ${attempt}/${maxRetries})`
      );

      // Log the full response separately for easier copying
      logger.error(
        `\n${"=".repeat(
          80
        )}\nFULL RAW LLM RESPONSE (attempt ${attempt}/${maxRetries}):\n${"=".repeat(
          80
        )}\n${response}\n${"=".repeat(80)}\n`
      );

      // If this was the last attempt, give up
      if (attempt === maxRetries) {
        logger.error(
          `❌ Extraction failed after ${maxRetries} attempts. Returning empty results.`
        );
        return {
          entities: [],
          relationships: [],
        };
      }

      // Otherwise, retry with exponential backoff
      const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      logger.warn(
        `⚠️  Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
      );
      await sleep(delayMs);
    }
  }

  // Fallback (should never reach here due to the return in the loop)
  return {
    entities: [],
    relationships: [],
  };
}
