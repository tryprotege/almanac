# Data Pipeline Overview

Almanac's data pipeline transforms external data into searchable knowledge through three distinct phases:

```
External APIs → Syncing → Indexing → Search
```

## The Three Phases

### 1. Syncing (Data Collection)

**What**: Fetches raw data from MCP servers and stores it in MongoDB

**Input**: MCP server tools (API calls)  
**Output**: Normalized records in MongoDB  
**Duration**: Depends on data volume (minutes to hours for large datasets)

[Learn More →](syncing.md)

### 2. Vector Indexing (Semantic Search)

**What**: Creates embeddings for semantic similarity search

**Input**: MongoDB records  
**Output**: Vector embeddings in Qdrant  
**Duration**: ~0.2-0.5s per document

[Learn More →](vector-indexing.md)

### 3. Graph Indexing (Knowledge Graph)

**What**: Extracts entities and relationships for graph traversal

**Input**: MongoDB records  
**Output**: Knowledge graph in Memgraph  
**Duration**: ~1-3s per document (includes LLM extraction)

[Learn More →](graph-indexing.md)

## Why Three Phases?

Each phase serves a different purpose:

| Phase        | Purpose                       | Storage  | Speed    |
| ------------ | ----------------------------- | -------- | -------- |
| Syncing      | Raw data collection           | MongoDB  | Variable |
| Vector Index | Semantic similarity           | Qdrant   | Fast     |
| Graph Index  | Entity/relationship discovery | Memgraph | Slower   |

### Separation Benefits

**Flexibility**: Re-index without re-syncing

```bash
# Data changed? Just re-sync
pnpm run sync

# Want different embeddings? Just re-index vectors
pnpm run index-vectors

# Need to extract different entities? Just re-index graph
pnpm run index-graph
```

**Efficiency**: Only sync what changed

```bash
# Incremental sync (only new/updated records)
pnpm run sync --since="2024-01-01"
```

**Reliability**: Each phase can fail independently

```
✅ Sync complete (1000 records)
❌ Vector indexing failed (retry without re-syncing)
✅ Graph indexing complete
```

## Complete Workflow

Here's what happens when you connect a new data source:

### Step 1: Configuration

```
User connects Slack → Almanac generates config → Config saved
```

The config defines:

- Which tools to call (`list_channels`, `get_messages`)
- How to transform the data (field mappings)
- What record types to create (`channel`, `message`)

### Step 2: Syncing

```
For each fetcher in config:
  1. Call MCP tool
  2. Transform response
  3. Save to MongoDB
```

Example:

```typescript
// Fetcher config
{
  "list_messages": {
    "tool": "list_messages",
    "inputs": { "channel_id": "{{channel_id}}" },
    "outputs": "messages",
    "recordType": "message"
  }
}

// Execution
const result = await mcpServer.call("list_messages", {
  channel_id: "C123456"
});

// Transform and save
for (const msg of result.messages) {
  await saveRecord({
    source: "slack",
    recordType: "message",
    sourceId: msg.id,
    title: msg.user,
    content: msg.text,
    primaryDate: msg.timestamp,
    rawData: msg
  });
}
```

### Step 3: Vector Indexing

```
For each record in MongoDB:
  1. Generate embedding
  2. Store in Qdrant with metadata
```

Example:

```typescript
const record = await Record.findById(recordId);

// Generate embedding from content
const embedding = await embed(record.content);

// Store in Qdrant
await qdrant.upsert({
  id: record._id,
  vector: embedding,
  payload: {
    source: record.source,
    recordType: record.recordType,
    title: record.title,
  },
});
```

### Step 4: Graph Indexing

```
For each record in MongoDB:
  1. Extract entities via LLM
  2. Extract relationships via LLM
  3. Store in Memgraph
  4. Link to source document
```

Example:

```typescript
const record = await Record.findById(recordId);

// LLM extracts entities and relationships
const { entities, relationships } = await extractGraph(record.content);

// Create nodes in Memgraph
for (const entity of entities) {
  await memgraph.createNode({
    id: entity.id,
    type: entity.type,
    title: entity.name,
  });
}

// Create relationships
for (const rel of relationships) {
  await memgraph.createRelationship({
    source: rel.source,
    target: rel.target,
    type: rel.type,
  });
}
```

### Step 5: Ready to Query!

```
User queries → LightRAG uses all three storage layers → Returns results
```

## Storage Architecture

Almanac uses multiple databases, each optimized for its purpose:

### MongoDB (Document Store)

**Stores**: Raw records from external APIs

**Why**:

- Flexible schema (different data sources have different structures)
- Fast writes (optimized for syncing)
- Source of truth for all data

