# Configuration

Complete guide to configuring Almanac for local development with Docker containers.

## Environment Variables

All configuration is done through environment variables in `packages/server/.env`.

### Quick Setup

```bash
cd packages/server
cp .env.example .env
# Edit .env with your settings
```

## Local Development with Docker

Almanac uses Docker Compose to run all required services locally. No production/cloud services needed!

### Starting Services

```bash
# Start only databases (MongoDB, Redis, Qdrant, Memgraph)
docker compose up -d

# Start everything including server and client
docker compose --profile app up -d
```

### Local Services

The following services run in Docker containers:

- **MongoDB** (port 27017): Document database
- **Redis** (port 6379): Cache and session storage
- **Qdrant** (port 6333): Vector database for embeddings
- **Memgraph** (port 7687): Graph database for entities and relationships
- **Server** (port 3000): API server (when using `--profile app`)
- **Client** (port 5173): Web UI (when using `--profile app`)

All data is persisted in `.data/` directory in the project root.

## LLM Configuration

Almanac requires LLM models for three purposes:

1. **Chat Model**: Query understanding, entity extraction, relationship extraction
2. **Embedding Model**: Vector embeddings for semantic search
3. **Reranking Model** (Optional): Improve search result relevance

### OpenRouter Configuration

OpenRouter provides access to many open-source models with a simple API. Get your API key from: https://openrouter.ai/

```bash
# Get your API key from: https://openrouter.ai/
LLM_API_KEY=sk-or-v1-...
LLM_BASE_URL=

# Recommended Models
LLM_CHAT_MODEL=fireworks/models/gpt-oss-120b
LLM_EXTRACTION_MODEL=xai/grok-4-1-fast-reasoning
LLM_EMBEDDING_MODEL=openai/Qwen/Qwen3-Embedding-4B
LLM_INDEX_CONFIG_MODEL=fireworks/models/gpt-oss-120b

# Optional: Reranking
RERANKER_ENABLED=true
RERANKER_BASE_URL=https://openrouter.ai/v1/rerank
RERANKER_MODEL=deepinfra/Qwen/Qwen3-Reranker-4B
```

**Why These Models?**

- **Chat**: `fireworks/models/gpt-oss-120b` - High quality reasoning for complex queries
- **Extraction**: `xai/grok-4-1-fast-reasoning` - Fast and accurate entity/relationship extraction
- **Embedding**: `openai/Qwen/Qwen3-Embedding-4B` - Balanced quality and performance for semantic search
- **Reranker**: `deepinfra/Qwen/Qwen3-Reranker-4B` - Improved search result relevance

## Database Configuration

All databases run in local Docker containers. Default configuration works out of the box!

### MongoDB

```bash
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_USERNAME=admin
MONGO_PASSWORD=admin123
MONGO_DB_NAME=almanac
```

**Docker Service**: `mongodb` (mongo:8.2.2)
**Data Location**: `.data/mongodb/`

### Redis

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

**Docker Service**: `redis` (redis:alpine3.22)
**Data Location**: `.data/redis/`

### Qdrant (Vector Database)

```bash
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_API_KEY=
```

**Docker Service**: `qdrant` (qdrant/qdrant:v1.16.0)
**Data Location**: `.data/qdrant/`
**Admin UI**: http://localhost:6333/dashboard

**Vector Sizes by Model**:

- `text-embedding-3-large`: 3072
- `text-embedding-3-small`: 1536
- `qwen/qwen3-embedding-8b`: 1024
- `qwen/qwen3-embedding-4b`: 1024
- `nomic-embed-text`: 768

### Memgraph (Graph Database)

```bash
MEMGRAPH_HOST=localhost
MEMGRAPH_PORT=7687
MEMGRAPH_USERNAME=
MEMGRAPH_PASSWORD=
```

**Docker Service**: `memgraph` (memgraph/memgraph:3.7.0)
**Data Location**: `.data/memgraph/`

## Logging Configuration

```bash
# Log level: debug, info, warn, error
LOG_LEVEL=info

# MCP Debug Logs (full responses vs. length only)
MCP_DEBUG_LOGS=false
```

## Performance Configuration

### Concurrency

Control parallel operations for better performance:

```bash
# Database indexing concurrency
DB_INDEXING_CONCURRENCY=32

# Vector indexing concurrency
VECTOR_INDEXING_CONCURRENCY=32

# Graph extraction concurrency
GRAPH_EXTRACTION_CONCURRENCY=32
```

Adjust based on your system resources:

- **High-end systems**: 32-64
- **Mid-range systems**: 16-32
- **Low-end systems**: 8-16

## Security

### Encryption

Required for storing sensitive data (OAuth tokens, API keys):

```bash
# Generate a key:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env:
ENCRYPTION_KEY=your-generated-64-character-hex-string
```

## Indexing Configuration

### Entity Extraction

```bash
# Maximum entities per document (optional, no limit if not set)
MAX_ENTITIES_PER_DOCUMENT=1000

# Dynamic limit: 1 entity per X characters (optional)
# Lower value = more entities (e.g., 40 = generous)
# Higher value = fewer entities (e.g., 150 = conservative)
# ENTITY_CHARS_PER_ENTITY=40
```

