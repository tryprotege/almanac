# Query Mode Comparison

This guide demonstrates all 5 query modes using real examples, helping you choose the right mode for your use case.

## Test Dataset

For these examples, we'll use a Slack workspace with the following data:

- **Channels**: #engineering, #product, #general
- **Team Members**: Alice (backend), Bob (frontend), Carol (product)
- **Recent Discussions**:
  - API refactor planning
  - Performance issues
  - New feature launch

## Example 1: Simple Keyword Search

**Question**: _"API refactor"_

### Naive Mode ⚡

```bash
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "API refactor",
    "mode": "naive",
    "top_k": 5
  }'
```

**Results**:

```json
{
  "results": [
    {
      "title": "Alice in #engineering",
      "content": "We should start the API refactor next sprint...",
      "score": 0.87
    },
    {
      "title": "Bob in #engineering",
      "content": "The current API structure is hard to maintain...",
      "score": 0.82
    }
  ],
  "mode": "naive",
  "processingTime": 78
}
```

**Analysis**: Fast and simple. Returns documents with matching keywords. Good for quick lookups when you know the exact terms.

---

## Example 2: Entity-Focused Question

**Question**: _"What is Alice working on?"_

### Naive Mode

```json
{
  "query": "What is Alice working on?",
  "mode": "naive"
}
```

**Results**: Returns documents mentioning "Alice" and "working", but may miss context.

### Local Mode 🎯 (Better)

```json
{
  "query": "What is Alice working on?",
  "mode": "local"
}
```

**Results**:

```json
{
  "results": [
    {
      "title": "Alice in #engineering",
      "content": "I'm focusing on the API refactor this week...",
      "score": 0.91,
      "entities": ["Alice", "API refactor"]
    },
    {
      "title": "Carol in #product",
      "content": "Alice will handle the backend changes...",
      "score": 0.85,
      "entities": ["Alice", "backend changes"]
    },
    {
      "title": "Alice in #engineering",
      "content": "Also investigating the database performance issues...",
      "score": 0.83,
      "entities": ["Alice", "database", "performance"]
    }
  ],
  "mode": "local",
  "processingTime": 145
}
```

**Analysis**: Local mode identifies "Alice" as an entity and finds all documents connected to her, including indirect mentions. Much better for "What is X?" questions.

**Why Local > Naive**:

- ✅ Understands "Alice" is an entity, not just a keyword
- ✅ Finds all Alice's activities, not just exact keyword matches
- ✅ Includes documents where others mention Alice

---

## Example 3: Relationship Question

**Question**: _"How does the API refactor connect to performance issues?"_

### Local Mode

```json
{
  "query": "How does the API refactor connect to performance issues?",
  "mode": "local"
}
```

**Results**: Finds documents about "API refactor" and documents about "performance issues", but doesn't explain the connection.

### Global Mode 🔗 (Better)

```json
{
  "query": "How does the API refactor connect to performance issues?",
  "mode": "global"
}
```

**Results**:

```json
{
  "results": [
    {
      "title": "Alice in #engineering",
      "content": "The API refactor will fix the N+1 query problem causing slow responses...",
      "score": 0.93,
      "relationships": [
        "API refactor → fixes → performance issues",
        "N+1 queries → causes → slow responses"
      ]
    },
    {
      "title": "Bob in #engineering",
      "content": "We discovered the performance issues while planning the API refactor...",
      "score": 0.89,
      "relationships": ["performance issues → discovered during → API refactor"]
    }
  ],
  "mode": "global",
  "processingTime": 167
}
```

**Analysis**: Global mode understands you're asking about relationships, not just entities. It finds documents that explain _how_ things connect.

**Why Global > Local**:

- ✅ Focuses on relationships between concepts
- ✅ Explains connections, not just mentions
- ✅ Reveals indirect connections through the graph

---

## Example 4: Complex Multi-Part Question

**Question**: _"What blockers does the frontend team have with the API changes?"_

This question needs:

1. Identify "frontend team" entity (Local)
2. Find "blockers" relationships (Global)
3. Connect to "API changes" (Global)

### Hybrid Mode ⚖️ (Best for this)

```json
{
  "query": "What blockers does the frontend team have with the API changes?",
  "mode": "hybrid"
}
```

**Results**:

```json
{
  "results": [
    {
      "title": "Bob in #engineering",
      "content": "Blocked on API changes - need the new endpoints documented before we can proceed...",
      "score": 0.95,
      "entities": ["Bob", "frontend team", "API changes"],
      "relationships": ["frontend team → blocked by → API changes"]
    },
    {
      "title": "Alice in #engineering",
      "content": "The API docs will be ready by EOD, unblocking frontend work...",
      "score": 0.88,
      "entities": ["Alice", "API", "frontend"],
      "relationships": ["API docs → unblocks → frontend work"]
    }
  ],
  "mode": "hybrid",
  "processingTime": 234
}
```

**Analysis**: Hybrid mode combines Local (find frontend team) + Global (find blocker relationships) for comprehensive results.

---

## Example 5: Production Query Requiring Maximum Accuracy

**Question**: _"What did we discuss about the API refactor last week?"_

This is a complex question requiring:

- Time-based filtering ("last week")
- Topic identification ("API refactor")
- Discussion context (multiple people, threads)

