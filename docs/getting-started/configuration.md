# Configuration

Complete guide to configuring Almanac for your environment.

## Environment Variables

All configuration is done through environment variables in `packages/server/.env`.

### Quick Setup

```bash
cd packages/server
cp .env.example .env
# Edit .env with your settings
```

## LLM Configuration

Almanac requires LLM models for three purposes:

1. **Chat Model**: Query understanding, entity extraction, relationship extraction
2. **Embedding Model**: Vector embeddings for semantic search
3. **Reranking Model** (Optional): Improve search result relevance

### OpenAI Configuration

```bash
# Provider
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Models
LLM_CHAT_MODEL=gpt-4o
LLM_EMBEDDING_MODEL=text-embedding-3-large
LLM_RERANKER_MODEL=  # Leave empty, uses chat model

# Optional: Organization
OPENAI_ORG_ID=org-...
```

**Recommended Models**:

- Chat: `gpt-4o` or `gpt-4-turbo`
- Embedding: `text-embedding-3-large` (best quality) or `text-embedding-3-small` (cost-effective)

### Anthropic Configuration

```bash
# Provider
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Models
LLM_CHAT_MODEL=claude-3-5-sonnet-20241022
LLM_EMBEDDING_MODEL=  # Anthropic doesn't provide embeddings
LLM_RERANKER_MODEL=  # Leave empty

# You'll need OpenAI for embeddings
OPENAI_API_KEY=sk-...
LLM_EMBEDDING_MODEL=text-embedding-3-large
```

**Recommended Models**:

- Chat: `claude-3-5-sonnet-20241022` (best) or `claude-3-7-sonnet-20250219` (fastest)

### Local Models (Ollama)

```bash
# Provider
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434

# Models (must be pulled first)
LLM_CHAT_MODEL=llama3.1:70b
LLM_EMBEDDING_MODEL=nomic-embed-text
LLM_RERANKER_MODEL=  # Leave empty
```

**Setup Ollama**:

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull models
ollama pull llama3.1:70b
ollama pull nomic-embed-text
```

**Recommended Models**:

- Chat: `llama3.1:70b` (best quality) or `llama3.1:8b` (faster)
- Embedding: `nomic-embed-text` or `mxbai-embed-large`

### Custom API Endpoints

```bash
# Custom OpenAI-compatible endpoint
LLM_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://your-custom-endpoint.com/v1

LLM_CHAT_MODEL=your-model-name
LLM_EMBEDDING_MODEL=your-embedding-model
```

## Database Configuration

### MongoDB

```bash
# Development (Docker - uses default credentials from docker-compose.yml)
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_USERNAME=admin
MONGO_PASSWORD=admin123
MONGO_DB_NAME=almanac

# Production (MongoDB Atlas)
MONGO_HOST=cluster.mongodb.net
MONGO_PORT=27017
MONGO_USERNAME=your-user
MONGO_PASSWORD=your-password
MONGO_DB_NAME=almanac
# Add connection options as needed

# Options
MONGODB_MAX_POOL_SIZE=50
MONGODB_MIN_POOL_SIZE=10
```

**Note**: The new Docker setup uses separate environment variables for host, port, username, and password instead of a single connection URI. This provides better flexibility for different deployment scenarios.

### Redis

```bash
# Development (Docker - no password by default)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Production (Redis Cloud)
REDIS_HOST=redis-12345.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-password
REDIS_DB=0
REDIS_TLS=true  # Enable TLS for production

# AWS ElastiCache
REDIS_HOST=my-cluster.abcdef.0001.use1.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

### Qdrant (Vector Database)

```bash
# Development (Docker - no API key needed)
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_API_KEY=

# Production (Qdrant Cloud)
QDRANT_HOST=xyz-abc123.cloud.qdrant.io
QDRANT_PORT=6333
QDRANT_API_KEY=your-api-key

# Collection settings
QDRANT_COLLECTION_NAME=almanac
QDRANT_VECTOR_SIZE=3072  # Match your embedding model
```

**Vector Sizes by Model**:

- `text-embedding-3-large`: 3072
- `text-embedding-3-small`: 1536
- `text-embedding-ada-002`: 1536
- `nomic-embed-text`: 768

### Memgraph (Graph Database)

```bash
# Development (Docker - no authentication by default)
MEMGRAPH_HOST=localhost
MEMGRAPH_PORT=7687
MEMGRAPH_USERNAME=
MEMGRAPH_PASSWORD=

# Production (Memgraph Cloud)
MEMGRAPH_HOST=cloud-xyz.memgraph.com
MEMGRAPH_PORT=7687
MEMGRAPH_USERNAME=memgraph
MEMGRAPH_PASSWORD=your-password
```