### Toxic Document Filter

Filters out documents that look like lists, bibliographies, or indexes:

```bash
# Disabled by default (may be too aggressive)
ENABLE_TOXIC_DOCUMENT_FILTER=false
```

Detection heuristics: >50 entities, <5 relationships, <20 char avg entity names

## Data Source Sync Configuration

### Sync Schedule

Almanac uses hybrid scheduling for automatic syncs:

1. **On startup**: Syncs data sources that missed their last scheduled sync
2. **While running**: Syncs all enabled data sources according to cron schedule

```bash
# Only sync data modified after this date (default: 60 days ago)
# SYNC_CUTOFF_DATE=2025-12-01T00:00:00.000Z

# Maximum records to sync per data source (optional, no limit by default)
# SYNC_MAX_RECORDS=1000

# Cron schedule for automatic syncs (default: daily at midnight)
# SYNC_CRON_SCHEDULE=0 0 * * *
```

**Cron Schedule Examples**:

- `0 * * * *` - Every hour
- `0 0 * * *` - Every day at midnight (DEFAULT)
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Every Sunday at midnight

**Note**: Times are interpreted in your local server timezone.

## OAuth Configuration (Optional)

For data sources requiring OAuth (Slack, GitHub, Notion), you'll need to:

1. Create OAuth apps in each service
2. Add credentials to `.env`
3. Configure redirect URIs to point to your local server

These are only needed if you want to connect these specific data sources.

## Complete Example

Here's a complete `.env` file for local development using OpenRouter:

```bash
# === Logging ===
LOG_LEVEL=info
MCP_DEBUG_LOGS=false

# === Local Docker Databases ===
# MongoDB
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_USERNAME=admin
MONGO_PASSWORD=admin123
MONGO_DB_NAME=almanac

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Memgraph
MEMGRAPH_HOST=localhost
MEMGRAPH_PORT=7687
MEMGRAPH_USERNAME=
MEMGRAPH_PASSWORD=

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_API_KEY=

# === LLM Configuration (OpenRouter) ===
# Get your API key from: https://openrouter.ai/
LLM_API_KEY=sk-or-v1-your-key-here
LLM_BASE_URL=

# Recommended Models
LLM_CHAT_MODEL=fireworks/models/gpt-oss-120b
LLM_EXTRACTION_MODEL=xai/grok-4-1-fast-reasoning
LLM_EMBEDDING_MODEL=openai/Qwen/Qwen3-Embedding-4B
LLM_INDEX_CONFIG_MODEL=fireworks/models/gpt-oss-120b

# === Reranker (Optional) ===
RERANKER_ENABLED=true
RERANKER_BASE_URL=https://openrouter.ai/v1/rerank
RERANKER_MODEL=deepinfra/Qwen/Qwen3-Reranker-4B

# === Security ===
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-64-character-hex-string-here

# === Performance ===
DB_INDEXING_CONCURRENCY=32
VECTOR_INDEXING_CONCURRENCY=32
GRAPH_EXTRACTION_CONCURRENCY=32

# === Indexing ===
MAX_ENTITIES_PER_DOCUMENT=1000
ENABLE_TOXIC_DOCUMENT_FILTER=false

# === Sync Configuration ===
# SYNC_CUTOFF_DATE=2025-12-01T00:00:00.000Z
# SYNC_MAX_RECORDS=1000
# SYNC_CRON_SCHEDULE=0 0 * * *
```

## Docker Management

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f mongodb
docker compose logs -f server
```

### Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (delete all data!)
docker compose down -v
```

### Accessing Services

```bash
# MongoDB shell
docker exec -it almanac_mongodb mongosh -u admin -p admin123

# Redis CLI
docker exec -it almanac_redis redis-cli

# Memgraph shell
docker exec -it almanac_memgraph mgconsole
```

## Troubleshooting

### Services Won't Start

```bash
# Check if ports are already in use
lsof -i :27017  # MongoDB
lsof -i :6379   # Redis
lsof -i :6333   # Qdrant
lsof -i :7687   # Memgraph

# Stop conflicting services or change ports in docker-compose.yml
```

### Database Connection Failed

```
Error: Failed to connect to MongoDB
```

**Fix**: Ensure Docker containers are running:

```bash
docker compose ps
docker compose up -d
```

### Out of Memory

```
Error: JavaScript heap out of memory
```

**Fix**: Reduce concurrency settings:

```bash
DB_INDEXING_CONCURRENCY=16
VECTOR_INDEXING_CONCURRENCY=16
GRAPH_EXTRACTION_CONCURRENCY=16
```

### Qdrant Collection Issues

If you need to delete and recreate collections:

```bash
# Access Qdrant UI
open http://localhost:6333/dashboard

# Or use API
curl -X DELETE http://localhost:6333/collections/almanac
```

## Next Steps

- **[Quick Start](quickstart.md)** - Start using Almanac
- **[Installation](installation.md)** - Detailed setup instructions
- **[Custom MCP Servers](../custom-mcp-servers/README.md)** - Add data sources
- **[Query & Search](../query-search/api.md)** - Query your data
