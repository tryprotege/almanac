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
   docker compose up -d
   ```

2. **Stop all services:**

   ```bash
   docker compose down
   ```

### Service Access

All services are accessible from your local network:

| Service  | Port(s)    | Connection Details                                |
| -------- | ---------- | ------------------------------------------------- |
| MongoDB  | 27017      | `mongodb://admin:admin123@localhost:27017`        |
| Qdrant   | 6333, 6334 | HTTP: `http://localhost:6333`, gRPC: `6334`       |
| Memgraph | 7687, 7444 | Bolt: `bolt://localhost:7687`, Monitoring: `7444` |
| Redis    | 6379       | `redis://localhost:6379`                          |

### Database Applications to Inspect the Data

**Memgraph:**

- Download [Memgraph Lab](https://memgraph.com/download) for visual graph database management
- Connect using Bolt protocol: `bolt://localhost:7687`

**Qdrant:**

- Built-in web dashboard: [http://localhost:6333/dashboard](http://localhost:6333/dashboard)

**MongoDB:**

- [MongoDB Compass](https://www.mongodb.com/products/compass) - official GUI client
