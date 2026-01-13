# Query Best Practices

Optimize your queries for speed, accuracy, and cost-effectiveness.

## Quick Wins

### 1. Choose the Right Mode

**Don't** always use `mix` mode:

```typescript
// ❌ BAD - Slow and expensive for simple queries
await query({ query: "Alice", mode: "mix" });
```

**Do** match mode to query type:

```typescript
// ✅ GOOD - Fast for entity lookups
await query({ query: "Alice", mode: "local" });

// ✅ GOOD - Fast for keywords
await query({ query: "API refactor", mode: "naive" });

// ✅ GOOD - Use mix for complex questions
await query({
  query: "What did Alice say about the API refactor last week?",
  mode: "mix",
});
```

### 2. Adjust `top_k` Based on Needs

**Don't** always use the maximum:

```typescript
// ❌ BAD - Unnecessarily slow
await query({ query: "test", top_k: 200 });
```

**Do** start small and increase if needed:

```typescript
// ✅ GOOD - Fast for simple queries
await query({ query: "test", top_k: 30 });

// ✅ GOOD - More thorough for complex queries
await query({
  query: "complex question needing context",
  top_k: 100,
});
```

### 3. Cache Frequently Asked Questions

```typescript
const cache = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

const cachedQuery = async (question: string) => {
  const cached = cache.get(question);
  if (cached && Date.now() - cached.timestamp < TTL) {
    return cached.results;
  }

  const results = await query(question);
  cache.set(question, { results, timestamp: Date.now() });
  return results;
};
```

### 4. Use Progressive Enhancement

Start fast, upgrade if needed:

```typescript
const smartQuery = async (question: string) => {
  // Try fast mode first
  let results = await query({ query: question, mode: "naive", top_k: 30 });

  // Check if results are good enough
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;

  // Upgrade to more accurate mode if needed
  if (avgScore < 0.7 || results.length < 5) {
    results = await query({ query: question, mode: "mix", top_k: 60 });
  }

  return results;
};
```

## Query Mode Selection

### Decision Tree

```
Is it a simple keyword search?
└─ YES → Use "naive" mode (fastest)

Is it asking about a specific person/entity?
└─ YES → Use "local" mode (entity-focused)

Is it asking about relationships between things?
└─ YES → Use "global" mode (relationship-focused)

Is it a moderately complex question?
└─ YES → Use "hybrid" mode (balanced)

Is accuracy critical and cost/latency acceptable?
└─ YES → Use "mix" mode (most accurate)
```

### Mode Comparison Table

| Mode   | Speed  | Accuracy | Cost   | Best For                                |
| ------ | ------ | -------- | ------ | --------------------------------------- |
| naive  | ⚡⚡⚡ | ⭐       | 💰     | Keywords, simple searches               |
| local  | ⚡⚡   | ⭐⭐     | 💰     | "Who/what is X?", entity lookup         |
| global | ⚡⚡   | ⭐⭐     | 💰     | "How does X relate to Y?"               |
| hybrid | ⚡     | ⭐⭐⭐   | 💰💰   | General queries, balanced needs         |
| mix    | ⚡     | ⭐⭐⭐⭐ | 💰💰💰 | Complex questions, accuracy is critical |

### Real-World Examples

#### ✅ Good Mode Choices

```typescript
// Entity lookup → local
query({ query: "Alice", mode: "local" });
query({ query: "What is Alice working on?", mode: "local" });

// Relationship → global
query({ query: "How does auth connect to billing?", mode: "global" });
query({ query: "What depends on the API?", mode: "global" });

// Keywords → naive
query({ query: "API documentation", mode: "naive" });
query({ query: "bug fix", mode: "naive" });

// Complex questions → mix
query({
  query: "What did Alice say about the API refactor last month?",
  mode: "mix",
});
```

#### ❌ Poor Mode Choices

```typescript
// ❌ Overkill - simple keyword doesn't need graph
query({ query: "bug", mode: "mix" }); // Use naive instead

// ❌ Underpowered - complex question needs more
query({
  query: "What were the main concerns raised about the API refactor?",
  mode: "naive", // Use mix instead
});

// ❌ Wrong focus - asking about relationships but using entity mode
query({
  query: "How do these components interact?",
  mode: "local", // Use global or hybrid instead
});
```

## Parameter Tuning

### `top_k` (Candidates Retrieved)

**Purpose**: How many candidates to retrieve before reranking

**Guidelines**:

```typescript
// Quick answer, chatbot response
top_k: 20 - 40;

// Standard queries (recommended)
top_k: 60 - 80;

// Research, comprehensive answers
top_k: 100 - 200;
```

**Example**:

```typescript
// User asking quick question in chatbot
await query({
  query: "What's our return policy?",
  mode: "naive",
  top_k: 30, // Fast, focused
});

// User doing research
await query({
  query: "Analyze all discussions about API security",
  mode: "hybrid",
  top_k: 150, // Comprehensive
});
```

