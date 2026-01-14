# Examples & Tutorials

Learn Almanac through practical, real-world examples.

## Quick Links

- **[Query Mode Comparison](query-modes.md)** - Understand all 5 query modes with side-by-side examples
- **[Customer Support Agent](customer-support.md)** - Build a Slack-powered support bot
- **[Code Documentation Assistant](code-docs.md)** - Index and search GitHub repositories
- **[Personal Knowledge Base](knowledge-base.md)** - Connect Notion, emails, and documents

## What You'll Learn

### For Beginners

Start here if you're new to Almanac or RAG systems:

1. **[Query Mode Comparison](query-modes.md)** - See how different modes work with real queries
2. **[Customer Support Agent](customer-support.md)** - Simple, practical example using Slack
3. **Quick Start Projects** - Get running in under 30 minutes

### For Advanced Users

Deep dive into complex scenarios:

1. **[Code Documentation](code-docs.md)** - Multi-repo indexing with custom entity types
2. **[Personal Knowledge Base](knowledge-base.md)** - Multi-source integration patterns
3. **Custom Integrations** - Build your own MCP servers

## Example Projects

### Customer Support Bot

**Goal**: Answer customer questions using historical Slack conversations

**Tech Stack**:

- Slack MCP Server
- Mix mode for accuracy
- Auto-grouping for thread context

**Time**: 15 minutes  
**Difficulty**: Beginner

[View Tutorial →](customer-support.md)

### Code Documentation Assistant

**Goal**: Search across multiple GitHub repositories for code examples and documentation

**Tech Stack**:

- GitHub MCP Server
- Custom entity types (functions, classes, files)
- Hybrid mode for code + concepts

**Time**: 30 minutes  
**Difficulty**: Intermediate

[View Tutorial →](code-docs.md)

### Personal Knowledge Base

**Goal**: Unified search across Notion, emails, and local documents

**Tech Stack**:

- Multiple MCP servers (Notion, Gmail, Filesystem)
- Multi-source queries
- Custom reranking logic

**Time**: 45 minutes  
**Difficulty**: Advanced

[View Tutorial →](knowledge-base.md)

## Code Snippets

### Basic Query (TypeScript)

```typescript
import axios from "axios";

const query = async (question: string) => {
  const response = await axios.post("http://localhost:3000/api/query", {
    query: question,
    mode: "mix",
    top_k: 60,
    chunk_top_k: 20,
  });

  return response.data.results;
};

// Usage
const results = await query("What did we discuss about the API refactor?");
console.log(results);
```

### Using Different Modes

```typescript
// Fast keyword search
const naiveResults = await query({
  query: "API refactor",
  mode: "naive",
});

// Entity-focused search
const localResults = await query({
  query: "What is Alice working on?",
  mode: "local",
});

// Relationship search
const globalResults = await query({
  query: "How does auth connect to billing?",
  mode: "global",
});

// Best accuracy
const mixResults = await query({
  query: "Complex question requiring context",
  mode: "mix",
  enable_rerank: true,
});
```

### With Error Handling

```typescript
const safeQuery = async (question: string) => {
  try {
    const response = await axios.post(
      "http://localhost:3000/api/query",
      {
        query: question,
        mode: "mix",
      },
      {
        timeout: 30000, // 30 second timeout
      }
    );

    if (response.data.results.length === 0) {
      return { error: "No results found", results: [] };
    }

    return { results: response.data.results };
  } catch (error) {
    console.error("Query failed:", error);
    return { error: error.message, results: [] };
  }
};
```

### Streaming Results

```typescript
// For real-time updates in UI
const streamQuery = async (
  question: string,
  onResult: (result: any) => void
) => {
  const response = await fetch("http://localhost:3000/api/query/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: question, mode: "mix" }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const result = JSON.parse(chunk);
    onResult(result);
  }
};

// Usage
await streamQuery("your question", (result) => {
  console.log("Got result:", result);
  // Update UI with result
});
```

## Common Patterns

### Pattern 1: Progressive Enhancement

Start with fast mode, upgrade to accurate mode if needed:

