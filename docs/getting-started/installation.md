# Installation

This guide covers different ways to install and run Almanac locally, from native development to Docker containers.

## Prerequisites

- **Node.js** >= 24.0.0
- **pnpm** >= 8.0.0
- **Docker Desktop** (or Docker Engine + Docker Compose)
- **8GB RAM** minimum (16GB recommended for large datasets)
- **10GB disk space** (more for large document collections)

## Quick Start (Recommended)

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

## Installation Options

### Option 1: Local Development (Recommended)

Run databases in Docker, applications locally for fastest development:

#### 1. Install Dependencies

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Clone and install
git clone https://github.com/tryprotege/almanac.git
cd almanac
pnpm install
```

#### 2. Start Database Services

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

#### 3. Configure Environment

```bash
cd packages/server
cp .env.example .env
```

Edit `.env` with your settings:

- LLM API keys and models
- Any other required API keys (GitHub, Notion, Slack, etc.)

The infrastructure services (MongoDB, Redis, etc.) are pre-configured in `docker-compose.yml`.

#### 4. Start Application

```bash
# From root
pnpm dev
```

Server will start on http://localhost:3000
UI will start on http://localhost:5173

### Option 2: Full Docker Setup

Run everything in Docker containers:

```bash
# Clone repository
git clone https://github.com/tryprotege/almanac.git
cd almanac

# Configure environment
cp packages/server/.env.example packages/server/.env
# Edit packages/server/.env with your API keys

# Build and start all services
pnpm run docker:prod

# Or using docker compose directly
docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d
```

This starts:

- All database services (MongoDB, Redis, Qdrant, Memgraph)
- Backend server (production build)
- Frontend UI (served by Nginx)

Access at http://localhost (port 80)

**Note**: This uses production builds without hot reload. The setup is optimized for performance with smaller image sizes and production dependencies only.

## Docker Architecture

The application consists of the following services:

### Infrastructure Services

- **MongoDB**: Document database (port 27017)
- **Qdrant**: Vector database (ports 6333, 6334)
- **Memgraph**: Graph database (ports 7687, 7444)
- **Redis**: Cache and message queue (port 6379)

### Application Services

- **Server**: Node.js backend API (port 3000)
- **Client**: React frontend (port 5173 dev / port 80 prod)

All services communicate through a shared Docker network (`almanac-network`).

### Network Architecture

```
┌─────────────────────────────────────────────────┐
│            almanac-network (bridge)             │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Client  │──│  Server  │──│ MongoDB  │     │
│  │  :5173   │  │  :3000   │  │ :27017   │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                      │                          │
│       ┌──────────────┼──────────────┐          │
│       │              │              │          │
│  ┌────▼───┐    ┌────▼────┐    ┌───▼────┐     │
│  │ Qdrant │    │Memgraph │    │ Redis  │     │
│  │ :6333  │    │  :7687  │    │ :6379  │     │
│  └────────┘    └─────────┘    └────────┘     │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Database Configuration

All databases are pre-configured in Docker with sensible defaults:

### MongoDB

- Version: 8.2.2
- Port: `27017`
- Default credentials:
  - Username: `admin`
  - Password: `admin123`
- Database: `almanac`

### Redis

- Version: Alpine 3.22
- Port: `6379`
- Persistence: AOF (Append Only File) enabled

### Qdrant

- Version: 1.16.0
- HTTP Port: `6333`
- gRPC Port: `6334`

### Memgraph

- Version: 3.7.0
- Bolt Port: `7687` (main connection)
- HTTP Port: `7444`
- Log Level: WARNING

## Useful Docker Commands

### Managing Services

```bash
# View logs
docker compose logs -f                    # All infrastructure services
docker compose -f docker-compose.prod.yml logs -f  # All services including app

# View logs for specific service
docker compose logs -f mongodb
docker compose logs -f server

# Stop services
pnpm run docker:down                      # Stop infrastructure
docker compose down                       # Alternative

pnpm run docker:prod:down                       # Stop everything (full Docker)
docker compose -f docker-compose.prod.yml down  # Alternative

# Restart services
docker compose restart mongodb
docker compose restart redis
```

### Rebuilding Containers

```bash
# Rebuild full Docker setup
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Rebuild specific service
docker compose -f docker-compose.prod.yml build server
docker compose -f docker-compose.prod.yml up -d server
```

### Accessing Containers

```bash
# Access server container
docker compose -f docker-compose.prod.yml exec server sh

# Run server scripts
docker compose -f docker-compose.prod.yml exec server pnpm --filter server run <script-name>

# Access databases directly
docker compose exec mongodb mongosh -u admin -p admin123
docker compose exec redis redis-cli
docker compose exec memgraph mgconsole
```

