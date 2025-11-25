# ebee-oss

## Development Environment Setup

This project uses Docker Compose to manage the following services:

- **MongoDB**: Document database
- **Qdrant**: Vector database
- **Memgraph**: Graph database
- **Redis**: In-memory data store

### Prerequisites

- Docker Desktop or Docker Engine installed
- Docker Compose (usually included with Docker Desktop)

### Quick Start

1. **Start all services:**

   ```bash
   docker-compose up -d
   ```

2. **Stop all services:**

   ```bash
   docker-compose down
   ```

3. **View logs:**

   ```bash
   # All services
   docker-compose logs -f

   # Specific service
   docker-compose logs -f mongodb
   ```

4. **Stop and remove all data:**
   ```bash
   docker-compose down -v
   rm -rf ./.data
   ```

### Service Access

All services are accessible from your local network:

| Service  | Port(s)    | Connection Details                                |
| -------- | ---------- | ------------------------------------------------- |
| MongoDB  | 27017      | `mongodb://admin:admin123@localhost:27017`        |
| Qdrant   | 6333, 6334 | HTTP: `http://localhost:6333`, gRPC: `6334`       |
| Memgraph | 7687, 7444 | Bolt: `bolt://localhost:7687`, Monitoring: `7444` |
| Redis    | 6379       | `redis://localhost:6379`                          |

### Client Applications

**Memgraph:**

- Download [Memgraph Lab](https://memgraph.com/download) for visual graph database management
- Connect using Bolt protocol: `bolt://localhost:7687`

**Qdrant:**

- Built-in web dashboard: [http://localhost:6333/dashboard](http://localhost:6333/dashboard)

**MongoDB:**

- [MongoDB Compass](https://www.mongodb.com/products/compass) - official GUI client
- [DataGrip](https://www.jetbrains.com/datagrip/) - multi-database IDE (supports PostgreSQL, MongoDB, Redis, and more)

**Redis:**

- [DataGrip](https://www.jetbrains.com/datagrip/) - multi-database IDE
- Redis CLI (included in container): `docker-compose exec redis redis-cli`

### Data Persistence

All data is stored in the `./.data` directory:

- `./.data/mongodb` - MongoDB database files
- `./.data/mongodb-config` - MongoDB configuration
- `./.data/qdrant` - Qdrant vector storage
- `./.data/memgraph` - Memgraph graph database
- `./.data/redis` - Redis persistence files

This directory is git-ignored and will persist data across container restarts.

### Useful Commands

```bash
# Check service status
docker-compose ps

# Restart a specific service
docker-compose restart mongodb

# Pull latest images
docker-compose pull

# Rebuild and restart services
docker-compose up -d --build

# Execute commands in a service
docker-compose exec mongodb mongosh
docker-compose exec redis redis-cli
```

### Connection Examples

**MongoDB (with mongosh):**

```bash
mongosh "mongodb://admin:admin123@localhost:27017"
```

**Redis:**

```bash
redis-cli -h localhost -p 6379
```

**Qdrant (HTTP API):**

```bash
curl http://localhost:6333/collections
```

**Memgraph:**
Use any Bolt-compatible client with `bolt://localhost:7687`

### Troubleshooting

- If ports are already in use, modify the port mappings in `docker-compose.yml`
- Ensure Docker daemon is running: `docker info`
- Check service logs: `docker-compose logs <service-name>`
- Remove all containers and start fresh: `docker-compose down && docker-compose up -d`