**Example**:

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "source": "slack",
  "recordType": "message",
  "sourceId": "1234.5678",
  "title": "alice",
  "content": "Let's refactor the API...",
  "primaryDate": "2024-01-10T14:30:00Z",
  "rawData": {
    /* full Slack message */
  }
}
```

### Qdrant (Vector Store)

**Stores**: Embeddings for semantic search

**Why**:

- Optimized for vector similarity search
- Fast nearest-neighbor queries
- Scales to billions of vectors

**Example**:

```
Vector: [0.123, -0.456, 0.789, ...]  (2560 dimensions)
Payload: { recordId, source, title, ... }
```

### Memgraph (Graph Store)

**Stores**: Entities, relationships, and graph structure

**Why**:

- Fast graph traversal (1-hop, 2-hop, etc.)
- Complex relationship queries
- Optimized for connected data

**Example**:

```cypher
(Alice:Person)-[:WORKS_ON]->(API Refactor:Project)
(API Refactor)-[:DEPENDS_ON]->(Database:System)
```

### Redis (Cache)

**Stores**: Temporary data, sessions, job queues

**Why**:

- Ultra-fast in-memory access
- Perfect for caching and coordination
- Handles high throughput

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     External APIs                            │
│              (Slack, GitHub, Notion, etc.)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      MCP Servers                             │
│            (Standardized API interface)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                   ┌──────────┐
                   │ SYNCING  │ ← Indexing Config
                   └─────┬────┘
                         │
                         ▼
                   ┌──────────┐
                   │ MongoDB  │ ← Raw Records
                   └─────┬────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
    ┌───────────┐                ┌──────────────┐
    │  VECTOR   │                │    GRAPH     │
    │ INDEXING  │                │  INDEXING    │
    └─────┬─────┘                └──────┬───────┘
          │                             │
          ▼                             ▼
    ┌─────────┐                  ┌───────────┐
    │ Qdrant  │                  │ Memgraph  │
    └─────┬───┘                  └─────┬─────┘
          │                             │
          └──────────────┬──────────────┘
                         │
                         ▼
                  ┌────────────┐
                  │  LightRAG  │
                  │   QUERY    │
                  └──────┬─────┘
                         │
                         ▼
                    ┌─────────┐
                    │ Results │
                    └─────────┘
```

## Performance Characteristics

### Syncing

- **Throughput**: Limited by external API rate limits
- **Parallelization**: 32 concurrent requests by default
- **Bottleneck**: External API speed

### Vector Indexing

- **Throughput**: ~100-200 docs/sec (depends on embedding model)
- **Parallelization**: 32 concurrent operations by default
- **Bottleneck**: Embedding generation (API or local)

### Graph Indexing

- **Throughput**: ~5-20 docs/sec (includes LLM extraction)
- **Parallelization**: 32 concurrent operations by default
- **Bottleneck**: LLM extraction latency

### Query Time

- **Naive mode**: 50-100ms
- **Local/Global mode**: 100-300ms
- **Hybrid mode**: 200-400ms
- **Mix mode**: 300-600ms (includes reranking)

## Monitoring the Pipeline

### Via CLI

```bash
# Check sync status
pnpm run sync:status

# Check indexing progress
pnpm run index:status

# View logs
tail -f packages/server/logs/almanac.log
```

### Via UI

1. Navigate to **Dashboard**
2. See real-time progress:
   - Records synced
   - Documents indexed
   - Entities extracted
   - Relationships found

### Via Logs

```
[INFO] 📥 Syncing slack...
[INFO]   └─ Fetched 150 channels
[INFO]   └─ Fetched 1,247 messages
[INFO]   └─ ✅ Sync complete (2.3s)

[INFO] 🔄 Vector indexing...
[INFO]   └─ ✅ 1,247 documents indexed (5.2s)

[INFO] 🔄 Graph indexing...
[INFO]   └─ Extracted 423 entities
[INFO]   └─ Found 891 relationships
[INFO]   └─ ✅ Graph complete (12.4s)
```

## Common Operations

### Re-sync Everything

```bash
# Warning: This will re-fetch all data
pnpm run sync --force
```

### Re-index Vectors Only

```bash
# Useful when changing embedding model
pnpm run index-vectors --force
```

### Re-index Graph Only

```bash
# Useful when improving entity extraction
pnpm run index-graph --force
```

### Incremental Sync

```bash
# Only sync records updated since date
pnpm run sync --since="2024-01-01"
```

## Error Handling

Each phase handles errors independently:

### Sync Errors

```
✅ Channel 1: 100 messages synced
❌ Channel 2: Rate limit exceeded (will retry)
✅ Channel 3: 50 messages synced
```

### Index Errors

```
✅ Document 1: Indexed
❌ Document 2: Embedding failed (will retry)
✅ Document 3: Indexed
```

Failed operations are logged and can be retried without affecting successful operations.

## Next Steps

- **[Syncing Details](syncing.md)** - Deep dive into data collection
- **[Vector Indexing](vector-indexing.md)** - Understanding embeddings
- **[Graph Indexing](graph-indexing.md)** - Entity and relationship extraction
- **[Query & Search](../query-search/api.md)** - Using the indexed data
