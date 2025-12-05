import OpenAI from "openai";
import { Entity, Relationship } from "./entity-deduplication.js";
import { chat } from "../../../llm/llm.js";
import logger from "../../../../utils/logger.js";

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

3. Content keywords:
   - High-level themes and topics

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
      "keywords": ["development", "backend"],
      "strength": 9
    }
  ],
  "keywords": ["engineering", "backend"]
}

---Real Data---
Text:
${content.substring(0, MAX_CONTENT_LENGTH)}

---Output---
Return ONLY valid JSON, no other text.`;
}

/**
 * Extract entities and relationships from full document (no chunking)
 * LightRAG-inspired unified extraction
 */
export async function extractGraphFromContent(
  client: OpenAI,
  content: string,
  existingEntityTypes: string[],
  existingRelationshipTypes: string[],
  persona?: string
): Promise<{
  entities: Entity[];
  relationships: Relationship[];
  keywords: string[];
}> {
  const prompt = buildExtractionPrompt(
    content,
    existingEntityTypes,
    existingRelationshipTypes,
    persona
  );

  const response = await chat(
    client,
    [
      {
        role: "system",
        content:
          "You are a knowledge graph extraction system. Extract structured entities and relationships from content. Always respond with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0.1 }
  );

  try {
    const cleaned = response
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const extracted = JSON.parse(cleaned);

    // Diagnostic logging
    logger.log(`📊 LLM Extraction Results:`);
    logger.log(`   - Content length: ${content.length} chars`);
    logger.log(`   - Entities extracted: ${extracted.entities?.length || 0}`);
    logger.log(
      `   - Relationships extracted: ${extracted.relationships?.length || 0}`
    );

    if (extracted.relationships && extracted.relationships.length > 0) {
      logger.log(
        `   - Sample relationships:`,
        JSON.stringify(extracted.relationships.slice(0, 3), null, 2)
      );
    }

    return {
      entities: extracted.entities || [],
      relationships: extracted.relationships || [],
      keywords: extracted.keywords || [],
    };
  } catch (err) {
    logger.error({ err }, "Failed to parse extraction response");
    return {
      entities: [],
      relationships: [],
      keywords: [],
    };
  }
}

/**
 * Extract graph relationships between specific entities
 * Used for graph indexing (finding actual instances, not types)
 */
export async function extractGraphRelationships(
  client: OpenAI,
  sourceContent: string,
  sourceType: string,
  targetResources: Array<{
    id: string;
    title: string;
    type: string;
    content: string;
  }>,
  validRelationshipTypes: Array<{
    name: string;
    description: string;
    sourceTypes: string[];
    targetTypes: string[];
  }>
): Promise<
  Array<{
    targetId: string;
    type: string;
    confidence: number;
  }>
> {
  // Filter valid relationships for this source type
  const applicableRelTypes = validRelationshipTypes.filter((rel) =>
    rel.sourceTypes.includes(sourceType)
  );

  if (applicableRelTypes.length === 0) {
    return [];
  }

  // Build relationship type documentation
  const relationshipDocs = applicableRelTypes
    .map(
      (rel, i) =>
        `${i + 1}. ${rel.name}: ${
          rel.description
        } (connects ${rel.sourceTypes.join(",")} → ${rel.targetTypes.join(
          ","
        )})`
    )
    .join("\n");

  // Build target resources list
  const targetsList = targetResources
    .map(
      (r, i) =>
        `${i + 1}. [${r.type}] ${r.title}: ${r.content.substring(
          0,
          MAX_CONTENT_LENGTH
        )}`
    )
    .join("\n");

  const prompt = `You are a knowledge graph relationship extraction system. Your job is to identify semantic relationships between entities that will be stored in a graph database for efficient querying.

TASK: Analyze the source entity and identify ALL meaningful relationships with the target entities.

SOURCE ENTITY:
Type: ${sourceType}
Content: ${sourceContent.substring(0, MAX_CONTENT_LENGTH)}

TARGET ENTITIES:
${targetsList}

VALID RELATIONSHIP TYPES:
${relationshipDocs}

INSTRUCTIONS:
1. Only use the relationship types listed above
2. Only create relationships where there is clear semantic meaning
3. Assign confidence scores:
   - 0.9-1.0: Explicit mention or direct reference
   - 0.7-0.89: Strong contextual evidence
   - 0.5-0.69: Moderate semantic similarity or indirect reference
   - Below 0.5: Do not create (too weak)

4. Consider these relationship patterns:
   - BLOCKS/DEPENDS_ON: One entity must wait for another
   - MENTIONS: Direct reference by name/ID
   - ASSIGNED_TO: Clear ownership or responsibility
   - PART_OF: Hierarchical containment
   - RELATED_TO: Topical or semantic similarity
   - AUTHORED_BY: Creation or ownership attribution

GRAPH DATABASE OPTIMIZATION:
- Relationships enable fast graph traversal queries like "Show me all tasks blocked by this issue"
- Each relationship should have clear semantic value for querying
- Avoid creating redundant or overly generic relationships

OUTPUT FORMAT:
Return a JSON array of objects with:
- targetId: number (1 to ${targetResources.length})
- type: string (must be from VALID RELATIONSHIP TYPES)
- confidence: number (0.5 to 1.0)

Return empty array [] if no relationships found.

EXAMPLES:
[{"targetId": 2, "type": "BLOCKS", "confidence": 0.95}]
[{"targetId": 1, "type": "MENTIONS", "confidence": 0.85}, {"targetId": 3, "type": "RELATED_TO", "confidence": 0.72}]
[]`;

  const response = await chat(
    client,
    [
      {
        role: "system",
        content:
          "You are a precise relationship extraction system for graph databases. Extract only high-confidence, semantically meaningful relationships. Always respond with valid JSON array.",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0.1 } // Low temperature for consistency
  );

  try {
    const relationships = JSON.parse(response);
    // Map numeric IDs back to actual resource IDs and filter by confidence
    return relationships
      .map((rel: any) => ({
        targetId: targetResources[rel.targetId - 1]?.id,
        type: rel.type,
        confidence: rel.confidence,
      }))
      .filter((rel: any) => rel.targetId && rel.confidence >= 0.5);
  } catch {
    return [];
  }
}