### Data Management

```bash
# View resource usage
docker stats

# Remove containers and networks
docker compose down
docker compose -f docker-compose.prod.yml down

# Remove containers, networks, and volumes (⚠️ deletes all data)
docker compose down -v
docker compose -f docker-compose.prod.yml down -v

# Clean up unused images
docker image prune -a
```

## Data Persistence

When using the full Docker setup, data is stored in the `./data/` directory:

- `./data/mongodb` - MongoDB data
- `./data/qdrant` - Vector embeddings
- `./data/memgraph` - Graph data
- `./data/redis` - Redis cache

**Important**: Backup this directory to preserve your data.

## Port Configuration

Default ports:

| Service         | Port  | Purpose                |
| --------------- | ----- | ---------------------- |
| Frontend (dev)  | 5173  | Web UI (local dev)     |
| Frontend (prod) | 80    | Web UI (Docker)        |
| Backend         | 3000  | REST API               |
| MongoDB         | 27017 | Document database      |
| Redis           | 6379  | Cache                  |
| Qdrant          | 6333  | Vector database (HTTP) |
| Qdrant (gRPC)   | 6334  | Vector database (gRPC) |
| Memgraph        | 7687  | Graph database (Bolt)  |
| Memgraph HTTP   | 7444  | Graph database (HTTP)  |

To change ports, edit `docker-compose.yml` or `docker-compose.prod.yml` and update the corresponding environment variables in `packages/server/.env`.

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
docker compose exec redis redis-cli ping
# Expected: PONG

# Qdrant
curl http://localhost:6333/collections

# Memgraph
echo "RETURN 'OK';" | docker compose exec -i memgraph mgconsole
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

# Check logs for all services (full Docker)
docker compose -f docker-compose.prod.yml logs

# Restart infrastructure services
docker compose down
docker compose up -d

# Restart everything (full Docker)
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
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

### Port Conflicts in Docker

If ports are already in use, change them in `docker-compose.yml` or `docker-compose.prod.yml`:

```yaml
services:
  client:
    ports:
      - '8080:80' # Change external port
```

### Database connection failed

```bash
# Check database containers are running
docker compose ps

# Check credentials in .env
cat packages/server/.env

# Test MongoDB connection
mongosh mongodb://admin:admin123@localhost:27017/almanac

# Test Redis connection
docker compose exec redis redis-cli ping

# Check Qdrant
curl http://localhost:6333/collections

# Check Memgraph
echo "RETURN 1;" | docker compose exec -i memgraph mgconsole
```

### Out of memory

```bash
# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory

# Or reduce concurrency
CONCURRENCY=16 pnpm start  # Default is 32
```

### Build Issues (Full Docker)

```bash
# Clean build (removes cache)
docker compose -f docker-compose.prod.yml build --no-cache

# Remove all containers and rebuild
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

## Upgrading

### Minor Updates

```bash
# Pull latest code
git pull origin main

# Update dependencies
pnpm install

# Restart services
pnpm start  # For local development

# Or rebuild Docker containers
pnpm run docker:prod
```

### Major Updates

```bash
# Backup databases first
./scripts/backup.sh  # If available

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

# Stop and remove all containers (full Docker setup)
docker compose -f docker-compose.prod.yml down -v

# Remove images
docker compose down --rmi all
docker compose -f docker-compose.prod.yml down --rmi all
```

### Remove Code

```bash
# Remove repository
cd ..
rm -rf almanac
```

### Remove Data

```bash
# Remove local data directory (⚠️ deletes all data)
rm -rf ./data/
```

## Best Practices

### Development Workflow

1. Use `pnpm start` for the fastest development experience (databases in Docker, apps local)
2. Use full Docker setup (`docker-compose.prod.yml`) when you need a production-like environment
3. Never commit your `.env` file (use `.env.example` as a template)

### Working with Docker

1. Check logs regularly: `docker compose logs -f`
2. Monitor resource usage: `docker stats`
3. Back up your `./data/` directory regularly
4. Use `docker compose down -v` carefully (it deletes all data)

## Next Steps

- **[Configuration Guide](configuration.md)** - Configure LLM models, API keys, etc.
- **[Quick Start](quickstart.md)** - Connect your first data source
- **[Data Sources](../custom-mcp-servers/README.md)** - Add more integrations
- **[Architecture](../core-concepts/architecture.md)** - Learn how Almanac works

## Support

For issues or questions:

1. Check service logs: `docker compose logs <service-name>`
2. Verify environment configuration in `packages/server/.env`
3. Review the main README.md for application-specific setup
