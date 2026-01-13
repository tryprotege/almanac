# Query API Reference

Complete reference for Almanac's query API.

## Base Endpoint

```
POST http://localhost:3000/api/query
```

## Request Format

### Basic Request

```json
{
  "query": "What did we discuss about the API refactor?",
  "mode": "mix"
}
```

### Full Request

```json
{
  "query": "What did we discuss about the API refactor?",
  "mode": "mix",
  "top_k": 60,
  "chunk_top_k": 20,
  "score_threshold": 0.5,
  "enable_rerank": true,
  "source": "slack",
  "record_types": ["message", "thread"],
  "date_range": {
    "start": "2024-01-01",
    "end": "2024-01-31"
  },
  "entity_limit": 10,
  "metadata": {
    "user_id": "user_123",
    "session_id": "session_456"
  }
}
```

## Parameters

### Required Parameters

#### `query` (string)

The search query or question.

```json
{
  "query": "How does authentication work?"
}
```

**Examples**:

- `"API refactor"` - Simple keyword search
- `"What is Alice working on?"` - Entity-focused question
- `"How does X connect to Y?"` - Relationship question

---

### Optional Parameters

#### `mode` (string)

Query mode determining retrieval strategy.

**Options**: `naive`, `local`, `global`, `hybrid`, `mix`  
**Default**: `mix`

```json
{
  "query": "...",
  "mode": "mix"
}
```

**Mode Details**:

- `naive`: Fast vector search only
- `local`: Entity-focused retrieval
- `global`: Relationship-focused retrieval
- `hybrid`: Combines local + global
- `mix`: Hybrid + reranking (most accurate)

See [LightRAG Guide](../core-concepts/lightrag.md) for detailed comparison.

---

#### `top_k` (number)

Number of candidates to retrieve before reranking.

**Range**: 1-200  
**Default**: 60

```json
{
  "query": "...",
  "top_k": 100
}
```

**Guidelines**:

- **20-40**: Fast queries, simple questions
- **60-80**: Standard (recommended)
- **100-200**: Complex queries, need more context

---

#### `chunk_top_k` (number)

Number of final results to return after reranking.

**Range**: 1-100  
**Default**: 20

```json
{
  "query": "...",
  "chunk_top_k": 10
}
```

**Use Cases**:

- **5-10**: Chatbot responses, focused answers
- **20**: Standard display
- **50+**: Research, comprehensive results

---

#### `score_threshold` (number)

Minimum relevance score (0.0-1.0) for results.

**Range**: 0.0-1.0  
**Default**: 0.5

```json
{
  "query": "...",
  "score_threshold": 0.7
}
```

**Guidelines**:

- **0.5**: Balanced (default)
- **0.7**: High precision, fewer results
- **0.3**: High recall, more results

---

#### `enable_rerank` (boolean)

Enable LLM-based reranking (only for `mix` mode).

**Default**: `true`

```json
{
  "query": "...",
  "mode": "mix",
  "enable_rerank": true
}
```

**Performance Impact**:

- Enabled: Slower (~300-600ms) but more accurate
- Disabled: Faster (~200-400ms) but less accurate

---

#### `source` (string)

Filter results to specific data source.

```json
{
  "query": "...",
  "source": "slack"
}
```

**Examples**: `slack`, `github`, `notion`, `custom-api`

---

#### `record_types` (array)

Filter results to specific record types.

```json
{
  "query": "...",
  "record_types": ["message", "thread"]
}
```

**Examples**:

- Slack: `message`, `thread`, `channel`
- GitHub: `issue`, `pull_request`, `commit`
- Notion: `page`, `database`, `block`

---

#### `date_range` (object)

Filter results by date range.

```json
{
  "query": "...",
  "date_range": {
    "start": "2024-01-01",
    "end": "2024-01-31"
  }
}
```

**Formats**: ISO 8601 date strings

---

#### `entity_limit` (number)

Max entities to traverse in `local` mode.

**Range**: 1-50  
**Default**: Auto-calculated based on query

```json
{
  "query": "...",
  "mode": "local",
  "entity_limit": 15
}
```

---

#### `metadata` (object)

Custom metadata for tracking/analytics.

```json
{
  "query": "...",
  "metadata": {
    "user_id": "user_123",
    "source": "chatbot",
    "session_id": "abc"
  }
}
```

## Response Format

### Success Response

```json
{
  "results": [
    {
      "id": "507f1f77bcf86cd799439011",
      "score": 0.92,
      "title": "Alice in #engineering",
      "content": "We should start the API refactor...",
      "source": "slack",
      "recordType": "message",
      "sourceId": "1234.5678",
      "primaryDate": "2024-01-10T14:30:00Z",
      "entities": ["Alice", "API refactor", "engineering"],
      "relationships": ["Alice → works_on → API refactor"],
      "metadata": {
        "channel": "#engineering",
        "user": "Alice"
      }
    }
  ],
  "metadata": {
    "mode": "mix",
    "total": 1,
    "processingTime": 456,
    "reranked": true
  }
}
```

### Result Fields

#### `id` (string)

Unique document identifier.

#### `score` (number)

Relevance score (0.0-1.0).

**Interpretation**:

- **0.9-1.0**: Highly relevant
- **0.7-0.9**: Relevant
- **0.5-0.7**: Somewhat relevant
- **<0.5**: Low relevance

#### `title` (string)

Document title or primary identifier.

#### `content` (string)

Document text content.

#### `source` (string)

Data source name (`slack`, `github`, etc.).

#### `recordType` (string)

