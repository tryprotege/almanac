import nlp from "compromise";

export interface ExtractedKeywords {
  high_level: string[];
  low_level: string[];
}

/**
 * Extract keywords using compromise NLP for high accuracy
 * - High-level: Conceptual/thematic keywords (topics, actions, concepts)
 * - Low-level: Specific entities (people, places, organizations, dates)
 */
export function extractKeywordsNER(query: string): ExtractedKeywords {
  const doc = nlp(query);

  // ============================================
  // LOW-LEVEL: Specific Entities
  // ============================================

  const lowLevel = new Set<string>();

  // 1. Named entities - people
  doc.people().forEach((person) => {
    lowLevel.add(person.text("normal"));
  });

  // 2. Named entities - places
  doc.places().forEach((place) => {
    lowLevel.add(place.text("normal"));
  });

  // 3. Named entities - organizations
  doc.organizations().forEach((org) => {
    lowLevel.add(org.text("normal"));
  });

  // 4. Proper nouns (capitalized names not caught above)
  doc.match("#ProperNoun").forEach((noun) => {
    lowLevel.add(noun.text("normal"));
  });

  // 5. Important nouns (multi-word phrases preferred)
  doc.match("#Noun+").forEach((nounPhrase) => {
    const text = nounPhrase.text("normal");
    if (text.split(" ").length > 1) {
      // Prefer phrases
      lowLevel.add(text);
    }
  });

  // 6. Single important nouns
  doc.nouns().forEach((noun) => {
    const text = noun.text("normal");
    if (text.length > 3) {
      // Filter short words
      lowLevel.add(text);
    }
  });

  // ============================================
  // HIGH-LEVEL: Conceptual/Thematic Keywords
  // ============================================

  const highLevel = new Set<string>();

  // 1. Topics (compromise auto-detects important topics)
  doc.topics().forEach((topic) => {
    highLevel.add(topic.text("normal"));
  });

  // 2. Actions (verbs + their objects)
  doc.match("#Verb #Noun+").forEach((action) => {
    highLevel.add(action.text("normal"));
  });

  // 3. Key verbs (actions)
  doc.verbs().forEach((verb) => {
    const text = verb.text("normal");
    if (text.length > 3) {
      highLevel.add(text);
    }
  });

  // 4. Adjective + Noun combinations (descriptive concepts)
  doc.match("#Adjective+ #Noun+").forEach((concept) => {
    highLevel.add(concept.text("normal"));
  });

  // 5. Important adjectives (descriptive themes)
  doc.adjectives().forEach((adj) => {
    const text = adj.text("normal");
    if (text.length > 4) {
      // Filter short adjectives
      highLevel.add(text);
    }
  });

  // ============================================
  // Post-processing
  // ============================================

  // Remove stopwords and clean
  const stopwords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
  ]);

  const cleanKeywords = (keywords: Set<string>) => {
    return Array.from(keywords)
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 2)
      .filter((k) => !stopwords.has(k))
      .filter((k) => !/^\d+$/.test(k)); // Remove pure numbers
  };

  const highLevelArray = cleanKeywords(highLevel);
  const lowLevelArray = cleanKeywords(lowLevel);

  // Remove duplicates between high/low level (prefer low-level for entities)
  const uniqueHighLevel = highLevelArray.filter(
    (k) => !lowLevelArray.includes(k)
  );

  return {
    high_level: uniqueHighLevel.slice(0, 5), // Top 5 conceptual keywords
    low_level: lowLevelArray.slice(0, 7), // Top 7 entity keywords
  };
}
