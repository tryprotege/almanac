# Docker Setup Guide

This guide covers running the Almanac application using Docker for both development and production environments.

## Prerequisites

- Docker (v20.10+)
- Docker Compose (v2.0+)

## Architecture

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

## Development Setup

### 1. Environment Configuration

First, create a `.env` file in `packages/server/` based on the example:

```bash
cp packages/server/.env.example packages/server/.env
```

Edit `packages/server/.env` and configure:

- LLM API keys and models
- Any other required API keys (GitHub, Notion, Slack, etc.)

The infrastructure services (MongoDB, Redis, etc.) are pre-configured in `docker-compose.yml`.

### 2. Start Infrastructure Only

To start just the databases and infrastructure:

```bash
pnpm run docker:infra
# or
docker compose up -d
```

This starts MongoDB, Qdrant, Memgraph, and Redis without the application services.

### 3. Start Everything (Infrastructure + Application)

To start all services including the server and client:

```bash
pnpm run docker:all
# or
docker compose --profile app up -d
```

The application will be available at:

- **Client**: http://localhost:5173
- **Server API**: http://localhost:3000

### 4. View Logs

```bash
# All services
docker compose --profile app logs -f

# Specific service
docker compose logs -f server
docker compose logs -f client
```

### 5. Stop Services

```bash
# Stop everything
pnpm run docker:down
# or
docker compose --profile app down

# Stop infrastructure only
docker compose down
```

## Development Features

### Hot Reload

Both the server and client support hot reload in development mode:

- Server: Watches `packages/server/src` directory
- Client: Watches `packages/client/src` directory

Changes to source files will automatically trigger rebuilds.

### Volume Mounts

Development volumes are configured to mount source code:

- Server: `./packages/server/src` → `/app/packages/server/src`
- Client: `./packages/client/src` → `/app/packages/client/src`
- Shared packages: `./packages/shared-util` and `./packages/indexing-engine`

### Accessing Services

- Client: http://localhost:5173
- Server: http://localhost:3000
- MongoDB: localhost:27017
- Qdrant: http://localhost:6333
- Memgraph: localhost:7687
- Redis: localhost:6379

## Production Deployment

### 1. Build Production Images

```bash
docker compose -f docker-compose.prod.yml build
```

This creates optimized production builds:

- **Server**: Compiled TypeScript, production dependencies only
- **Client**: Static build served by Nginx

### 2. Start Production Services

```bash
docker compose -f docker-compose.prod.yml up -d
```

The application will be available at:

- **Client**: http://localhost:80
- **Server API**: http://localhost:3000

### 3. Production Differences

- Client is served by Nginx (port 80) instead of Vite dev server
- No hot reload or source maps
- Optimized builds with production dependencies only
- Smaller image sizes
- Better performance

### 4. Data Persistence

Production data is stored in `./data/` directory:

- `./data/mongodb` - MongoDB data
- `./data/qdrant` - Vector embeddings
- `./data/memgraph` - Graph data
- `./data/redis` - Redis cache

**Important**: Backup this directory regularly in production.

## Useful Commands

### Rebuild Services

```bash
# Development
docker compose --profile app build
docker compose --profile app up -d --force-recreate

# Production
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### Execute Commands in Containers

```bash
# Access server container
docker compose exec server sh

# Run server scripts
docker compose exec server pnpm --filter server run <script-name>

# Access MongoDB
docker compose exec mongodb mongosh -u admin -p admin123
```

### Clean Up

```bash
# Remove containers and networks
docker compose --profile app down

# Remove containers, networks, and volumes (⚠️ deletes data)
docker compose --profile app down -v

# Remove unused images
docker image prune -a
```

### Monitoring

```bash
# View resource usage
docker stats

# Inspect a service
docker compose exec server ps aux
docker compose exec server top
```

## Troubleshooting

### Port Conflicts

If ports are already in use, you can change them in `docker-compose.yml`:

```yaml
services:
  client:
    ports:
      - '8080:5173' # Change 5173 to 8080
```

### Build Issues

```bash
# Clean build (removes cache)
docker compose build --no-cache

# Remove all containers and rebuild
docker compose --profile app down
docker compose --profile app build --no-cache
docker compose --profile app up -d
```

### Connection Issues

Ensure all services are healthy:

```bash
docker compose --profile app ps
```

Check service logs for errors:

```bash
docker compose logs server
docker compose logs client
```

### Database Access

Access databases directly:

```bash
# MongoDB
docker compose exec mongodb mongosh -u admin -p admin123

# Redis
docker compose exec redis redis-cli

# Memgraph (requires memgraph client)
docker compose exec memgraph mgconsole
```

### Environment Variables

If environment variables aren't being picked up:

1. Ensure `packages/server/.env` exists
2. Restart containers: `docker compose --profile app restart`
3. Check logs: `docker compose logs server`

## Best Practices

### Development

1. Use `docker:infra` for infrastructure and run server/client locally for faster development
2. Use `docker:all` when you need the full containerized environment
3. Commit your `.env.example` but never commit `.env`

### Production

1. Use strong passwords for MongoDB
2. Configure proper API keys and secrets
3. Set up proper logging and monitoring
4. Regularly backup the `./data/` directory
5. Use environment-specific `.env` files
6. Consider using Docker secrets for sensitive data

## Network Architecture

All services communicate through the `almanac-network` bridge network:

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

## Support

For issues or questions:

1. Check service logs: `docker compose logs <service-name>`
2. Verify environment configuration in `packages/server/.env`
3. Review the main README.md for application-specific setup