### Mix Mode 🌟 (Best)

```json
{
  "query": "What did we discuss about the API refactor last week?",
  "mode": "mix",
  "enable_rerank": true
}
```

**Results**:

```json
{
  "results": [
    {
      "title": "Thread: API Refactor Planning",
      "content": "Alice: We should split the monolith...\nBob: Agreed, but need to maintain backwards compatibility...\nCarol: What's the timeline?\nAlice: 3 sprints...",
      "score": 0.96,
      "reranked": true,
      "date": "2024-01-08"
    },
    {
      "title": "Alice in #engineering",
      "content": "Started the API refactor design doc. Key points: microservices, gRPC, gradual migration...",
      "score": 0.92,
      "reranked": true,
      "date": "2024-01-09"
    },
    {
      "title": "Bob in #engineering",
      "content": "Reviewed Alice's API refactor proposal. Main concern: database migrations...",
      "score": 0.89,
      "reranked": true,
      "date": "2024-01-10"
    }
  ],
  "mode": "mix",
  "processingTime": 456
}
```

**Analysis**: Mix mode retrieves ~60 candidates using Hybrid, then uses an LLM reranker to select the most relevant results. Most accurate but slowest.

---

## Side-by-Side Comparison

Using the same query across all modes:

**Query**: _"What performance issues did the team discuss?"_

| Mode   | Results | Accuracy   | Speed | Best Match                                       |
| ------ | ------- | ---------- | ----- | ------------------------------------------------ |
| Naive  | 5       | ⭐⭐       | 67ms  | Keyword matches "performance" + "issues"         |
| Local  | 8       | ⭐⭐⭐     | 123ms | Found "team" entity + related discussions        |
| Global | 6       | ⭐⭐⭐     | 145ms | Found "performance" relationships + root causes  |
| Hybrid | 12      | ⭐⭐⭐⭐   | 298ms | Combined entity + relationships                  |
| Mix    | 10      | ⭐⭐⭐⭐⭐ | 512ms | Best relevance after reranking (LLM scored each) |

## Decision Tree: Which Mode to Use?

```
Start here: What kind of question is it?

├─ Simple keyword lookup?
│  └─ Use NAIVE MODE
│     Example: "API refactor"
│
├─ About a specific person/project/concept?
│  └─ Use LOCAL MODE
│     Example: "What is Alice working on?"
│
├─ About connections/relationships?
│  └─ Use GLOBAL MODE
│     Example: "How does X connect to Y?"
│
├─ Complex multi-part question?
│  └─ Use HYBRID MODE
│     Example: "What blockers does team X have?"
│
└─ Need maximum accuracy?
   └─ Use MIX MODE
      Example: Production chatbots, critical queries
```

## Performance vs Accuracy Trade-offs

### Development / Testing

**Recommended**: Hybrid mode

- Good balance of accuracy and speed
- Comprehensive results
- Fast enough for iteration

### Production / User-Facing

**Recommended**: Mix mode

- Best accuracy
- Worth the extra latency for user satisfaction
- Can cache common queries

### High-Volume / Cost-Sensitive

**Recommended**: Local or Global (depending on query type)

- Faster than Hybrid/Mix
- Lower cost (fewer LLM calls for reranking)
- Still much better than Naive

### Real-Time / Low-Latency Requirements

**Recommended**: Naive mode

- <100ms response time
- Good enough for autocomplete, suggestions
- Can always re-query with better mode

## Advanced: Tuning Parameters

Each mode accepts parameters to fine-tune behavior:

### Top K (Candidate Retrieval)

```json
{
  "query": "your question",
  "mode": "hybrid",
  "top_k": 100 // Retrieve 100 candidates (default: 60)
}
```

**Higher = More comprehensive but slower**

### Chunk Top K (Final Results)

```json
{
  "query": "your question",
  "mode": "hybrid",
  "chunk_top_k": 20 // Return 20 results (default: 20)
}
```

**Higher = More results to review**

### Score Threshold

```json
{
  "query": "your question",
  "mode": "hybrid",
  "score_threshold": 0.7 // Only return results scoring > 0.7
}
```

**Higher = More precision, lower recall**

### Entity Limit

```json
{
  "query": "your question",
  "mode": "local",
  "entity_limit": 10 // Max entities to traverse (default: auto-calculated)
}
```

**Higher = More entity connections explored**

## Real-World Examples

### Customer Support Bot

```typescript
// Use Mix mode for accuracy
const results = await query({
  query: userQuestion,
  mode: "mix",
  enable_rerank: true,
  chunk_top_k: 5, // Only show top 5 to user
});
```

### Internal Search Tool

```typescript
// Use Hybrid for balance
const results = await query({
  query: searchQuery,
  mode: "hybrid",
  top_k: 60,
  chunk_top_k: 20,
});
```

### Autocomplete Suggestions

```typescript
// Use Naive for speed
const results = await query({
  query: partialQuery,
  mode: "naive",
  chunk_top_k: 10,
  score_threshold: 0.8, // Only high-confidence matches
});
```

## Next Steps

- **[Query API Reference](../query-search/api.md)** - Full API documentation
- **[Best Practices](../query-search/best-practices.md)** - Optimization tips
- **[LightRAG Deep Dive](../core-concepts/lightrag.md)** - How it works under the hood
