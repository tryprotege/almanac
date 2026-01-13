# Installation

This guide covers different ways to install and deploy Almanac, from local development to production environments.

## Prerequisites

- **Node.js** >= 24.0.0
- **pnpm** >= 8.0.0
- **Docker Desktop** (or Docker Engine + Docker Compose)
- **8GB RAM** minimum (16GB recommended for large datasets)
- **10GB disk space** (more for large document collections)

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

1. Start Docker containers (MongoDB, Redis, Qdrant, Memgraph)
2. Wait for services to be healthy
3. Start backend server (port 3000)
4. Start frontend UI (port 5173)

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
# Start Docker services
docker-compose up -d

# Verify all services are running
docker-compose ps
```

Expected output:

```
NAME                COMMAND                  STATUS              PORTS
almanac-mongodb     "docker-entrypoint.s…"   Up 2 minutes        0.0.0.0:27017->27017/tcp
almanac-redis       "docker-entrypoint.s…"   Up 2 minutes        0.0.0.0:6379->6379/tcp
almanac-qdrant      "./qdrant"               Up 2 minutes        0.0.0.0:6333->6333/tcp
almanac-memgraph    "/usr/lib/memgraph/m…"   Up 2 minutes        0.0.0.0:7687->7687/tcp
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

Run everything in Docker containers:

```bash
# Clone repository
git clone https://github.com/tryprotege/almanac.git
cd almanac

# Build and start
docker-compose -f docker-compose.prod.yml up -d
```

This includes:

- All database services
- Backend server (containerized)
- Frontend UI (containerized)
- Nginx reverse proxy

Access at http://localhost (port 80).

## Production Deployment

### Docker Compose (Recommended)

For single-server deployments:

```bash
# Clone on production server
git clone https://github.com/tryprotege/almanac.git
cd almanac

# Set production environment variables
cp .env.example .env.production
# Edit .env.production with production settings

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Enable auto-restart
docker-compose -f docker-compose.prod.yml up -d --restart=always
```

### Kubernetes

For multi-server deployments:

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check status
kubectl get pods -n almanac
```

See [k8s/README.md](https://github.com/tryprotege/almanac/tree/main/k8s) for details.

### Cloud Providers

#### AWS (ECS + RDS + ElastiCache)

```bash
# Use provided CloudFormation template
aws cloudformation create-stack \
  --stack-name almanac \
  --template-body file://cloudformation/almanac.yml \
  --parameters \
    ParameterKey=LLMApiKey,ParameterValue=your-key
```

#### Google Cloud (GKE + Cloud SQL)

```bash
# Deploy with Terraform
cd terraform/gcp
terraform init
terraform apply
```

#### Azure (AKS + CosmosDB)

```bash
# Deploy with Terraform
cd terraform/azure
terraform init
terraform apply
```

## Database Setup

### MongoDB

**Development**: Docker container (included)

**Production Options**:

1. **MongoDB Atlas** (Managed, Recommended)

   ```bash
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/almanac
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

**Production Options**:

1. **Redis Cloud** (Managed)

   ```bash
   REDIS_URL=redis://user:pass@redis-12345.cloud.redislabs.com:12345
   ```

2. **AWS ElastiCache**
   ```bash
   REDIS_URL=redis://my-cluster.abcdef.0001.use1.cache.amazonaws.com:6379
   ```

### Qdrant

**Development**: Docker container (included)

**Production Options**:

1. **Qdrant Cloud** (Managed, Recommended)

   ```bash
   QDRANT_URL=https://xyz.cloud.qdrant.io
   QDRANT_API_KEY=your-api-key
   ```

2. **Self-Hosted**

   ```bash
   # Docker
   docker run -p 6333:6333 qdrant/qdrant

   # Or compile from source
   git clone https://github.com/qdrant/qdrant.git
   cd qdrant && cargo build --release
   ```

### Memgraph

**Development**: Docker container (included)

**Production Options**:

1. **Memgraph Cloud** (Managed)

   ```bash
   MEMGRAPH_URI=bolt://cloud.memgraph.com:7687
   MEMGRAPH_USER=user
   MEMGRAPH_PASSWORD=pass
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
| Qdrant        | 6333  | Vector database        |
| Qdrant (gRPC) | 6334  | Vector database (gRPC) |
| Memgraph      | 7687  | Graph database (Bolt)  |
| Memgraph Lab  | 3001  | Graph UI (optional)    |

To change ports, edit `docker-compose.yml` or set environment variables.

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

# Check logs
docker-compose logs

# Restart services
docker-compose down
docker-compose up -d
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
# Check database is accessible
docker-compose ps

# Check credentials in .env
cat packages/server/.env

# Test connection
mongosh mongodb://localhost:27017/almanac
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
# Stop and remove containers
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

### Remove Code

```bash
# Remove repository
cd ..
rm -rf almanac
```

### Remove Data

```bash
# Remove Docker volumes (WARNING: deletes all data)
docker volume rm almanac_mongodb-data
docker volume rm almanac_redis-data
docker volume rm almanac_qdrant-data
docker volume rm almanac_memgraph-data
```

## Next Steps

- **[Configuration Guide](configuration.md)** - Configure LLM models, databases, etc.
- **[Quick Start](quickstart.md)** - Connect your first data source
- **[Data Sources](../custom-mcp-servers/README.md)** - Add more integrations
