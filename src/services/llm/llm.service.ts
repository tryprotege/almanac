import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Generic LLM Service - Provider-agnostic interface for LLM operations
 */
export class LLMService {
  private client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  /**
   * Generic chat completion
   */
  async chat(
    messages: ChatCompletionMessageParam[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: options?.model || "gpt-4o",
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      stream: false,
    });

    return completion.choices[0]?.message?.content || "";
  }

  /**
   * Extract entities from text using LLM
   */
  async extractEntities(text: string): Promise<{
    people: string[];
    organizations: string[];
    projects: string[];
    locations: string[];
  }> {
    const prompt = `Extract entities from the following text. Return as JSON with these keys: people, organizations, projects, locations.

Text: ${text.substring(0, 3000)}

Return only valid JSON, no other text.`;

    const response = await this.chat([
      {
        role: "system",
        content:
          "You are an entity extraction assistant. Always respond with valid JSON.",
      },
      { role: "user", content: prompt },
    ]);

    try {
      return JSON.parse(response);
    } catch {
      return { people: [], organizations: [], projects: [], locations: [] };
    }
  }

  /**
   * Extract relationships for graph database storage
   * Optimized for quick retrieval and smart graph queries
   */
  async extractRelationships(
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
          `${i + 1}. [${r.type}] ${r.title}: ${r.content.substring(0, 150)}`
      )
      .join("\n");

    const prompt = `You are a knowledge graph relationship extraction system. Your job is to identify semantic relationships between entities that will be stored in a graph database for efficient querying.

TASK: Analyze the source entity and identify ALL meaningful relationships with the target entities.

SOURCE ENTITY:
Type: ${sourceType}
Content: ${sourceContent.substring(0, 1500)}

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

    const response = await this.chat(
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

  /**
   * Generate a summary/title for content
   */
  async generateTitle(
    content: string,
    maxLength: number = 100
  ): Promise<string> {
    const prompt = `Generate a concise, descriptive title (max ${maxLength} chars) for this content:

${content.substring(0, 1000)}

Return only the title, no other text.`;

    const response = await this.chat([{ role: "user", content: prompt }], {
      temperature: 0.3,
    });

    return response.trim().substring(0, maxLength);
  }

  /**
   * Classify content into categories
   */
  async classify(
    content: string,
    categories: string[]
  ): Promise<{ category: string; confidence: number }> {
    const prompt = `Classify this content into one of these categories: ${categories.join(
      ", "
    )}

Content: ${content.substring(0, 1000)}

Return JSON with: category (one from the list), confidence (0.0-1.0)`;

    const response = await this.chat([
      {
        role: "system",
        content:
          "You are a classification assistant. Always respond with valid JSON.",
      },
      { role: "user", content: prompt },
    ]);

    try {
      return JSON.parse(response);
    } catch {
      return { category: categories[0], confidence: 0.5 };
    }
  }

  /**
   * Answer questions about content using RAG
   */
  async answerQuestion(question: string, context: string[]): Promise<string> {
    const prompt = `Answer the following question based on the provided context.

Question: ${question}

Context:
${context.join("\n\n")}

Answer:`;

    return this.chat([
      {
        role: "system",
        content:
          "You are a helpful assistant that answers questions based on provided context. If you cannot answer from the context, say so.",
      },
      { role: "user", content: prompt },
    ]);
  }
}
