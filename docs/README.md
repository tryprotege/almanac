---
icon: hand-wave
layout:
  width: default
  title:
    visible: true
  description:
    visible: false
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
  metadata:
    visible: true
---

# Welcome to Almanac

Almanac is a lightning-fast data access platform designed specifically for AI agents. It combines graph-enhanced retrieval (LightRAG) with zero-config indexing to make any data source instantly accessible to your AI applications.

## What Makes Almanac Different?

- **🚀 Lightning Fast** - Entity-based retrieval reduces tokens by 10x while improving accuracy
- **🔌 Zero Config** - Automatically generates indexing configurations for any MCP server
- **🧠 Smart Retrieval** - 5 query modes adapt to different use cases (naive, local, global, hybrid, mix)
- **📊 Graph-Enhanced** - Understands relationships between entities, not just keywords
- **⚡ Production Ready** - Parallel processing, multi-database architecture, built to scale

## How It Works

Think of Almanac like a librarian who doesn't just know where books are, but understands how they relate to each other. When you ask a question:

1. **Syncing** - Almanac fetches data from your sources (Slack, GitHub, Notion, etc.)
2. **Indexing** - Creates both vector embeddings and knowledge graphs
3. **Query** - Chooses the best retrieval strategy based on your needs
4. **Results** - Returns relevant information with relationships and context

## Quick Example

```bash
# Install and start (one command)
pnpm start

# Query your data
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What did we discuss about the API refactor?",
    "mode": "mix"
  }'
```

## Get Started in 5 Minutes

Ready to dive in? Follow our [Quick Start Guide](getting-started/quickstart.md) to:

- Install Almanac with Docker
- Connect your first data source
- Run your first query
- Understand the different query modes

## Key Concepts

New to RAG or knowledge graphs? Start here:

- **[LightRAG Explained](core-concepts/lightrag.md)** - Understanding the 5 query modes
- **[Architecture](core-concepts/architecture.md)** - How Almanac works under the hood
- **[Data Flow](core-concepts/data-flow.md)** - From API to search results

## Common Use Cases

See Almanac in action:

- 💬 [Customer Support Agent](examples/customer-support.md) - Search Slack conversations
- 📝 [Code Documentation](examples/code-docs.md) - Index GitHub repositories
- 🧠 [Personal Knowledge Base](examples/knowledge-base.md) - Connect Notion, emails, docs

## Why Developers Choose Almanac

> "We tried building RAG from scratch. Almanac gave us better results in an afternoon than we achieved in 3 weeks."
>
> — Dev team building AI code assistant

**For Developers Building AI Agents:**

- No AI/ML expertise required
- Works with any LLM (OpenAI, Anthropic, local models)
- REST API - integrate with any stack
- Full TypeScript codebase

**For Data-Heavy Applications:**

- Handles millions of documents
- 32 concurrent operations by default
- Smart caching and batching
- Vector + Graph + Document storage

## Architecture at a Glance

```
External APIs → MCP Servers → Almanac
                                ↓
                    [Syncing & Transformation]
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

## Next Steps

- **New to Almanac?** → [Quick Start](getting-started/quickstart.md)
- **Want to see it in action?** → [Examples & Tutorials](examples/README.md)
- **Building custom integrations?** → [Custom MCP Servers](custom-mcp-servers/README.md)
- **Ready to deploy?** → [Installation Guide](getting-started/installation.md)

---

## Community & Support

- **GitHub**: [github.com/tryprotege/almanac](https://github.com/tryprotege/almanac)
- **Issues**: Report bugs and request features
- **Discussions**: Ask questions and share ideas

LLM? Read [llms.txt](http://docs.tryprotege.com/llms.txt).

---

_Built for developers, by developers. Open source and production-ready._
