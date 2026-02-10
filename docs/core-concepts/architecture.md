# System Architecture

Understanding Almanac's architecture helps you make informed decisions about deployment, scaling, and optimization.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
│  (Web UI, CLI, SDKs, Custom Applications)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      REST API Server                         │
│  (Express.js, TypeScript, Port 3000)                        │
└─────────┬───────────────────────────────┬───────────────────┘
          │                               │
          ▼                               ▼
┌──────────────────────┐      ┌──────────────────────────────┐
│   MCP Client Manager │      │    Indexing Engine           │
│  (Data Source Layer) │      │  (Vector + Graph Indexing)   │
└──────────┬───────────┘      └────────┬─────────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Storage Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ MongoDB  │  │  Qdrant  │  │Memgraph │  │  Redis   │   │
│  │(Metadata)│  │ (Vectors)│  │ (Graph) │  │ (Cache)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. REST API Server

**Technology**: Express.js + TypeScript  
**Port**: 3000 (configurable)  
**Responsibilities**:

- Accept query requests
- Route API calls
- Manage authentication/authorization
- Handle rate limiting
- Coordinate between services

**Key Files**:

- `packages/server/src/server.ts` - Main server
- `packages/server/src/api/` - API routes

### 2. MCP Client Manager

**Purpose**: Manages connections to Model Context Protocol servers

**Responsibilities**:

- Connect/disconnect MCP servers
- Execute tools (fetch data)
- Access resources
- Handle OAuth flows
- Cache tool responses

**Architecture**:

```typescript
mcpClientManager
  ├── clients: Map<serverName, MCPClient>
  ├── connect(config) → MCPClient
  ├── disconnect(serverName)
  ├── executeTool(server, tool, args)
  └── getResources(server)
```

**Key Files**:

- `packages/server/src/mcp/client.ts`
- `packages/server/src/mcp/initialization.ts`

### 3. Indexing Engine

**Purpose**: Transform raw data into searchable vectors and knowledge graphs

**Phases**:

1. **Sync Phase**
   - Fetch data from MCP servers
   - Store in MongoDB
   - Track sync state

2. **Vector Indexing**
   - Generate embeddings
   - Store in Qdrant
   - Enable semantic search

3. **Graph Indexing**
   - Extract entities
   - Extract relationships
   - Build knowledge graph in Memgraph

**Key Files**:

- `packages/indexing-engine/src/` - Core indexing logic
- `packages/server/src/services/indexing/` - Service layer

### 4. Query Engine (LightRAG)

**Purpose**: Answer queries using hybrid vector + graph retrieval

**Query Modes**:

```
Query Request
     ↓
Mode Selection (naive/local/global/hybrid/mix)
     ↓
┌────┴────┐
│ Qdrant  │ → Vector Search (semantic similarity)
└────┬────┘
     ↓
┌────┴────┐
│Memgraph │ → Graph Traversal (entities & relationships)
└────┬────┘
     ↓
  Combine Results
     ↓
  Rerank (optional)
     ↓
  Return Top Results
```

**Key Files**:

- `packages/server/src/services/search/lightrag-query.ts`
- `packages/server/src/services/llm/reranker.ts`

## Storage Architecture

### Why Four Databases?

Each database serves a specific purpose optimized for its access patterns:

#### MongoDB (Document Database)

**Use Case**: Primary data storage

**What It Stores**:

- Raw synced records
- MCP server configurations
- Indexing configurations
- User settings
- Metadata

**Why MongoDB**:

- Flexible schema (different data sources have different fields)
- Fast writes for bulk sync operations
- Rich querying for management operations
- Horizontal scalability

**Collections**:

```javascript
{
  records: {        // Raw data from MCP servers
    _id, source, sourceId, content, metadata, ...
  },
  dataSources: {    // MCP server configs
    name, transport, args, env, ...
  },
  indexingConfigs: {// How to index each source
    serverName, entityTypes, grouping, ...
  }
}
```

#### Qdrant (Vector Database)

**Use Case**: Semantic search via embeddings

**What It Stores**:

- Document embeddings (vectors)
- Text chunks
- Metadata for filtering

**Why Qdrant**:

- Optimized for high-dimensional vectors (3072-d)
- Sub-50ms search on millions of vectors
- Advanced filtering capabilities
- Distributed architecture for scale

**Structure**:

