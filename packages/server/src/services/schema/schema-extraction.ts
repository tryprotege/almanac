import OpenAI from "openai";
import {
  GraphEntityType,
  GraphRelationshipType,
} from "../../models/graph-schema.model.js";
import { chat } from "../llm/llm.js";

// TODO: Replace with token counting based on model's context window
// Most models support 128K tokens (~512K chars), but varies by model
const MAX_CONTENT_LENGTH = 200_000;

// ============================================================================
// Schema Learning Extraction Functions
// ============================================================================

/**
 * Extract entity types from content using AI
 */
export async function extractEntitiesFromContent(
  client: OpenAI,
  content: string,
  existingTypes: string[],
  persona?: string
): Promise<GraphEntityType[]> {
  const personaContext = persona ? `USER CONTEXT:\n${persona}\n\n` : "";

  const prompt = `${personaContext}You are analyzing content to extract domain-specific entity types.

CONTENT:
${content.substring(0, MAX_CONTENT_LENGTH)}

EXISTING ENTITY TYPES:
${existingTypes.join(", ")}

TASK:
1. Identify named entities and concepts in the content
2. Group similar entities into types
${
  persona
    ? "3. Prioritize entities relevant to the user context"
    : "3. Focus on the most significant entities"
}
4. Avoid duplicating existing types unless you find new instances

OUTPUT FORMAT (JSON array):
[
  {
    "name": "Feature",
    "instances": ["Two-factor auth", "API rate limiting"],
    "confidence": 0.9,
    "description": "Product features and capabilities"
  }
]

Return only valid JSON, no other text.`;

  const response = await chat(
    client,
    [
      {
        role: "system",
        content:
          "You are an entity extraction system for knowledge graphs. Extract structured entities from content. Always respond with valid JSON array.",
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

    // Convert to EntityType format
    return extracted.map((item: any) => ({
      name: item.name,
      description: item.description,
      mcpSource: "ai",
      properties: [],
    }));
  } catch {
    return [];
  }
}

/**
 * Extract relationship types from content using AI
 */
export async function extractRelationshipsFromContent(
  client: OpenAI,
  content: string,
  entities: Array<{ name: string; instances: string[] }>,
  existingRelationships: GraphRelationshipType[],
  persona?: string
): Promise<GraphRelationshipType[]> {
  const personaContext = persona ? `USER CONTEXT:\n${persona}\n\n` : "";

  const entitiesList = entities
    .map((e) => `${e.name}: ${e.instances.join(", ")}`)
    .join("\n");

  const existingRelsList = existingRelationships.map((r) => r.name).join(", ");

  const prompt = `${personaContext}You are analyzing content to extract semantic relationships between entities.

CONTENT:
${content.substring(0, MAX_CONTENT_LENGTH)}

DISCOVERED ENTITIES:
${entitiesList}

EXISTING RELATIONSHIPS:
${existingRelsList}

TASK:
1. Identify how entities relate to each other in the content
2. Create relationship types that capture these connections
${
  persona
    ? "3. Focus on relationships useful for the user's context"
    : "3. Focus on meaningful, queryable relationships"
}
4. Avoid generic relationships like "RELATED_TO" unless specific

OUTPUT FORMAT (JSON array):
[
  {
    "name": "IMPLEMENTS",
    "sourceTypes": ["Developer"],
    "targetTypes": ["Feature"],
    "confidence": 0.85,
    "description": "Developer implements or builds a feature",
    "bidirectional": false
  }
]

Return only valid JSON, no other text.`;

  const response = await chat(
    client,
    [
      {
        role: "system",
        content:
          "You are a relationship extraction system for knowledge graphs. Extract semantic relationships between entities. Always respond with valid JSON array.",
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

    // Convert to RelationshipType format
    return extracted.map((item: any) => ({
      name: item.name,
      description: item.description,
      sourceTypes: item.sourceTypes,
      targetTypes: item.targetTypes,
      bidirectional: item.bidirectional,
      mcpSource: "ai",
    }));
  } catch {
    return [];
  }
}

/**
 * Extract graph relationships between specific entities
 * Used for graph indexing (finding actual instances, not types)
 */
export async function extractGraphRelationships(
  client: OpenAI,
  sourceId: string,
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
