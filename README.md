# Almanac

A lightning-fast data access platform for AI Agents that levarages graph-enhanced retrieval (LightRAG) to make any data source instantly accessible.

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

## 🛠️ Development Commands

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
pnpm run docker:down        # Stop all services
docker compose -f docker-compose.prod.yml up -d  # Full Docker setup
```

## 🔧 Requirements

- **Node.js** >= 24.0.0
- **pnpm** >= 8.0.0
- **Docker Desktop** (or Docker Engine + Docker Compose v2.0+)
- **8GB RAM** recommended (2GB minimum)

## 🤝 Contributing

We welcome contributions! See our [documentation](docs) for guides on:

- Building custom MCP servers
- Contributing to core functionality
- Running benchmarks
- Writing documentation

## 📄 License

This project is licensed under the terms specified in the LICENSE file.

## 🔗 Links

- **Documentation**: [docs.tryprotege.com](https://docs.tryprotege.com)
- **GitHub**: [github.com/tryprotege/almanac](https://github.com/tryprotege/almanac)
- **LightRAG Paper**: [arxiv.org/abs/2410.05779](https://arxiv.org/abs/2410.05779)

---

**Built for developers, by developers. Open source and production-ready.**