```javascript
{
  id: "mongo_id",
  vector: [0.123, -0.456, ...],  // 3072 dimensions
  payload: {
    text: "Document content",
    source: "slack",
    recordType: "message",
    metadata: {...}
  }
}
```

#### Memgraph (Graph Database)

**Use Case**: Knowledge graph for entity/relationship queries

**What It Stores**:

- Entities (people, concepts, projects)
- Relationships (works_on, depends_on, discussed_in)
- Properties (types, timestamps, scores)

**Why Memgraph**:

- Optimized for graph traversal (follow relationships)
- In-memory for speed
- Cypher query language
- Real-time analytics

**Structure**:

```cypher
// Nodes
(person:Entity {name: "Alice", type: "person"})
(project:Entity {name: "API Refactor", type: "project"})

// Relationships
(person)-[:WORKS_ON {since: "2024-01-01"}]->(project)
```

#### Redis (Cache)

**Use Case**: Performance optimization

**What It Stores**:

- MCP tool responses (30 min TTL)
- Query results (5 min TTL)
- Rate limiting counters
- Session data

**Why Redis**:

- Sub-millisecond access
- Automatic expiration (TTL)
- Atomic operations
- Pub/sub for real-time updates

**Keys**:

```
mcp:slack:list_channels → cached response
query:hash(query_params) → cached results
ratelimit:ip:123.456.789.0 → request count
```

## Data Flow

### Indexing Flow

```
1. Trigger Sync (Manual or Scheduled)
   ↓
2. MCP Client → Fetch Data
   ↓
3. MongoDB ← Store Raw Records
   ↓
4. Indexing Engine Processes Records
   ├─→ Generate Embeddings
   │   └─→ Qdrant ← Store Vectors
   └─→ Extract Entities & Relationships
       └─→ Memgraph ← Build Graph
   ↓
5. Index Complete
```

### Query Flow

```
1. User Query → REST API
   ↓
2. Parse & Validate Request
   ↓
3. Check Redis Cache
   ├─→ Cache Hit → Return Cached Results
   └─→ Cache Miss → Continue
   ↓
4. Query Engine (LightRAG)
   ├─→ Qdrant: Vector Search
   │   └─→ Get top_k candidates
   ├─→ Memgraph: Graph Search (if local/global/hybrid/mix)
   │   └─→ Traverse entities/relationships
   └─→ Combine Results
   ↓
5. Rerank (if mode=mix)
   └─→ LLM scores each result
   ↓
6. Filter by score_threshold
   ↓
7. Return top chunk_top_k results
   ↓
8. Cache in Redis (5 min TTL)
```

## Scalability Patterns

### Horizontal Scaling

**API Server**:

```
Load Balancer (Nginx)
  ├─→ API Server 1 (Docker container)
  ├─→ API Server 2 (Docker container)
  └─→ API Server N (Docker container)
```

**Database Layer**:

- MongoDB: Replica Set + Sharding
- Qdrant: Distributed cluster
- Memgraph: HA cluster (Enterprise)
- Redis: Cluster mode

### Vertical Scaling

**Small** (< 100K docs):

- 4 CPU, 16GB RAM
- Single server
- Docker Compose

**Medium** (100K - 1M docs):

- 8 CPU, 32GB RAM
- Single server with more resources
- Or 2-3 servers (API + Databases)

**Large** (1M - 10M docs):

- 16 CPU, 64GB RAM per server
- Multiple API servers (load balanced)
- Distributed databases
- Dedicated cache layer

**Enterprise** (> 10M docs):

- Kubernetes cluster
- Auto-scaling based on load
- Multi-region deployment
- Dedicated infrastructure per component

## Performance Characteristics

### Latency Breakdown

**Typical Query (mix mode)**:

```
Total: ~450ms
├─ Vector Search (Qdrant): 50ms
├─ Graph Traversal (Memgraph): 100ms
├─ Combining Results: 20ms
├─ Reranking (LLM): 250ms
└─ Response Formatting: 30ms
```

**Fast Query (naive mode)**:

```
Total: ~80ms
├─ Vector Search (Qdrant): 50ms
└─ Response Formatting: 30ms
```

### Throughput

**Single Server** (8 CPU, 32GB RAM):

- **Naive mode**: ~200 queries/sec
- **Hybrid mode**: ~50 queries/sec
- **Mix mode**: ~20 queries/sec

**Clustered** (3 servers):