```typescript
// Try naive first (fast)
let results = await query({ query: question, mode: "naive" });

// If low scores, upgrade to mix
if (results.every((r) => r.score < 0.7)) {
  results = await query({ query: question, mode: "mix" });
}

return results;
```

### Pattern 2: Multi-Source Search

Search across multiple data sources:

```typescript
const multiSourceQuery = async (question: string) => {
  const [slackResults, githubResults, notionResults] = await Promise.all([
    query({ query: question, source: "slack", mode: "hybrid" }),
    query({ query: question, source: "github", mode: "hybrid" }),
    query({ query: question, source: "notion", mode: "hybrid" }),
  ]);

  // Combine and rerank
  const allResults = [...slackResults, ...githubResults, ...notionResults];
  return allResults.sort((a, b) => b.score - a.score).slice(0, 20);
};
```

### Pattern 3: Context-Aware Queries

Use previous results to inform next query:

```typescript
const contextualQuery = async (question: string, previousResults: any[]) => {
  // Extract entities from previous results
  const entities = previousResults.flatMap((r) => r.entities || []).slice(0, 5);

  // Add context to query
  const enhancedQuery = `${question} (context: ${entities.join(", ")})`;

  return await query({ query: enhancedQuery, mode: "local" });
};
```

## Integration Examples

### React Hook

```typescript
import { useState, useCallback } from "react";

export const useAlmanacQuery = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const query = useCallback(async (question: string, mode = "mix") => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:3000/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question, mode }),
      });

      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { query, results, loading, error };
};

// Usage in component
function SearchComponent() {
  const { query, results, loading } = useAlmanacQuery();

  return (
    <div>
      <input onChange={(e) => query(e.target.value, "mix")} />
      {loading && <div>Loading...</div>}
      {results.map((r) => (
        <div key={r.id}>{r.title}</div>
      ))}
    </div>
  );
}
```

### Python Client

```python
import requests

class AlmanacClient:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url

    def query(self, question, mode="mix", top_k=60):
        response = requests.post(
            f"{self.base_url}/api/query",
            json={
                "query": question,
                "mode": mode,
                "top_k": top_k
            },
            timeout=30
        )
        response.raise_for_status()
        return response.json()["results"]

# Usage
client = AlmanacClient()
results = client.query("What did we discuss about the API refactor?")
for result in results:
    print(f"{result['score']:.2f}: {result['title']}")
```

### CLI Tool

```bash
#!/bin/bash
# query.sh - Simple CLI for Almanac

QUERY="$1"
MODE="${2:-mix}"

curl -s http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"$QUERY\",\"mode\":\"$MODE\"}" \
  | jq '.results[] | "\(.score | tostring | .[0:4]): \(.title)"'

# Usage:
# ./query.sh "API refactor" mix
```

## Best Practices

### DO: Start Simple

```typescript
// Good - Start with one data source
await connectDataSource("slack");
await query("test question");

// Then expand
await connectDataSource("github");
await query("test question");
```

### DO: Use Appropriate Modes

```typescript
// Good - Match mode to query type
await query({ query: "Alice", mode: "local" }); // Entity lookup
await query({ query: "How does X relate to Y?", mode: "global" }); // Relationships
await query({ query: "Complex question", mode: "mix" }); // Best results
```

### DON'T: Always Use Mix Mode

```typescript
// Bad - Mix mode for everything (slow + expensive)
await query({ query: "simple keyword", mode: "mix" });

// Good - Naive for simple keywords
await query({ query: "simple keyword", mode: "naive" });
```

### DO: Handle Errors Gracefully

```typescript
// Good - Graceful degradation
try {
  return await query({ query: q, mode: "mix" });
} catch (err) {
  console.error("Mix mode failed, falling back to hybrid");
  return await query({ query: q, mode: "hybrid" });
}
```

## Next Steps

- **[Query Mode Comparison](query-modes.md)** - Detailed mode examples
- **[API Reference](../api-reference/endpoints.md)** - Full API documentation
- **[Best Practices](../query-search/best-practices.md)** - Optimization tips
