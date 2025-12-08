# eBee Deployment Guide

This guide covers deploying eBee in various environments, from local development to production deployments.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Docker Deployment](#docker-deployment)
- [Production Deployment](#production-deployment)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Security Considerations](#security-considerations)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

### System Requirements

**Minimum Requirements** (Development):

- CPU: 4 cores
- RAM: 8GB
- Storage: 20GB SSD
- OS: macOS, Linux, or Windows with WSL2

**Recommended Requirements** (Production):

- CPU: 8+ cores
- RAM: 16GB+
- Storage: 100GB+ SSD
- OS: Linux (Ubuntu 22.04 LTS or similar)

### Software Requirements

- **Node.js**: v24.0.0 or higher
- **pnpm**: v8.0.0 or higher
- **Docker**: v24.0.0 or higher (for containerized deployment)
- **Docker Compose**: v2.20.0 or higher

### Verify Prerequisites

```bash
# Check Node.js version
node --version
# Should output: v24.x.x or higher

# Check pnpm version
pnpm --version
# Should output: 8.x.x or higher

# Check Docker version
docker --version
# Should output: Docker version 24.x.x or higher

# Check Docker Compose version
docker compose version
# Should output: Docker Compose version v2.x.x or higher
```

---

## 💻 Local Development Setup

### Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/your-org/ebee-oss.git
cd ebee-oss
```

### Step 2: Install Dependencies

```bash
# Install all dependencies using pnpm workspaces
pnpm install
```

### Step 3: Start Infrastructure Services

```bash
# Start MongoDB, Qdrant, Memgraph, and Redis
pnpm docker:infra
```

This starts:

- **MongoDB** on port 27017
- **Qdrant** on ports 6333 (HTTP) and 6334 (gRPC)
- **Memgraph** on ports 7687 (Bolt) and 7444 (Monitoring)
- **Redis** on port 6379

### Step 4: Configure Environment Variables

```bash
# Copy example environment file
cp packages/server/.env.example packages/server/.env

# Edit the file with your settings
nano packages/server/.env
```

**Minimum required configuration**:

```bash
# LLM Configuration
LLM_PROVIDER=openrouter
LLM_API_KEY=your_api_key_here
LLM_CHAT_MODEL=openai/gpt-oss-20b
LLM_EMBEDDING_MODEL=qwen/qwen3-embedding-0.6b

# Database connections (defaults work with docker:infra)
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_USERNAME=admin
MONGO_PASSWORD=admin123
MONGO_DB_NAME=ebee

REDIS_HOST=localhost
REDIS_PORT=6379

MEMGRAPH_HOST=localhost
MEMGRAPH_PORT=7687

QDRANT_HOST=localhost
QDRANT_PORT=6333
```

### Step 5: Start Development Servers

```bash
# Start both server and client
pnpm dev

# Or start individually
pnpm dev:server  # Server on http://localhost:3000
pnpm dev:client  # Client on http://localhost:5173
```

### Step 6: Verify Installation

```bash
# Check server health
curl http://localhost:3000/health

# Open client in browser
open http://localhost:5173
```

---

## 🐳 Docker Deployment

### Option 1: Full Docker Deployment (Recommended for Testing)

Start everything (databases + application) with Docker:

```bash
# Start all services
pnpm docker:all

# Or using docker compose directly
docker compose --profile app up -d
```

This starts:

- All infrastructure services (MongoDB, Qdrant, Memgraph, Redis)
- eBee server (port 3000)
- eBee client (port 5173)

**Access the application**:

- Client: http://localhost:5173
- Server API: http://localhost:3000
- Server Health: http://localhost:3000/health

### Option 2: Infrastructure Only (Recommended for Development)

Start only databases, run application locally:

```bash
# Start infrastructure
pnpm docker:infra

# Run server locally
pnpm dev:server

# Run client locally
pnpm dev:client
```

### Docker Compose Commands

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f ebee_server

# Stop services
docker compose down

# Stop and remove volumes (⚠️ deletes all data)
docker compose down -v

# Restart a service
docker compose restart ebee_server

# View running services
docker compose ps
```

### Accessing Database Tools

**MongoDB Compass**:

```
Connection String: mongodb://admin:admin123@localhost:27017
```

**Qdrant Dashboard**:

```
URL: http://localhost:6333/dashboard
```

**Memgraph Lab**:

```
Download: https://memgraph.com/download
Connection: bolt://localhost:7687
```

---

## 🚀 Production Deployment

### Architecture Overview

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[Nginx/Traefik]
    end

    subgraph "Application Layer"
        API1[eBee Server 1]
        API2[eBee Server 2]
        API3[eBee Server 3]
        Worker1[Worker 1]
        Worker2[Worker 2]
    end

    subgraph "Database Layer"
        Mongo[(MongoDB<br/>Replica Set)]
        Qdrant[(Qdrant<br/>Cluster)]
        Memgraph[(Memgraph)]
        Redis[(Redis<br/>Cluster)]
    end

    LB --> API1
    LB --> API2
    LB --> API3

    API1 --> Mongo
    API2 --> Mongo
    API3 --> Mongo

    API1 --> Qdrant
    API2 --> Qdrant
    API3 --> Qdrant

    API1 --> Memgraph
    API2 --> Memgraph
    API3 --> Memgraph

    Worker1 --> Redis
    Worker2 --> Redis
    Worker1 --> Mongo
    Worker2 --> Mongo
```

## 🗄️ Database Setup

### MongoDB

**Production Configuration**:

```javascript
// Replica set configuration
rs.initiate({
  _id: "ebee-rs",
  members: [
    { _id: 0, host: "mongodb-1:27017" },
    { _id: 1, host: "mongodb-2:27017" },
    { _id: 2, host: "mongodb-3:27017" }
  ]
});

// Create indexes
use ebee;
db.records.createIndex({ source: 1, recordType: 1 });
db.records.createIndex({ source: 1, sourceId: 1 }, { unique: true });
db.records.createIndex({ sourceUpdatedAt: -1 });
db.records.createIndex({ content: "text", title: "text" });
```

**Backup Strategy**:

```bash
# Daily backup
mongodump --uri="mongodb://admin:password@localhost:27017" \
  --db=ebee_production \
  --out=/backups/$(date +%Y%m%d)

# Restore from backup
mongorestore --uri="mongodb://admin:password@localhost:27017" \
  --db=ebee_production \
  /backups/20250108
```

### Qdrant

**Production Configuration**:

```yaml
# qdrant-config.yaml
storage:
  storage_path: /qdrant/storage

service:
  http_port: 6333
  grpc_port: 6334

cluster:
  enabled: true
  p2p:
    port: 6335
```

**Backup**:

```bash
# Create snapshot
curl -X POST http://localhost:6333/collections/embeddings/snapshots

# Download snapshot
curl http://localhost:6333/collections/embeddings/snapshots/{snapshot-name} \
  --output backup.snapshot
```

### Memgraph

**Production Configuration**:

```bash
# Start with persistence
docker run -p 7687:7687 -p 7444:7444 \
  -v memgraph_data:/var/lib/memgraph \
  memgraph/memgraph:3.7.0 \
  --storage-snapshot-interval-sec=300 \
  --storage-wal-enabled=true
```

**Backup**:

```cypher
// Create snapshot
CREATE SNAPSHOT;

// List snapshots
SHOW SNAPSHOTS;
```

### Redis

**Production Configuration**:

```bash
# redis.conf
appendonly yes
appendfsync everysec
maxmemory 2gb
maxmemory-policy allkeys-lru
```

**Backup**:

```bash
# Trigger save
redis-cli BGSAVE

# Copy RDB file
cp /var/lib/redis/dump.rdb /backups/redis-$(date +%Y%m%d).rdb
```

---