- **Naive mode**: ~600 queries/sec
- **Hybrid mode**: ~150 queries/sec
- **Mix mode**: ~60 queries/sec

### Indexing Speed

**Vector Indexing**:

- 500-1000 docs/minute (single core)
- 16,000-32,000 docs/minute (32 cores with CONCURRENCY=32)

**Graph Indexing**:

- 200-400 docs/minute (LLM extraction bottleneck)
- Can run 32 concurrent extractions

## Concurrency Model

Almanac uses parallel processing for performance:

```typescript
// Configurable via CONCURRENCY env var (default: 32)
const CONCURRENCY = 32;

// Process documents in batches
await Promise.all(batches.map((batch) => processBatch(batch)));
```

**Benefits**:

- 32x faster than sequential processing
- Efficient CPU utilization
- Configurable based on system resources

## Security Architecture

### Authentication & Authorization

```
Client Request
  ↓
API Key Validation (optional)
  ↓
Rate Limiting Check
  ↓
Request Handler
  ↓
Data Access (filtered by permissions)
```

### Encryption

**At Rest**:

- MongoDB encryption-at-rest (optional)
- Qdrant encrypted volumes
- OAuth tokens encrypted in DB

**In Transit**:

- HTTPS/TLS for API
- TLS for database connections
- Encrypted MCP connections

### Sensitive Data

**Encrypted Fields**:

- OAuth access tokens
- OAuth refresh tokens
- API keys
- Environment variables with secrets

**Encryption Method**:

- AES-256-GCM
- Unique encryption key per deployment
- Automatic via Mongoose hooks

## Monitoring & Observability

### Metrics

**API Metrics**:

- Request rate (requests/sec)
- Response time (p50, p95, p99)
- Error rate
- Cache hit rate

**Database Metrics**:

- Query latency
- Connection pool usage
- Storage size
- Index performance

**Indexing Metrics**:

- Documents indexed/minute
- Indexing errors
- Queue depth
- Processing time per document

### Logging

**Log Levels**:

- **DEBUG**: Detailed execution logs
- **INFO**: Important events (sync started, query executed)
- **WARN**: Recoverable errors (rate limit hit, cache miss)
- **ERROR**: Critical errors (database down, indexing failed)

**Log Format**:

```json
{
  "timestamp": "2024-01-12T18:00:00Z",
  "level": "INFO",
  "message": "Query executed",
  "duration": 456,
  "mode": "mix",
  "results": 12
}
```

## Deployment Architectures

### Development

```
Single Machine (localhost)
├─ Docker Compose
│  ├─ MongoDB container
│  ├─ Redis container
│  ├─ Qdrant container
│  └─ Memgraph container
├─ Node.js Server (host)
└─ Web UI (host)
```

### Production (Small)

```
Single VM (8 CPU, 32GB RAM)
└─ Docker Compose
   ├─ API Server container
   ├─ Web UI container (with Nginx)
   ├─ MongoDB container
   ├─ Redis container
   ├─ Qdrant container
   └─ Memgraph container
```

### Production (Large)

```
Kubernetes Cluster
├─ API Server (Deployment, 3 replicas)
│  └─ Auto-scaling (2-10 pods)
├─ MongoDB (StatefulSet)
│  └─ Replica Set (3 nodes)
├─ Qdrant (StatefulSet)
│  └─ Cluster (3+ nodes)
├─ Memgraph (StatefulSet)
│  └─ HA Cluster (2+ nodes)
├─ Redis (Deployment)
│  └─ Cluster mode (6+ nodes)
└─ Ingress (Load Balancer)
```

## Technology Choices

### Why Express.js?

- Fast, minimal framework
- Large ecosystem
- TypeScript support
- Battle-tested at scale

### Why TypeScript?

- Type safety catches bugs early
- Better IDE support
- Maintainability at scale
- Gradual adoption path

### Why Model Context Protocol?

- Standard interface for data sources
- Community-driven ecosystem
- Easy to add new sources
- Separation of concerns

### Why LightRAG?

- Better than pure vector search
- Answers "who", "what", "how" questions
- 8x token reduction vs traditional RAG
- Multiple query modes for flexibility

## Next Steps

- **[Data Flow Guide](data-flow.md)** - Detailed data flow diagrams
- **[Performance Tuning](performance.md)** - Optimization strategies
- **[Deployment Guide](../getting-started/installation.md)** - Production setup
