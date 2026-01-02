# ebee-oss

A lightning-fast data access platform for AI Agents built with a modern monorepo architecture.

## 📦 Monorepo Structure

This project uses pnpm workspaces to manage multiple packages:

```
ebee-oss/
├── packages/
│   ├── client/          # React + Vite frontend
│   └── server/          # Express.js backend
├── pnpm-workspace.yaml  # Workspace configuration
└── docker-compose.yml   # Docker services
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 24.0.0
- pnpm >= 8.0.0
- Docker Desktop or Docker Engine
- Docker Compose

### Installation

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Start development servers:**

   ```bash
   # Start all services (client + server)
   pnpm dev

   # Or start individually
   pnpm dev:client  # Client on http://localhost:5173
   pnpm dev:server  # Server on http://localhost:3000
   ```

### Docker Development

1. **Start all services (databases + application):**

   ```bash
   pnpm docker:all
   ```

2. **Start only infra:**

   ```bash
   pnpm docker:infra
   ```

3. **Stop all services:**

   ```bash
   pnpm docker:down
   ```

## 📚 Available Scripts

### Root Level

- `pnpm dev` - Start both client and server in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run tests across all packages
- `pnpm type-check` - Type check all packages

### Sync and Benchmark Script

The `scripts/syncAndBenchmark.sh` script automates the complete workflow of wiping data, starting services, registering MCP servers, syncing records, indexing data, and running benchmarks.

**Basic Usage:**

```bash
./scripts/syncAndBenchmark.sh
```

**Options:**

- `--mcp-servers=<server1,server2>` - Specify which MCP servers to enable (comma-separated). Available servers: `notion`, `github`, `fathom`, `slack`. If not specified, all servers are enabled.
- `--skip-benchmark` - Skip running benchmark tests
- `--skip-index-vector` - Skip vector indexing
- `--skip-index-graph` - Skip graph indexing

**Examples:**

```bash
# Enable only GitHub and Notion servers
./scripts/syncAndBenchmark.sh --mcp-servers=github,notion

# Skip benchmark tests but run full indexing
./scripts/syncAndBenchmark.sh --skip-benchmark

# Enable only Slack, skip vector indexing
./scripts/syncAndBenchmark.sh --mcp-servers=slack --skip-index-vector

# Enable all servers, skip both indexing steps
./scripts/syncAndBenchmark.sh --skip-index-vector --skip-index-graph

# Full workflow with only GitHub and Fathom
./scripts/syncAndBenchmark.sh --mcp-servers=github,fathom
```

**What the script does:**

1. Wipes existing data from all databases
2. Starts the development server
3. Registers specified MCP servers (GitHub, Notion, Fathom, Slack)
4. Syncs records from registered MCP servers
5. Indexes vectors for semantic search (unless skipped)
6. Indexes graph relationships (unless skipped)
7. Runs benchmark tests (unless skipped)
8. Cleans up running processes

### Client Package

```bash
cd packages/client
pnpm dev      # Start Vite dev server
pnpm build    # Build for production
pnpm preview  # Preview production build
```

### Server Package

```bash
cd packages/server
pnpm dev           # Start server with hot reload
pnpm build         # Build TypeScript
pnpm start         # Start production server
pnpm test          # Run tests
```

## 🗄️ Development Environment

This project uses Docker Compose to manage the following services:

- **MongoDB**: Document database
- **Qdrant**: Vector database
- **Memgraph**: Graph database
- **Redis**: In-memory data store
- **Server**: Express.js backend (when using Docker)
- **Client**: React frontend (when using Docker)

### Service Access

| Service  | Port(s)    | Connection Details                                |
| -------- | ---------- | ------------------------------------------------- |
| Client   | 5173       | `http://localhost:5173`                           |
| Server   | 3000       | `http://localhost:3000`                           |
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

## 🏗️ Architecture

### Client (packages/client)

- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: CSS

### Server (packages/server)

- **Framework**: Express.js
- **Language**: TypeScript
- **Databases**: MongoDB, Qdrant, Memgraph, Redis
- **Features**: Vector search, graph indexing, schema learning

## 📝 Environment Variables

Copy `.env.example` to `.env` in the server package and configure:

```bash
cp packages/server/.env.example packages/server/.env
```

## 📄 License

This project is licensed under the terms specified in the LICENSE file.
