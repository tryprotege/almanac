# Almanac

A lightning-fast data access platform for AI Agents that leverages graph-enhanced retrieval (LightRAG) to make any data source instantly accessible.

**Follow us:** [X/Twitter](https://x.com/tryprotege) • [LinkedIn](https://www.linkedin.com/company/tryprotege)

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/tryprotege/almanac.git
cd almanac
pnpm install

# Start everything (one command)
pnpm start
```

Open http://localhost:5173 to access the UI.

**First-time setup:**

1. You'll see a setup wizard if configuration is missing
2. Enter your LLM API key and settings via the UI
3. Click "Save Configuration" and restart

## 📚 Documentation

Comprehensive guides and tutorials are available in the [docs](docs) directory:

### Getting Started

- **[Installation Guide](docs/getting-started/installation.md)** - Local development and Docker setup
- **[Quick Start](docs/getting-started/quickstart.md)** - Your first query in 5 minutes
- **[Configuration](docs/getting-started/configuration.md)** - LLM models, API keys, and settings
- **[AI Clients](docs/getting-started/ai-clients.md)** - Connect Claude Desktop, Cline, ChatGPT

### Core Concepts

- **[LightRAG Algorithm](docs/core-concepts/lightrag.md)** - Understanding the 5 query modes
- **[System Architecture](docs/core-concepts/architecture.md)** - How Almanac works under the hood

### Data Sources

- **[Custom MCP Servers](docs/custom-mcp-servers/README.md)** - Build your own integrations
- **[Data Syncing](docs/data-pipeline/syncing.md)** - How data flows through Almanac

### Query & Search

- **[API Reference](docs/query-search/api.md)** - REST API endpoints and parameters
- **[Best Practices](docs/query-search/best-practices.md)** - Optimize your queries
- **[Query Examples](docs/examples/query-modes.md)** - See all query modes in action

## 🎯 What Makes Almanac Different

- **🚀 10x Faster** - Entity-based retrieval reduces tokens while improving accuracy
- **🔌 Zero Config** - Automatically generates indexing for any MCP server
- **🧠 Smart Retrieval** - 5 query modes (naive, local, global, hybrid, mix) adapt to your needs
- **📊 Graph-Enhanced** - Understands relationships between entities, not just keywords
- **⚡ Production Ready** - Parallel processing, multi-database architecture, built to scale

## 📦 Architecture

```
External APIs → MCP Servers → Almanac
                                ↓
                    [Syncing & Indexing]
                                ↓
                    ┌─────────────────────┐
                    │     Databases       │
                    │  - MongoDB (docs)   │
                    │  - Qdrant (vectors) │
                    │  - Memgraph (graph) │
                    │  - Redis (cache)    │
                    └─────────────────────┘
                                ↓
                    [LightRAG Query Engine]
                                ↓
                            Results
```

### Monorepo Structure

```
almanac/
├── packages/
│   ├── client/          # React + Vite frontend
│   ├── server/          # Express.js backend
│   ├── shared-util/     # Shared utilities
│   ├── indexing-engine/ # LightRAG implementation
│   └── benchmark/       # Performance testing
├── docs/                # Full documentation
└── docker-compose.yml   # Infrastructure services
```

## 🗄️ Infrastructure Services

| Service  | Port       | Purpose           |
| -------- | ---------- | ----------------- |
| Frontend | 5173       | Web UI            |
| Backend  | 3000       | REST API          |
| MongoDB  | 27017      | Document database |
| Qdrant   | 6333, 6334 | Vector database   |
| Memgraph | 7687, 7444 | Graph database    |
| Redis    | 6379       | Cache             |

## 🔧 Prerequisites

- **Node.js** >= 24.0.0
- **pnpm** >= 8.0.0
- **[Docker Desktop](https://docs.docker.com/desktop/)** (or Docker Engine + Docker Compose v2.0+)
- **8GB RAM** recommended (2GB minimum)

## 📚 Available Scripts

### Quick Commands

```bash
# Start all services
pnpm start                  # Infrastructure + apps locally

# Development
pnpm dev                    # Run client + server in dev mode
pnpm build                  # Build all packages
pnpm test                   # Run all tests
pnpm type-check             # Type check all packages

# Docker options
pnpm run docker:infra       # Start databases only
pnpm run docker:dev         # Full Docker development mode
pnpm run docker:prod        # Full Docker production mode
pnpm run docker:down        # Stop all services
```

**📚 [View Full Docker Guide →](https://docs.tryprotege.com/almanac/getting-started/quickstart)**

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

### Package-Specific Scripts

**Client Package:**

```bash
cd packages/client
pnpm dev      # Start Vite dev server
pnpm build    # Build for production
pnpm preview  # Preview production build
```

**Server Package:**

```bash
cd packages/server
pnpm dev           # Start server with hot reload
pnpm build         # Build TypeScript
pnpm start         # Start production server
pnpm test          # Run tests
```

## � Database Tools

### Memgraph

- Download [Memgraph Lab](https://memgraph.com/download) for visual graph database management
- Connect using Bolt protocol: `bolt://localhost:7687`

### Qdrant

- Built-in web dashboard: [http://localhost:6333/dashboard](http://localhost:6333/dashboard)

### MongoDB

- [MongoDB Compass](https://www.mongodb.com/products/compass) - official GUI client
- Connect: `mongodb://admin:admin123@localhost:27017`

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

## 🤖 Connect AI Clients

Almanac exposes an MCP (Model Context Protocol) server that allows AI clients to directly access your indexed data:

- **Claude Desktop** - Connect via MCP configuration
- **Cline (VS Code)** - Integrate with your development workflow
- **ChatGPT** - Use Developer Mode (requires public server)

**[View AI Client Setup Guide →](docs/getting-started/ai-clients.md)**

Once connected, your AI assistant can search across all your data sources using natural language queries.

## 📄 License

This project is licensed under the terms specified in the LICENSE file.

## 🔗 Links

- **Documentation**: [docs.tryprotege.com](https://docs.tryprotege.com)
- **GitHub**: [github.com/tryprotege/almanac](https://github.com/tryprotege/almanac)
- **LightRAG Paper**: [arxiv.org/abs/2410.05779](https://arxiv.org/abs/2410.05779)

---

**Built for developers, by developers. Open source and production-ready.**