## Server Configuration

### Port and Host

```bash
# Server
PORT=3000
HOST=0.0.0.0

# CORS (allowed origins)
CORS_ORIGINS=http://localhost:5173,https://yourdomain.com
```

### Logging

```bash
# Log level: debug, info, warn, error
LOG_LEVEL=info

# Log format: json, pretty
LOG_FORMAT=pretty

# Log file
LOG_FILE=logs/almanac.log
```

### Performance

```bash
# Concurrency (parallel operations)
CONCURRENCY=32  # Default, adjust based on system

# Request timeout (ms)
REQUEST_TIMEOUT=30000

# Max payload size
MAX_PAYLOAD_SIZE=10mb
```

## MCP Server Configuration

### OAuth Credentials

For data sources requiring OAuth (Slack, GitHub, Notion):

```bash
# Slack
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
SLACK_REDIRECT_URI=http://localhost:3000/api/oauth/callback

# GitHub
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_REDIRECT_URI=http://localhost:3000/api/oauth/callback

# Notion
NOTION_CLIENT_ID=your-client-id
NOTION_CLIENT_SECRET=your-client-secret
NOTION_REDIRECT_URI=http://localhost:3000/api/oauth/callback
```

**Getting OAuth Credentials**:

1. **Slack**: https://api.slack.com/apps
2. **GitHub**: https://github.com/settings/developers
3. **Notion**: https://www.notion.so/my-integrations

### API Keys

For services using API keys:

```bash
# Fathom Analytics
FATHOM_API_KEY=your-api-key

# Linear
LINEAR_API_KEY=your-api-key

# Custom services
CUSTOM_API_KEY=your-api-key
```

## Indexing Configuration

### Entity Extraction

```bash
# Entity extraction model (uses LLM_CHAT_MODEL by default)
ENTITY_EXTRACTION_MODEL=gpt-4o

# Temperature for extraction (lower = more consistent)
ENTITY_EXTRACTION_TEMPERATURE=0.0

# Max entities per document
MAX_ENTITIES_PER_DOCUMENT=50
```

### Relationship Extraction

```bash
# Relationship extraction model
RELATIONSHIP_EXTRACTION_MODEL=gpt-4o

# Temperature
RELATIONSHIP_EXTRACTION_TEMPERATURE=0.0

# Max relationships per document
MAX_RELATIONSHIPS_PER_DOCUMENT=100
```

### Grouping

```bash
# Grouping strategy: thread, time-window, session, llm, hybrid
DEFAULT_GROUPING_STRATEGY=hybrid

# Thread grouping: max depth
THREAD_MAX_DEPTH=10

# Time window: window size (minutes)
TIME_WINDOW_SIZE=60

# Session: inactivity threshold (minutes)
SESSION_INACTIVITY_THRESHOLD=30
```

## Query Configuration

### Default Settings

```bash
# Default query mode: naive, local, global, hybrid, mix
DEFAULT_QUERY_MODE=mix

# Default top_k (candidates to retrieve)
DEFAULT_TOP_K=60

# Default chunk_top_k (results to return)
DEFAULT_CHUNK_TOP_K=20

# Score threshold (0.0-1.0)
DEFAULT_SCORE_THRESHOLD=0.5
```

### Reranking

```bash
# Enable reranking by default
ENABLE_RERANK=true

# Reranker model (uses LLM_CHAT_MODEL if not specified)
RERANKER_MODEL=gpt-4o

# Reranker batch size
RERANKER_BATCH_SIZE=20
```

## Security

### API Keys

```bash
# API key for REST API (optional)
API_KEY=your-secret-key

# Require API key for all requests
REQUIRE_API_KEY=false
```

**Using API Key**:

```bash
curl http://localhost:3000/api/query \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'
```

### Encryption

```bash
# Encryption key for sensitive data (OAuth tokens, API keys)
ENCRYPTION_KEY=your-32-character-encryption-key

# Generate secure key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rate Limiting

```bash
# Enable rate limiting
ENABLE_RATE_LIMIT=true

# Requests per minute
RATE_LIMIT_MAX=100

# Rate limit window (ms)
RATE_LIMIT_WINDOW=60000
```

## Feature Flags

### Experimental Features

```bash
# Enable experimental features
ENABLE_EXPERIMENTAL=false

# Specific experimental features
ENABLE_FEATURE_X=false
ENABLE_FEATURE_Y=false
```

### Telemetry

```bash
# Anonymous usage telemetry (helps improve Almanac)
ENABLE_TELEMETRY=true

# Sentry error tracking (production)
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=production
```

## Complete Example

Here's a complete `.env` file for production:

```bash
# === LLM Configuration ===
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
LLM_CHAT_MODEL=gpt-4o
LLM_EMBEDDING_MODEL=text-embedding-3-large

