# Installation

This guide covers different ways to install and deploy Almanac, from local development to production environments.

## Prerequisites

- **Node.js** >= 24.0.0
- **pnpm** >= 8.0.0
- **Docker Desktop** (or Docker Engine + Docker Compose)
- **2GB RAM** minimum (8GB+ recommended for large datasets)
- **1GB disk space** (more for large document collections)

## Quick Install (Recommended)

The fastest way to get started:

```bash
# Clone repository
git clone https://github.com/tryprotege/almanac.git
cd almanac

# Install dependencies
pnpm install

# Start all services
pnpm start
```

This will:

1. Start Docker containers for databases (MongoDB, Redis, Qdrant, Memgraph)
2. Start backend server locally (port 3000)
3. Start frontend UI locally (port 5173)

Open http://localhost:5173 to access the UI.

## Manual Installation

For more control over the installation process:

### 1. Install Dependencies

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Clone and install
git clone https://github.com/tryprotege/almanac.git
cd almanac
pnpm install
```

### 2. Start Database Services

```bash
# Start Docker infrastructure services
pnpm run docker:infra

# Or using docker compose directly
docker compose up -d

# Verify all services are running
docker compose ps
```

Expected output:

```
NAME                COMMAND                  STATUS              PORTS
almanac_mongodb     "docker-entrypoint.s…"   Up 2 minutes        0.0.0.0:27017->27017/tcp
almanac_redis       "docker-entrypoint.s…"   Up 2 minutes        0.0.0.0:6379->6379/tcp
almanac_qdrant      "./qdrant"               Up 2 minutes        0.0.0.0:6333->6333/tcp, 0.0.0.0:6334->6334/tcp
almanac_memgraph    "/usr/lib/memgraph/m…"   Up 2 minutes        0.0.0.0:7687->7687/tcp, 0.0.0.0:7444->7444/tcp
```

### 3. Configure Environment

```bash
cd packages/server
cp .env.example .env
```

Edit `.env` with your settings (see [Configuration Guide](configuration.md)).

### 4. Start Backend Server

```bash
# From packages/server
pnpm dev
```

Server will start on http://localhost:3000

### 5. Start Frontend (Optional)

```bash
# From packages/client
cd ../client
pnpm dev
```

UI will start on http://localhost:5173

## Docker-Only Installation

You have two options for running in Docker:

### Option 1: Development Mode (Hot Reload)

Run both infrastructure and application in Docker with hot reloading:

```bash
# Clone repository
git clone https://github.com/tryprotege/almanac.git
cd almanac

# Install dependencies (needed for initial setup)
pnpm install

# Build and start everything in Docker
pnpm run docker:dev:build
```

This starts:

- All database services (MongoDB, Redis, Qdrant, Memgraph)
- Backend server (containerized)
- Frontend UI (containerized)

Access at http://localhost:5173

### Option 2: Production Mode

Run production-optimized containers:

```bash
# Clone repository
git clone https://github.com/tryprotege/almanac.git
cd almanac

# Build and start
pnpm run docker:prod

# Or using docker compose directly
docker compose -f docker-compose.prod.yml up -d
```

This includes:

- All database services
- Backend server (production build)
- Frontend UI (production build)
- Nginx reverse proxy

Access at http://localhost (port 80)

## Production Deployment

### Docker Compose (Recommended)

For single-server deployments:

```bash
# Clone on production server
git clone https://github.com/tryprotege/almanac.git
cd almanac

# Set production environment variables
cp packages/server/.env.example packages/server/.env
# Edit packages/server/.env with production settings

# Start services
pnpm run docker:prod