Type of record (`message`, `issue`, `page`, etc.).

#### `sourceId` (string)

Original ID in source system.

#### `primaryDate` (string)

Main timestamp (ISO 8601).

#### `entities` (array) - Optional

Extracted entities relevant to query.

```json
"entities": ["Alice", "API refactor", "backend"]
```

#### `relationships` (array) - Optional

Extracted relationships relevant to query.

```json
"relationships": [
  "Alice → works_on → API refactor",
  "API refactor → depends_on → database migration"
]
```

#### `metadata` (object) - Optional

Source-specific metadata.

```json
"metadata": {
  "channel": "#engineering",
  "user": "Alice",
  "thread_ts": "1234.5678"
}
```

### Metadata Fields

#### `mode` (string)

Query mode used.

#### `total` (number)

Number of results returned.

#### `processingTime` (number)

Query execution time in milliseconds.

#### `reranked` (boolean)

Whether results were reranked.

## Error Responses

### 400 Bad Request

```json
{
  "error": "Invalid query parameter",
  "message": "Query must be a non-empty string",
  "code": "INVALID_QUERY"
}
```

**Common Causes**:

- Missing `query` field
- Invalid `mode` value
- Invalid parameter types

### 429 Too Many Requests

```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 100 requests per minute",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 30
}
```

### 500 Internal Server Error

```json
{
  "error": "Query execution failed",
  "message": "Database connection timeout",
  "code": "QUERY_FAILED"
}
```

## Code Examples

### cURL

```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What did we discuss about the API refactor?",
    "mode": "mix",
    "top_k": 60,
    "chunk_top_k": 20
  }'
```

### TypeScript/JavaScript

```typescript
const query = async (question: string) => {
  const response = await fetch("http://localhost:3000/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: question,
      mode: "mix",
      top_k: 60,
      chunk_top_k: 20,
    }),
  });

  if (!response.ok) {
    throw new Error(`Query failed: ${response.statusText}`);
  }

  return await response.json();
};
```

### Python

```python
import requests

def query(question: str, mode: str = "mix") -> dict:
    response = requests.post(
        "http://localhost:3000/api/query",
        json={
            "query": question,
            "mode": mode,
            "top_k": 60,
            "chunk_top_k": 20
        },
        timeout=30
    )
    response.raise_for_status()
    return response.json()
```

### Go

```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

type QueryRequest struct {
    Query      string `json:"query"`
    Mode       string `json:"mode"`
    TopK       int    `json:"top_k"`
    ChunkTopK  int    `json:"chunk_top_k"`
}

func query(question string) (map[string]interface{}, error) {
    req := QueryRequest{
        Query:     question,
        Mode:      "mix",
        TopK:      60,
        ChunkTopK: 20,
    }

    body, _ := json.Marshal(req)
    resp, err := http.Post(
        "http://localhost:3000/api/query",
        "application/json",
        bytes.NewBuffer(body),
    )
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    return result, nil
}
```

## Advanced Usage

### Multi-Source Query

Query multiple sources in parallel:

```typescript
const multiSourceQuery = async (question: string) => {
  const sources = ["slack", "github", "notion"];

  const results = await Promise.all(
    sources.map((source) =>
      fetch("http://localhost:3000/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: question,
          source,
          mode: "hybrid",
        }),
      }).then((r) => r.json())
    )
  );

  // Combine and sort
  const allResults = results.flatMap((r) => r.results);
  return allResults.sort((a, b) => b.score - a.score).slice(0, 20);
};
```

### Progressive Loading

Start with fast mode, upgrade if needed:

```typescript
const smartQuery = async (question: string) => {
  // Try naive first
  const naiveResults = await query({ query: question, mode: "naive" });

  // Check quality
  const avgScore =
    naiveResults.reduce((sum, r) => sum + r.score, 0) / naiveResults.length;

  // Upgrade to mix if scores are low
  if (avgScore < 0.7) {
    return await query({ query: question, mode: "mix" });
  }

  return naiveResults;
};
```

### Pagination

For large result sets:

```typescript
const paginatedQuery = async (
  question: string,
  page: number,
  pageSize: number
) => {
  const offset = page * pageSize;

  return await fetch("http://localhost:3000/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: question,
      mode: "mix",
      top_k: 200, // Retrieve many candidates
      chunk_top_k: pageSize,
      offset, // Skip previous pages
    }),
  }).then((r) => r.json());
};
```

## Rate Limiting

Default limits:

- **100 requests/minute** per IP
- **1000 requests/hour** per IP

For higher limits, contact support or self-host.

## Performance Tips

### 1. Choose Appropriate Mode

```typescript
// Fast queries
mode: "naive"; // 50-100ms

// Balanced
mode: "hybrid"; // 200-400ms

// Accurate
mode: "mix"; // 300-600ms
```

### 2. Adjust `top_k`

```typescript
// Faster, fewer candidates
top_k: 30;

// Slower, more comprehensive
top_k: 100;
```

### 3. Disable Reranking

```typescript
// For speed-sensitive applications
{
  mode: "hybrid",
  enable_rerank: false
}
```

### 4. Cache Results

```typescript
const cache = new Map();

const cachedQuery = async (question: string) => {
  if (cache.has(question)) {
    return cache.get(question);
  }

  const results = await query(question);
  cache.set(question, results);
  return results;
};
```

## Next Steps

- **[Query Modes Guide](../core-concepts/lightrag.md)** - Understand each mode
- **[Best Practices](best-practices.md)** - Optimization tips
- **[Examples](../examples/query-modes.md)** - Real-world usage