# === Database Configuration ===
# MongoDB
MONGO_HOST=cluster.mongodb.net
MONGO_PORT=27017
MONGO_USERNAME=your-user
MONGO_PASSWORD=your-password
MONGO_DB_NAME=almanac

# Redis
REDIS_HOST=redis.cloud.com
REDIS_PORT=12345
REDIS_PASSWORD=your-password
REDIS_DB=0
REDIS_TLS=true

# Qdrant
QDRANT_HOST=xyz.cloud.qdrant.io
QDRANT_PORT=6333
QDRANT_API_KEY=your-api-key
QDRANT_COLLECTION_NAME=almanac
QDRANT_VECTOR_SIZE=3072

# Memgraph
MEMGRAPH_HOST=cloud.memgraph.com
MEMGRAPH_PORT=7687
MEMGRAPH_USERNAME=memgraph
MEMGRAPH_PASSWORD=your-password

# === Server Configuration ===
PORT=3000
HOST=0.0.0.0
CORS_ORIGINS=https://yourdomain.com
LOG_LEVEL=info
LOG_FORMAT=json

# === Performance ===
CONCURRENCY=32
REQUEST_TIMEOUT=30000

# === OAuth ===
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_REDIRECT_URI=https://yourdomain.com/api/oauth/callback

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=https://yourdomain.com/api/oauth/callback

# === Security ===
ENCRYPTION_KEY=your-32-character-encryption-key
ENABLE_RATE_LIMIT=true
RATE_LIMIT_MAX=100

# === Indexing ===
DEFAULT_GROUPING_STRATEGY=hybrid
MAX_ENTITIES_PER_DOCUMENT=50
MAX_RELATIONSHIPS_PER_DOCUMENT=100

# === Query ===
DEFAULT_QUERY_MODE=mix
ENABLE_RERANK=true
DEFAULT_TOP_K=60
DEFAULT_CHUNK_TOP_K=20
```

## Environment-Specific Configs

### Development

```bash
# .env.development
LOG_LEVEL=debug
LOG_FORMAT=pretty
ENABLE_EXPERIMENTAL=true
CONCURRENCY=16  # Lower for development machine
```

### Staging

```bash
# .env.staging
LOG_LEVEL=info
ENABLE_TELEMETRY=true
SENTRY_ENVIRONMENT=staging
```

### Production

```bash
# .env.production
LOG_LEVEL=warn
LOG_FORMAT=json
ENABLE_RATE_LIMIT=true
ENABLE_TELEMETRY=true
SENTRY_ENVIRONMENT=production
```

## Validation

Almanac validates your configuration on startup:

```bash
pnpm start
```

Output:

```
✓ LLM configuration valid
✓ Database connections established
✓ MCP servers initialized
✓ Ready to serve requests
```

## Troubleshooting

### Invalid LLM Configuration

```
Error: LLM_CHAT_MODEL not specified
```

**Fix**: Set `LLM_CHAT_MODEL` in `.env`

### Database Connection Failed

```
Error: Failed to connect to MongoDB
```

**Fix**: Check `MONGO_HOST`, `MONGO_PORT`, and credentials are correct and database is accessible

### OAuth Not Working

```
Error: OAuth redirect URI mismatch
```

**Fix**: Ensure `REDIRECT_URI` in `.env` matches OAuth app configuration

### Out of Memory

```
Error: JavaScript heap out of memory
```

**Fix**: Reduce `CONCURRENCY` or increase Node.js memory:

```bash
NODE_OPTIONS="--max-old-space-size=4096" pnpm start
```

## Advanced Configuration

### Custom Model Endpoints

For using different models for different tasks:

```bash
# Use Claude for chat, OpenAI for embeddings
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
LLM_CHAT_MODEL=claude-3-5-sonnet-20241022

OPENAI_API_KEY=sk-...
LLM_EMBEDDING_MODEL=text-embedding-3-large
```

### Multiple Data Source Instances

Configure multiple instances of the same data source:

```bash
# In UI, configure multiple Slack workspaces
# Each gets unique identifier
SLACK_WORKSPACE_1_TOKEN=xoxp-...
SLACK_WORKSPACE_2_TOKEN=xoxp-...
```

### Custom Qdrant Collections

Use different collections for different projects:

```bash
QDRANT_COLLECTION_NAME=project-a
# or
QDRANT_COLLECTION_NAME=project-b
```

## Next Steps

- **[Quick Start](quickstart.md)** - Start using Almanac
- **[Custom MCP Servers](../custom-mcp-servers/README.md)** - Add data sources
- **[Query & Search](../query-search/api.md)** - Query your data