# Or using docker compose directly
docker compose -f docker-compose.prod.yml up -d
```

The production setup includes auto-restart by default (`restart: unless-stopped`).

## Database Setup

### MongoDB

**Development**: Docker container (included)

The Docker setup uses MongoDB 8.2.2 with default credentials:

- Username: `admin`
- Password: `admin123`
- Port: `27017`

**Production Options**:

1. **MongoDB Atlas** (Managed, Recommended)

   ```bash
   # In packages/server/.env
   MONGO_HOST=cluster.mongodb.net
   MONGO_PORT=27017
   MONGO_USERNAME=your-user
   MONGO_PASSWORD=your-password
   MONGO_DB_NAME=almanac
   # Add connection options as needed
   ```

2. **Self-Hosted**

   ```bash
   # Install MongoDB
   # Ubuntu
   sudo apt install mongodb-org

   # macOS
   brew install mongodb-community

   # Start service
   sudo systemctl start mongod
   ```

### Redis

**Development**: Docker container (included)

The Docker setup uses Redis Alpine 3.22 with persistence enabled:

- Port: `6379`
- Persistence: AOF (Append Only File) enabled

**Production Options**:

1. **Redis Cloud** (Managed)

   ```bash
   # In packages/server/.env
   REDIS_HOST=redis-12345.cloud.redislabs.com
   REDIS_PORT=12345
   REDIS_PASSWORD=your-password
   REDIS_DB=0
   ```

2. **AWS ElastiCache**
   ```bash
   # In packages/server/.env
   REDIS_HOST=my-cluster.abcdef.0001.use1.cache.amazonaws.com
   REDIS_PORT=6379
   REDIS_PASSWORD=
   REDIS_DB=0
   ```

### Qdrant

**Development**: Docker container (included)

The Docker setup uses Qdrant 1.16.0:

- HTTP Port: `6333`
- gRPC Port: `6334`

**Production Options**:

1. **Qdrant Cloud** (Managed, Recommended)

   ```bash
   # In packages/server/.env
   QDRANT_HOST=xyz.cloud.qdrant.io
   QDRANT_PORT=6333
   QDRANT_API_KEY=your-api-key
   ```

2. **Self-Hosted**

   ```bash
   # Docker
   docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant:v1.16.0

   # Or compile from source
   git clone https://github.com/qdrant/qdrant.git
   cd qdrant && cargo build --release
   ```

### Memgraph

**Development**: Docker container (included)

The Docker setup uses Memgraph 3.7.0:

- Bolt Port: `7687`
- HTTP Port: `7444`
- Log Level: WARNING (reduce verbosity)

**Production Options**:

1. **Memgraph Cloud** (Managed)

   ```bash
   # In packages/server/.env
   MEMGRAPH_HOST=cloud.memgraph.com
   MEMGRAPH_PORT=7687
   MEMGRAPH_USERNAME=your-user
   MEMGRAPH_PASSWORD=your-password
   ```

2. **Self-Hosted**
   ```bash
   # Ubuntu
   wget https://memgraph.com/download/memgraph-latest.deb
   sudo dpkg -i memgraph-latest.deb
   sudo systemctl start memgraph
   ```

## System Requirements

### Minimum (Development)

- **CPU**: 2 cores
- **RAM**: 8GB
- **Disk**: 10GB SSD
- **Network**: 10 Mbps

### Recommended (Production)

- **CPU**: 8 cores (16 for large workloads)
- **RAM**: 32GB (64GB for >1M documents)
- **Disk**: 100GB SSD (more for vectors/graph)
- **Network**: 100 Mbps+

### Scaling Guidelines

**Small** (< 100K documents):

- 4 CPU cores
- 16GB RAM
- 50GB disk

**Medium** (100K - 1M documents):

- 8 CPU cores
- 32GB RAM
- 200GB disk

**Large** (1M - 10M documents):

- 16 CPU cores
- 64GB RAM
- 500GB disk

**Enterprise** (> 10M documents):

- Multiple servers
- Distributed Qdrant cluster
- Memgraph Enterprise
- Load balancer

## Port Configuration

Default ports:

| Service       | Port  | Purpose                |
| ------------- | ----- | ---------------------- |
| Backend       | 3000  | REST API               |
| Frontend      | 5173  | Web UI (dev)           |
| MongoDB       | 27017 | Document database      |
| Redis         | 6379  | Cache                  |
| Qdrant        | 6333  | Vector database (HTTP) |
| Qdrant (gRPC) | 6334  | Vector database (gRPC) |
| Memgraph      | 7687  | Graph database (Bolt)  |
| Memgraph HTTP | 7444  | Graph database (HTTP)  |

To change ports, edit `docker-compose.yml` and update the corresponding environment variables in `packages/server/.env`.

## Verification

After installation, verify everything works:

### 1. Check Services

```bash
# Backend health check
curl http://localhost:3000/health

# Expected response
{"status":"ok","timestamp":"2024-01-12T..."}
```

### 2. Check Databases

```bash
# MongoDB
curl http://localhost:27017

# Redis
redis-cli ping
# Expected: PONG

# Qdrant
curl http://localhost:6333/collections

# Memgraph
echo "RETURN 'OK';" | docker exec -i almanac-memgraph mgconsole
```

### 3. Run Test Query

```bash
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query":"test","mode":"naive"}'
```

Should return query results (empty if no data indexed yet).

## Troubleshooting

### Services won't start

```bash
# Check Docker is running
docker ps

# Check logs for infrastructure services
docker compose logs

# Check logs for app containers (if using docker:dev)
pnpm run docker:logs

# Restart infrastructure services
docker compose down
docker compose up -d

# Restart everything including app containers
pnpm run docker:down
pnpm run docker:dev
```

### Port already in use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 pnpm dev
```

### Database connection failed

```bash
# Check database containers are running
docker compose ps

# Check credentials in .env
cat packages/server/.env

# Test MongoDB connection (with default credentials)
mongosh mongodb://admin:admin123@localhost:27017/almanac

# Test Redis connection
redis-cli ping

# Check Qdrant
curl http://localhost:6333/collections

# Check Memgraph (if mgconsole is installed)
echo "RETURN 1;" | mgconsole --host localhost --port 7687
```

### Out of memory

```bash
# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory

# Or reduce concurrency
CONCURRENCY=16 pnpm start  # Default is 32
```

## Upgrading

### Minor Updates

```bash
# Pull latest code
git pull origin main

# Update dependencies
pnpm install

# Restart services
pnpm start
```

### Major Updates

```bash
# Backup databases first
./scripts/backup.sh

# Pull latest code
git pull origin main

# Update dependencies
pnpm install

# Run migrations (if any)
pnpm run migrate

# Restart services
pnpm start
```

## Uninstallation

### Remove Services

```bash
# Stop and remove infrastructure containers
docker compose down -v

# Stop and remove all containers (including app)
docker compose --profile app down -v

# Stop production containers
pnpm run docker:down:prod

# Remove images
docker compose down --rmi all
docker compose --profile app down --rmi all
```

### Remove Code

```bash
# Remove repository
cd ..
rm -rf almanac
```

### Remove Data

```bash
# Remove local data directory (WARNING: deletes all data)
rm -rf .data/

# The new setup uses a local .data/ directory instead of Docker volumes
# This makes data easier to backup and inspect
```

## Next Steps

- **[Configuration Guide](configuration.md)** - Configure LLM models, databases, etc.
- **[Quick Start](quickstart.md)** - Connect your first data source
- **[Data Sources](../custom-mcp-servers/README.md)** - Add more integrations
