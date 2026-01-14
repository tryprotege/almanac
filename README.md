# almanac

A lightning-fast data access platform for AI Agents built with a modern monorepo architecture.

## 📦 Monorepo Structure

This project uses pnpm workspaces to manage multiple packages:

```
almanac/
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

### One-Command Setup (Recommended)

The easiest way to get started:

```bash
# 1. Clone the repository
git clone <repository-url>
cd almanac

# 2. Install dependencies
pnpm install

# 3. Start everything (Docker services + dev servers)
pnpm start
```

This single command will:

- Start all required Docker services (MongoDB, Redis, Qdrant, Memgraph)
- Wait for services to be healthy
- Start the development server and client
- Auto-create `.env` from `.env.example` if it doesn't exist

**First-time setup:**

1. Open http://localhost:5173 in your browser
2. You'll see a setup wizard if configuration is missing
3. Enter your LLM API key and other settings via the UI
4. Click "Save Configuration" and restart the server

### Alternative: Manual Setup

If you prefer to configure manually:

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Configure environment:**

   ```bash
   cp packages/server/.env.example packages/server/.env
   # Edit packages/server/.env with your API keys
   ```

3. **Start services:**

   ```bash
   # Start Docker services only
   pnpm docker:infra

   # Start development servers
   pnpm dev
   ```

### Docker-Only Development

Run everything in Docker (no local Node.js required):

```bash
# Start all services including app
pnpm docker:all

# Stop all services
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

## 📝 Environment Configuration

### UI-Based Configuration (Recommended)

The easiest way to configure Almanac is through the web interface:

1. Start the application with `pnpm start`
2. Open http://localhost:5173
3. If configuration is missing, you'll see a setup wizard
4. Navigate to **Settings → Environment** to configure:
   - LLM Provider & API Key
   - Model selections (chat, embedding, indexing)
   - Optional: Reranker settings
   - Performance tuning (concurrency settings)
5. Click "Save Configuration" and restart the server

### Manual Configuration

Alternatively, you can manually edit the `.env` file:

```bash
cp packages/server/.env.example packages/server/.env
# Edit packages/server/.env with your settings
```

**Required Settings:**

- `LLM_API_KEY` - Your LLM provider API key

**Optional Settings:**

- `RERANKER_ENABLED` - Enable reranking for better search results
- `ENCRYPTION_KEY` - Auto-generated if not provided
- Performance tuning (concurrency, batch sizes)

See [`packages/server/.env.example`](packages/server/.env.example) for all available options.

## 📄 License

This project is licensed under the terms specified in the LICENSE file.
