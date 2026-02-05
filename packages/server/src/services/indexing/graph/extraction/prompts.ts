/**
 * Prompt templates for LLM-based graph extraction
 */

// TODO: Replace with token counting based on model's context window
// Most models support 128K tokens (~512K chars), but varies by model
const MAX_CONTENT_LENGTH = 200_000;

/**
 * Build combined extraction prompt (entities + relationships in one call)
 */
export function buildCombinedExtractionPrompt(
  content: string,
  entityTypes: string[],
  relationshipTypes: string[],
  persona?: string,
): string {
  const personaContext = persona ? `USER CONTEXT:\n${persona}\n\n` : '';

  return `${personaContext}---Goal---
Extract named entities AND their relationships from the text document for a knowledge graph.

---Entity Types---
${entityTypes.join(', ')}

You may discover new entity types not in this list.

---Relationship Types---
${relationshipTypes.join(', ')}

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
export function buildSingleEntityExtractionPrompt(
  content: string,
  entityName: string,
  existingEntityTypes: string[],
  relationshipContext?: string,
): string {
  const contextSection = relationshipContext
    ? `---Why We're Looking---
A relationship in the text references "${entityName}":
${relationshipContext}

This suggests the entity exists in the text.

`
    : '';

  return `---Goal---
Find and extract information about a specific entity from the text.

---Entity Name to Find---
"${entityName}"

${contextSection}---Known Entity Types---
${existingEntityTypes.join(', ')}

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
