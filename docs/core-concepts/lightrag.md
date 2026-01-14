# LightRAG Explained

LightRAG is Almanac's graph-enhanced retrieval system that understands not just what information exists, but how it connects together. Unlike traditional RAG that treats documents as isolated chunks, LightRAG builds a knowledge graph that captures entities and their relationships.

## The Problem with Traditional RAG

Traditional RAG systems have a fundamental limitation:

```
User Query → Vector Search → Chunks → LLM
```

**Issues:**

- **No Context**: Chunks are isolated - no understanding of relationships
- **Token Hungry**: Need to retrieve many chunks to get full context
- **Miss Connections**: Can't answer questions about how things relate

**Example Problem:**

> "How is the authentication system connected to billing?"

Traditional RAG might find chunks about "authentication" and chunks about "billing", but it doesn't understand the _connection_ between them.

## How LightRAG Solves This

LightRAG extracts entities (people, projects, concepts) and relationships (works on, depends on, discussed in) to build a knowledge graph:

```
Documents → Entity Extraction → Knowledge Graph
                                       ↓
User Query → Keyword Extraction → Graph Traversal → Results
```

Now the same question can be answered by following the graph:

```
Authentication (entity)
    ↓ [depends_on]
API Gateway (entity)
    ↓ [connects_to]
Billing Service (entity)
```

## The 5 Query Modes

LightRAG adapts its retrieval strategy based on your query type. Think of it like having 5 different librarians, each with their own expertise:

### 1. Naive Mode (The Speed Reader)

**What it does**: Pure vector search - fastest option

**Best for**:

- Simple keyword searches
- When you know exact terms
- Quick lookups

**How it works**:

```
Query → Embedding → Vector Search → Top K Documents
```

**Example**:

```bash
Query: "API refactor"
Mode: naive
Results: Documents containing "API" and "refactor"
```

**Pros**: ⚡ Fastest (50-100ms)  
**Cons**: ❌ No graph context, may miss relevant information

---

### 2. Local Mode (The Specialist)

**What it does**: Focuses on specific entities and their immediate connections

**Best for**:

- Questions about specific people, projects, or concepts
- Finding everything related to one topic
- "What is X?" queries

**How it works**:

```
Query → Extract Keywords → Find Entities → Get Entity's Documents
                                  ↓
                          1-hop Relationships
```

**Example**:

```bash
Query: "What is Alice working on?"
Mode: local

Process:
1. Identify entity: "Alice" (person)
2. Find documents mentioning Alice
3. Find entities Alice is connected to
4. Return relevant documents

Results:
- Alice's recent messages
- Issues assigned to Alice
- PRs authored by Alice
- Projects Alice contributes to
```

**Pros**: 🎯 Entity-focused, includes relationships  
**Cons**: ⚠️ Limited to 1-hop connections

---

### 3. Global Mode (The Connector)

**What it does**: Focuses on relationships between entities

**Best for**:

- Understanding connections and workflows
- "How does X relate to Y?" queries
- Finding indirect connections

**How it works**:

```
Query → Extract High-Level Keywords → Find Relationships → Get Connected Entities
```

**Example**:

```bash
Query: "How does authentication connect to billing?"
Mode: global

Process:
1. Find relationship: Authentication → API Gateway
2. Find relationship: API Gateway → Billing Service
3. Return documents explaining these connections

Results:
- Architecture diagrams
- API documentation
- Discussion threads about integration
```

**Pros**: 🔗 Reveals indirect connections, big-picture understanding  
**Cons**: ⚠️ May miss specific details

---

### 4. Hybrid Mode (The Balanced Approach)

**What it does**: Combines Local + Global modes

**Best for**:

- Complex questions requiring both details and connections
- When you're not sure which mode to use
- Multi-faceted queries

**How it works**:

```
Query → [Local Mode] + [Global Mode] → Merge & Deduplicate
```

**Example**:

```bash
Query: "What blockers does the frontend team have?"
Mode: hybrid

Process:
1. Local: Find "frontend team" entity → team members → their documents
2. Global: Find relationships → "blocked_by" connections
3. Merge results and remove duplicates

Results:
- Specific blockers mentioned in stand-ups
- Related issues and dependencies
- Connection to backend team blockers
```

**Pros**: ⚖️ Balanced, comprehensive results  
**Cons**: ⏱️ Slower than single modes (200-400ms)

---

### 5. Mix Mode (The Expert) 🌟

**What it does**: Uses all modes + reranking for maximum accuracy

**Best for**:

- When accuracy matters most
- Complex, nuanced questions
- Production applications

**How it works**:

```
Query → [Hybrid Mode] → Reranker → Top Results
         (Local + Global)     ↓
                        Score by relevance
```

**Example**:

```bash
Query: "What did we discuss about the API refactor?"
Mode: mix

Process:
1. Hybrid retrieval gets ~60 candidates
2. Reranker scores each by actual relevance
3. Return top 20 results

Results (sorted by relevance):
- Meeting notes about API refactor (0.94)
- Slack discussion thread (0.89)
- Related GitHub issues (0.82)
- Architecture diagrams (0.78)
```