### `chunk_top_k` (Final Results)

**Purpose**: How many results to return to user

**Guidelines**:

```typescript
// Chatbot, concise answer
chunk_top_k: 5 - 10;

// Standard display (recommended)
chunk_top_k: 20;

// Research, comprehensive view
chunk_top_k: 50 - 100;
```

**Example**:

```typescript
// Display in UI with limited space
await query({
  query: "recent updates",
  chunk_top_k: 10,
});

// Export for analysis
await query({
  query: "all API discussions",
  chunk_top_k: 100,
});
```

### `score_threshold` (Quality Filter)

**Purpose**: Minimum relevance score (0.0-1.0)

**Guidelines**:

```typescript
// High recall (more results, some may be less relevant)
score_threshold: 0.3 - 0.4;

// Balanced (recommended)
score_threshold: 0.5;

// High precision (fewer but more relevant results)
score_threshold: 0.7 - 0.8;
```

**Example**:

```typescript
// Chatbot - want high-quality answers only
await query({
  query: "how to reset password",
  score_threshold: 0.7, // Only confident answers
});

// Research - want to see everything
await query({
  query: "mentions of security",
  score_threshold: 0.3, // Cast wide net
});
```

## Performance Optimization

### 1. Parallel Queries

When querying multiple sources:

```typescript
// ❌ BAD - Sequential (slow)
const slack = await query({ query: q, source: "slack" });
const github = await query({ query: q, source: "github" });
const notion = await query({ query: q, source: "notion" });

// ✅ GOOD - Parallel (3x faster)
const [slack, github, notion] = await Promise.all([
  query({ query: q, source: "slack" }),
  query({ query: q, source: "github" }),
  query({ query: q, source: "notion" }),
]);
```

### 2. Request Batching

For multiple queries:

```typescript
// ❌ BAD - Many small requests
for (const q of questions) {
  await query(q); // Network overhead per request
}

// ✅ GOOD - Batch request
const results = await Promise.all(questions.map((q) => query(q)));
```

### 3. Debounce User Input

For search-as-you-type:

```typescript
import { debounce } from "lodash";

const debouncedQuery = debounce(async (searchTerm: string) => {
  const results = await query(searchTerm);
  updateUI(results);
}, 300); // Wait 300ms after user stops typing
```

### 4. Prefetch Common Queries

```typescript
// On app load, prefetch frequently asked questions
const commonQueries = [
  "What's our return policy?",
  "How do I contact support?",
  "Where is my order?",
];

// Warm up cache
await Promise.all(commonQueries.map((q) => query(q)));
```

### 5. Use Streaming for Long Results

```typescript
// For real-time display
const streamResults = async (question: string) => {
  const response = await fetch("/api/query/stream", {
    method: "POST",
    body: JSON.stringify({ query: question }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    displayResult(JSON.parse(chunk));
  }
};
```

## Cost Optimization

### 1. Minimize Reranking

```typescript
// ❌ Expensive - reranking everything
await query({ mode: "mix", enable_rerank: true }); // Uses LLM

// ✅ Cheaper - rerank only when needed
const mode = isComplexQuery ? "mix" : "hybrid";
await query({ mode, enable_rerank: isComplexQuery });
```

### 2. Use Appropriate Embedding Models

```bash
# Most accurate but expensive
LLM_EMBEDDING_MODEL=text-embedding-3-large  # $0.13/1M tokens

# Balanced (recommended)
LLM_EMBEDDING_MODEL=text-embedding-3-small  # $0.02/1M tokens

# Local and free
LLM_EMBEDDING_MODEL=nomic-embed-text  # Ollama, no cost
```

### 3. Batch Indexing

```typescript
// ❌ Expensive - index one at a time
for (const doc of documents) {
  await indexDocument(doc); // Separate API calls
}

// ✅ Cheaper - batch indexing
await indexDocuments(documents); // Single API call
```

## Error Handling

### 1. Graceful Degradation

```typescript
const robustQuery = async (question: string) => {
  try {
    // Try best mode first
    return await query({ query: question, mode: "mix" });
  } catch (error) {
    console.warn("Mix mode failed, falling back to hybrid");
    try {
      return await query({ query: question, mode: "hybrid" });
    } catch (error) {
      console.warn("Hybrid failed, falling back to naive");
      return await query({ query: question, mode: "naive" });
    }
  }
};
```

### 2. Timeout Handling

```typescript
const queryWithTimeout = async (question: string, timeout = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch("/api/query", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ query: question }),
    });
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Query timeout - try a simpler query");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
```

### 3. Retry Logic

```typescript
const queryWithRetry = async (question: string, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await query(question);
    } catch (error) {
      if (attempt === maxRetries) throw error;

      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
```

## Query Optimization Patterns

### Pattern 1: Query Expansion

Expand vague queries for better results:

