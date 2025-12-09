# eBee-OSS

<p align="center">
  <strong>[@TODO: One liner value prop]</strong>
  GraphRAG infrastructure for AI agents with native MCP integration
</p>

<p align="center">
  <a href="[DEMO_LINK]">🎯 Live Demo</a> •
  <a href="[DOCS_LINK]">📚 Documentation</a> •
  <a href="[EXAMPLES_LINK]">💡 Examples</a> •
</p>

## See It In Action

@TODO
// Animated GIF showing or Video

- Dashboard with MCP servers
- Graph visualization of relationship
- Search results showing on using the ebee

# Why Ebee?

// @TODO Tell about problem and solution

## Quick Start

### Prerequisites

- Node.js >= 24.0.0
- pnpm >= 8.0.0
- Docker & Docker Compose

### Installation

1. **Clone and install:**

   ```bash
   git clone https://github.com/[org]/ebee-oss.git
   cd ebee-oss
   pnpm install
   ```

2. **Start infrastructure:**

   ```bash
   pnpm docker:infra
   ```

3. **Configure environment:**

   ```bash
   cp packages/server/.env.example packages/server/.env
   # Add your API keys (OpenAI, Anthropic, etc.)
   ```

4. **Start eBee:**

   ```bash
   pnpm dev
   ```

5. **Open dashboard:**
   Navigate to http://localhost:5173

**Next Steps:**

- [Connect your first MCP server](./docs/examples/Connecting-mcp-servers.md)
- [Run example queries](./docs/examples/First-queries.md)
- [Explore the architecture](./docs/ARCHITECTURE.md)

### MCP Server Integration

Connect to any MCP-compatible data source with zero configuration.

**Supported Sources:**

- [Notion](./docs/examples/mcp-servers/notion.md) - Pages, databases, comments
- [Slack](./docs/examples/mcp-servers/slack.md) - Messages, threads, channels
- [GitHub](./docs/examples/mcp-servers/github.md) - Issues, PRs, discussions
- [Fathom](./docs/examples/mcp-servers/fathom.md) - Meeting transcripts
- [Custom MCP Servers](./docs/guides/custom-mcp-servers.md)

### GraphRAG Architecture

@TODO Small pointers and about graphrag and add link to learn more about graphRAG

### Production Infrastructure

@TODO small pointers about the services we use and link to deep dive
[Architecture deep-dive →](./docs/ARCHITECTURE.md)

### Developer Experience

- **TypeScript-first**: Full type safety across the stack
- **REST API**: Simple HTTP endpoints for all operations
- **Web Dashboard**: Visual interface for configuration and monitoring
- **Docker Compose**: One-command local development

## Use Cases

@TODO tell users how it will help them
like Fina all slack disucssion related to github issues for xyz project

### Documentation

@TODO more proper link

- [Getting Started Guide](./docs/Getting-started.md) - Installation and setup
- [Architecture Overview](./docs/ARCHITECTURE.md) - System design and components
- [MCP Server Guide](./docs/examples/Connecting-mcp-servers.md) - Connect data sources
- [API Reference](./docs/api/README.md) - REST API documentation
- [Developer Guide](./docs/Developer-guide.md) - Contributing and development

### Examples

### Concepts

- What is GraphRag?
- What is MCP?
- Hybrid search explanation

### Tools & Integration

- which tool can integrate with ebee

## Community & Support

### Get Help

- Issues or Github discussion or Slack/Discord channel

### Contributing

@TODO how user can contribute, rules and process

### Stay Updated

- Roadmap - Upcoming features
- Changelog - Latest releases

## License

//@TODO

## Acknowledgements/Contributors list

## Docs structure

@ TODO (This whole section be removed once we create doc structure)

```
docs/examples/
├── first-queries.md                    # @TODO: Simple search examples
├── advanced-queries.md                 # @TODO: Complex query patterns
└── mcp-servers/
    ├── notion.md                       # @TODO: Notion setup guide
    ├── slack.md                        # @TODO: Slack setup guide
    ├── github.md                       # @TODO: GitHub setup guide
    └── fathom.md                       # @TODO: Fathom setup guide

Concepts section

docs/concepts/
├── graphrag.md                         # @TODO: Explain GraphRAG vs traditional RAG
├── mcp.md                             # @TODO: What is Model Context Protocol
├── hybrid-search.md                   # @TODO: How hybrid search works
└── architecture.md                    # @TODO: System architecture overview
```

API section

docs/api-reference/
├── README.md # @TODO: API overview
├── search.md # @TODO: Search API endpoints
├── mcp-servers.md # @TODO: MCP server management API
├── sync.md # @TODO: Data sync API
└── graph.md # @TODO: Graph query API

```

Integration section

docs/integrations/
├── claude-desktop.md                  # @TODO: Claude Desktop integration
└── api-clients.md                     # @TODO: Client library examples

Guides Section

docs/guides/
├── custom-mcp-servers.md              # @TODO: Building custom MCP servers
├── deployment.md                      # @TODO: Production deployment guide
└── troubleshooting.md                 # @TODO: Common issues and solutions
```