**Pros**: 🎯 Most accurate, best results  
**Cons**: ⏱️ Slowest (300-600ms), requires reranker model

---

## Query Mode Comparison

| Mode   | Speed       | Accuracy      | Use Case                 | Graph Used  |
| ------ | ----------- | ------------- | ------------------------ | ----------- |
| Naive  | ⚡⚡⚡ Fast | ⭐ Basic      | Simple keyword search    | ❌ No       |
| Local  | ⚡⚡ Good   | ⭐⭐ Good     | Entity-focused questions | ✅ 1-hop    |
| Global | ⚡⚡ Good   | ⭐⭐ Good     | Relationship questions   | ✅ Multi    |
| Hybrid | ⚡ Slower   | ⭐⭐⭐ Better | Complex questions        | ✅ Full     |
| Mix    | ⏱️ Slowest  | ⭐⭐⭐⭐ Best | Production/accuracy      | ✅ + Rerank |

## Keyword Extraction: Dual-Level Approach

LightRAG uses two levels of keyword extraction:

### High-Level Keywords

**Purpose**: Capture broad concepts and relationships

**Example**:

```
Query: "How does the authentication system connect to billing?"

High-Level: ["authentication system", "billing", "integration"]
```

**Used in**: Global mode (finding relationships)

### Low-Level Keywords

**Purpose**: Capture specific entities

**Example**:

```
Query: "What is Alice working on with the API refactor?"

Low-Level: ["Alice", "API refactor", "current work"]
```

**Used in**: Local mode (finding entities)

### Why Two Levels?

Different query modes need different granularity:

- **Local mode**: Needs specific entity names (Alice, Project X)
- **Global mode**: Needs broader concepts (authentication, workflows)

The dual-level approach lets each mode work optimally.

## Token Reduction: Why LightRAG is Efficient

Traditional RAG might need 10-20 chunks (10,000+ tokens) to answer a question. LightRAG uses entity-based retrieval to reduce this dramatically:

### Traditional RAG

```
Retrieve: 20 document chunks
Tokens: ~12,000 tokens
Cost: $0.36 per query (gpt-4)
```

### LightRAG (Local Mode)

```
Retrieve: 3-5 entity-focused documents
Tokens: ~1,500 tokens
Cost: $0.045 per query (gpt-4)
⬇️ 8x reduction
```

### How?

1. **Entity Focus**: Only retrieve documents directly related to query entities
2. **Graph Pruning**: Use relationships to filter irrelevant content
3. **Smart Ranking**: Return most relevant results first

## Real-World Example

Let's see all modes in action:

**Query**: _"What performance issues did the team discuss last week?"_

### Naive Mode

```
→ Vector search for "performance issues" + "last week"
→ Returns documents with those keywords
❌ May miss related discussions about "slow API", "latency problems"
```

### Local Mode

```
→ Extract entities: "team", "performance"
→ Find all team members
→ Get their recent discussions
✅ Finds related terms through entity connections
```

### Global Mode

```
→ Extract concepts: "performance", "issues"
→ Find relationships: discussed_in, caused_by, related_to
→ Traverse graph to find connected topics
✅ Discovers "database bottleneck" caused performance issues
```

### Hybrid Mode

```
→ Combines Local + Global
→ Gets team discussions (Local) + related issues (Global)
✅ Most comprehensive results
```

### Mix Mode

```
→ Hybrid results → Reranker
→ Scores by actual relevance
→ Top results most likely to answer the question
✅ Best accuracy
```

## When to Use Each Mode

### Use Naive Mode When:

- ✅ You know exact terms/keywords
- ✅ Speed is critical (< 100ms)
- ✅ Simple lookup queries
- ❌ Don't need context or relationships

### Use Local Mode When:

- ✅ Asking about specific people/projects/concepts
- ✅ "What is X?" or "Tell me about Y"
- ✅ Need entity-focused results
- ❌ Don't need broader connections

### Use Global Mode When:

- ✅ Understanding relationships and workflows
- ✅ "How does X connect to Y?"
- ✅ Need big-picture context
- ❌ Don't need specific details

### Use Hybrid Mode When:

- ✅ Complex multi-part questions
- ✅ Need both details and connections
- ✅ Unsure which mode to use
- ❌ Don't need maximum accuracy

### Use Mix Mode When:

- ✅ Accuracy is critical
- ✅ Production applications
- ✅ Complex, nuanced questions
- ✅ Have reranker configured
- ❌ Speed isn't the priority

## Performance Tuning

Each mode has configurable parameters:

```json
{
  "query": "your question",
  "mode": "mix",
  "top_k": 60, // How many candidates to retrieve
  "chunk_top_k": 20, // How many to return
  "score_threshold": 0.7, // Minimum relevance score
  "enable_rerank": true // Use reranking (mix mode)
}
```

See [Query API](../query-search/api.md) for full parameter reference.

## Next Steps

- **[Try Examples](../examples/query-modes.md)** - See each mode in action
- **[Query API](../query-search/api.md)** - Full API reference
- **[Best Practices](../query-search/best-practices.md)** - Optimization tips
- **[Architecture](architecture.md)** - How the system works