```typescript
const expandQuery = (query: string): string => {
  const expansions = {
    api: "API OR REST API OR GraphQL API",
    bug: "bug OR issue OR error OR problem",
    docs: "documentation OR docs OR guide OR tutorial",
  };

  return Object.entries(expansions).reduce(
    (q, [key, expansion]) => q.replace(new RegExp(key, "gi"), expansion),
    query
  );
};

// Usage
const results = await query({
  query: expandQuery("api bug"),
  // "API OR REST API OR GraphQL API bug OR issue OR error"
  mode: "hybrid",
});
```

### Pattern 2: Query Rewriting

Rewrite natural language to search-friendly format:

```typescript
const rewriteQuery = (query: string): string => {
  // "What did Alice say about X?" → "Alice X"
  return query
    .replace(/what did (.*?) say about/i, "$1")
    .replace(/how does (.*?) work/i, "$1")
    .replace(/when was (.*?) created/i, "$1")
    .trim();
};
```

### Pattern 3: Multi-Step Queries

Break complex queries into steps:

```typescript
const complexQuery = async (question: string) => {
  // Step 1: Find relevant entities
  const entities = await query({
    query: question,
    mode: "local",
    chunk_top_k: 5,
  });

  // Step 2: Get relationships for those entities
  const entityNames = entities.map((r) => r.entities).flat();
  const relationships = await query({
    query: entityNames.join(" "),
    mode: "global",
    chunk_top_k: 10,
  });

  // Step 3: Combine and rerank
  const combined = [...entities, ...relationships];
  return combined.sort((a, b) => b.score - a.score).slice(0, 20);
};
```

## Common Pitfalls

### ❌ Don't: Always Use Maximum Settings

```typescript
// Slow and expensive
await query({
  query: "test",
  mode: "mix",
  top_k: 200,
  chunk_top_k: 100,
  enable_rerank: true,
});
```

### ✅ Do: Match Settings to Needs

```typescript
// Fast and appropriate
await query({
  query: "test",
  mode: "naive",
  top_k: 30,
  chunk_top_k: 10,
});
```

### ❌ Don't: Ignore Error Responses

```typescript
// No error handling
const results = await query(userInput);
displayResults(results.results); // Might crash
```

### ✅ Do: Handle Errors Gracefully

```typescript
try {
  const results = await query(userInput);
  if (results.results.length === 0) {
    showMessage("No results found");
  } else {
    displayResults(results.results);
  }
} catch (error) {
  showError("Search failed. Please try again.");
}
```

### ❌ Don't: Query Without Validation

```typescript
// Dangerous
await query({ query: userInput });
```

### ✅ Do: Validate and Sanitize

```typescript
const safeQuery = (userInput: string) => {
  // Validate
  if (!userInput || userInput.trim().length < 2) {
    throw new Error("Query too short");
  }

  if (userInput.length > 500) {
    throw new Error("Query too long");
  }

  // Sanitize
  const sanitized = userInput.trim().substring(0, 500);

  return query({ query: sanitized });
};
```

## Monitoring & Analytics

### Track Query Performance

```typescript
const monitoredQuery = async (question: string, mode: string) => {
  const start = Date.now();

  try {
    const results = await query({ query: question, mode });
    const duration = Date.now() - start;

    // Log metrics
    analytics.track("query", {
      duration,
      mode,
      resultsCount: results.results.length,
      avgScore:
        results.results.reduce((s, r) => s + r.score, 0) /
        results.results.length,
    });

    return results;
  } catch (error) {
    analytics.track("query_error", {
      duration: Date.now() - start,
      mode,
      error: error.message,
    });
    throw error;
  }
};
```

### A/B Testing Query Modes

```typescript
const abTestQuery = async (question: string) => {
  const mode = Math.random() < 0.5 ? "hybrid" : "mix";

  const results = await query({ query: question, mode });

  // Track which mode performed better
  analytics.track("query_ab_test", {
    mode,
    resultsCount: results.results.length,
    avgScore:
      results.results.reduce((s, r) => s + r.score, 0) / results.results.length,
  });

  return results;
};
```

## Summary: Quick Reference

### Speed Priority

```typescript
{
  mode: "naive",
  top_k: 30,
  chunk_top_k: 10,
  enable_rerank: false
}
```

### Accuracy Priority

```typescript
{
  mode: "mix",
  top_k: 100,
  chunk_top_k: 20,
  enable_rerank: true
}
```

### Balanced (Recommended)

```typescript
{
  mode: "hybrid",
  top_k: 60,
  chunk_top_k: 20,
  enable_rerank: false
}
```

### Cost Priority

```typescript
{
  mode: "naive",  // No LLM usage
  top_k: 40,
  chunk_top_k: 10,
  enable_rerank: false  // No LLM reranking
}
```

## Next Steps

- **[API Reference](api.md)** - Complete parameter documentation
- **[Query Modes](../core-concepts/lightrag.md)** - Detailed mode explanations
- **[Examples](../examples/query-modes.md)** - Real-world usage examples
