# Introducing almanac: Lightning-Fast Data Access for AI Agents

Your sales team just finished a discovery call with a promising prospect. The notes are in Notion. Action items need to go into Linear. Tomorrow's call needs context from last week's conversation, your internal GitHub repo showing what your engineers have built, and the Slack discussions about progress.

Normally, this takes 30 minutes of searching across multiple tools and tabs. What if you could spend just 10 minutes and focus only on the most relevant context? What if an AI agent could do the heavy lifting in seconds?

The problem isn't lack of AI tools—it's that your data is scattered across disconnected silos.

## What is almanac?

**almanac is a lightning-fast data access platform that gives AI agents instant access to your organization's knowledge—no matter where it lives.**

### What makes it different:

- **Extensible by Design**: Connects to 100+ data sources via Model Context Protocol (MCP)
- **Understands Connections**: Graph-enhanced retrieval that knows how information relates
- **5 Minutes to Running**: Truly plug-and-play setup
- **Built for Agents**: Purpose-built API for AI agent integration

### The Power of MCP

The Model Context Protocol is an emerging standard for AI data access, supported by Anthropic and driven by a growing community. Instead of building custom integrations for every data source, MCP provides a standardized way to connect:

- **Write once, work everywhere**: One MCP server works with any MCP client
- **100+ community servers** already available
- **Add custom sources** in minutes
- **Future-proof**: As the ecosystem grows, almanac gets more powerful automatically

**[Visual: Diagram showing multiple MCP servers (Slack, GitHub, Notion, Linear, Custom) → almanac → Unified Knowledge Graph → AI Agents]**

---

## How It Works: The Architecture

### The Four-Database Design

almanac uses a purpose-built architecture where each database is optimized for its specific job:

- **MongoDB**: Stores raw data from all your sources
- **Qdrant**: Vector embeddings for semantic search
- **Memgraph**: Knowledge graph that captures relationships between entities
- **Redis**: Caching layer for lightning-fast responses

**Why this matters**: Each database excels at what it does. Combined, they deliver both speed and intelligence that single-database solutions can't match.

**[Visual: Architecture diagram showing data flow through the four databases]**

### LightRAG: Graph-Enhanced Retrieval

Traditional RAG systems treat your data like a pile of documents. LightRAG builds a knowledge graph that understands entities (people, projects, concepts) and relationships (works on, discussed in, blocks).

#### The Efficiency Gain

- **Traditional RAG**: Retrieve 10-20 chunks (~12,000 tokens) to answer complex questions
- **LightRAG**: Retrieve 3-5 targeted results (~1,500 tokens)
- **Result**: **8x more efficient** = faster results, lower costs

#### The Intelligence Gain

LightRAG can answer questions that traditional RAG struggles with:

- "How does our authentication system connect to billing?" (relationship traversal)
- "What blockers does the frontend team have?" (entity + relationship queries)
- "What did we discuss about the API refactor?" (semantic + graph search)

### Five Query Modes for Every Use Case

Choose the right retrieval strategy for your needs:

| Mode       | Best For          | Speed  | Example Use Case                  |
| ---------- | ----------------- | ------ | --------------------------------- |
| **Naive**  | Simple keywords   | ⚡⚡⚡ | "Find API documentation"          |
| **Local**  | Specific entities | ⚡⚡   | "What is Alice working on?"       |
| **Global** | Relationships     | ⚡⚡   | "How do these systems connect?"   |
| **Hybrid** | Complex queries   | ⚡     | "What's blocking the team?"       |
| **Mix**    | Maximum accuracy  | ⏱️     | Production queries with reranking |

**[Visual: Query mode comparison table with visual indicators]**

**Key insight**: You're not locked into one approach. Need speed? Use naive mode. Need accuracy? Use mix mode. The flexibility is built in.

---

## Real Use Case: Sales Intelligence

### The Scenario

Your customer success team is preparing for tomorrow's call with Acme Corp. Normally, this would take 30 minutes of searching across tools to gather:

- What open issues does the customer have?
- What did we discuss in our last call?
- What's the current status of features they requested?
- How does our progress align with their needs?

### The Setup

**MCP Servers Connected**:

- **Notion**: Previous call notes and customer documentation
- **Linear**: Customer's open issues and feature requests
- **GitHub**: Internal repository showing engineering progress
- **Slack**: Team discussions about the customer and PRs

almanac indexes all of this into a unified knowledge graph, making it instantly queryable.

### The Query

```json
{
  "query": "What's the status of Acme Corp's SSO request, what progress have we made, and how does it align with what they need?",
  "mode": "hybrid"
}
```

### What Happens (in 234ms)

1. **Entity Recognition**: Identifies "Acme Corp" as a customer entity and "SSO" as a feature
2. **Local Search**: Finds all Linear tickets and GitHub PRs related to Acme Corp and SSO
3. **Global Search**: Traverses relationships:
   - Linear tickets → discussed_in → Call notes
   - GitHub PRs → implements → Feature requests
   - Slack messages → discusses → PR progress
   - Call notes → requested → Customer requirements
4. **Semantic Ranking**: Prioritizes by relevance and recency
5. **Results**: Returns ranked list showing engineering progress vs. customer needs

### The Response

```json
{
  "results": [
    {
      "source": "github",
      "type": "pull_request",
      "title": "feat: Add SAML SSO support (#847)",
      "score": 0.95,
      "connection": "Internal PR implementing Acme Corp's SSO requirement",
      "rawData": {
        "status": "review",
        "author": "bob",
        "reviewers": ["alice", "charlie"],
        "progress": "80% complete - final testing phase",
        "commits": 23,
        "files_changed": 12,
        "created": "2024-01-18",
        "updated": "2024-01-22"
      }
    },
    {
      "source": "slack",
      "type": "message",
      "text": "SSO PR is looking good - just need to add the Azure AD integration tests and we're ready to merge",
      "score": 0.92,
      "connection": "Team discussion about PR #847 progress",
      "rawData": {
        "channel": "engineering",
        "user": "alice",
        "timestamp": "2024-01-22T10:15:00Z",
        "thread_replies": 5
      }
    },
    {
      "source": "linear",
      "type": "issue",
      "title": "SSO integration for enterprise customers",
      "score": 0.91,
      "connection": "Original customer requirement from Acme Corp",
      "rawData": {
        "status": "in_progress",
        "assignee": "bob",
        "priority": "high",
        "labels": ["acme-corp", "enterprise", "q1-deadline"],
        "linked_pr": "#847"
      }
    },
    {
      "source": "notion",
      "type": "note",
      "title": "Acme Corp Discovery Call - Jan 15",
      "score": 0.89,
      "connection": "Original discussion where SSO was identified as blocker",
      "rawData": {
        "date": "2024-01-15",
        "attendees": ["alice", "customer_cto", "customer_vp_eng"],
        "key_points": [
          "SSO required for enterprise rollout",
          "Need SAML + Azure AD support",
          "Timeline: Must have by end of Q1"
        ]
      }
    },
    {
      "source": "slack",
      "type": "message",
      "text": "Customer asked about SSO timeline again - can we give them an update?",
      "score": 0.84,
      "connection": "Recent customer inquiry about feature status",
      "rawData": {
        "channel": "customer-success",
        "user": "sales_rep",
        "timestamp": "2024-01-21T14:30:00Z"
      }
    }
  ],
  "processingTime": 234,
  "mode": "hybrid"
}
```

### The Impact

**Time Savings**:

- **Traditional approach**: 30 minutes searching across 4 tools
- **With almanac**: 10 minutes total, focused only on what matters
- **Result**: Spend 1/3 of the time, be 3x more prepared

**What You Get**:

- ✅ **Complete context** from GitHub PRs, Linear tickets, Slack discussions, and call notes
- ✅ **Engineering progress** aligned with customer requirements
- ✅ **Instant answers** to "What's the status?" questions
- ✅ **Confidence** walking into customer calls

Your AI agent can now automatically:

- Track feature progress across GitHub PRs and Linear tickets
- Connect engineering work to customer requirements
- Prepare comprehensive call briefs with full context
- Alert the team when customer questions go unanswered
- Show exactly how your work aligns with what customers need

---

## Getting Started in 5 Minutes

### Step 1: Install (30 seconds)

```bash
git clone https://github.com/tryprotege/almanac.git
cd almanac
pnpm install && pnpm start
```

That's it. almanac handles the rest:

- ✅ Spins up all 4 databases in Docker
- ✅ Starts the backend server
- ✅ Launches the web UI

### Step 2: Configure (2 minutes)

Open http://localhost:5173 and you'll see the setup wizard:

1. Add your LLM API key (OpenAI, Anthropic, or custom endpoint)
2. Select your models (chat, embedding, indexing)
3. Click "Save Configuration"

**[Screenshot: Setup wizard UI showing LLM configuration form]**

### Step 3: Connect Data Sources (2 minutes)

Click "Add Data Source" and choose from:

- **Pre-built integrations**: Slack, GitHub, Notion, Linear, Fathom Analytics
- **Community servers**: 100+ MCP servers from the ecosystem
- **Custom sources**: Build your own MCP server in minutes

For OAuth sources (Slack, GitHub, etc.):

1. Click "Connect with OAuth"
2. Authorize in 2 clicks
3. almanac auto-generates the indexing configuration

**[Screenshot: Data source connection flow showing OAuth authorization]**

### Step 4: Query (30 seconds)

Use the REST API:

```bash
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What blockers does the team have?",
    "mode": "hybrid"
  }'
```

Or use the web UI:

**[Screenshot: Query interface showing search bar and results]**

**That's it. 5 minutes from clone to querying your data.**

---

## The MCP Ecosystem Advantage

### Why MCP Matters for Extensibility

**The Old Way**:

- Build custom integration for each data source
- Maintain auth flows, rate limiting, API versioning
- Months of engineering work per integration
- Vendor lock-in and brittle connections

**The MCP Way**:

- Standard protocol for all data sources
- Community-driven ecosystem
- Write one server, works everywhere
- Add new sources in minutes, not months

### Already Available

The MCP ecosystem is growing rapidly:

- 100+ high quality community MCP servers
- Official servers from Anthropic
- Active development community
- New servers added weekly

### Connect from Claude Desktop

Once almanac is running, you can query it directly from Claude Desktop via MCP. Add this to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "almanac": {
      "command": "node",
      "args": ["/path/to/almanac/packages/server/dist/mcp/index.js"],
      "env": {
        "ALMANAC_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

**That's it.** Restart Claude Desktop and you can now query your organization's knowledge directly in conversation:

> "What's the status of Acme Corp's SSO request?"

Claude will use the almanac MCP server to search across all your connected data sources and return comprehensive, context-rich answers—all without leaving the chat interface.

**[Visual: Screenshot showing Claude Desktop querying almanac via MCP]**

**This is what makes almanac future-proof**: As the MCP ecosystem grows, almanac gets more powerful automatically. Every new MCP server is a new data source you can connect without writing a single line of integration code.

---

## What's Next

### Get Started Today

- 📚 **[Full Documentation](http://docs.tryprotege.com/)** - Complete guides and API reference
- ⭐ **[Star on GitHub](https://github.com/tryprotege/almanac)** - Follow development and contribute
- 💬 **Join our Community** - Connect with other developers and share your use cases
- 🎯 **See More Examples** - Real-world implementations and tutorials

### Coming Soon

- **Enterprise features**: SSO, RBAC, audit logs, and compliance tools
- **Expanded MCP server library**: More pre-built integrations and templates

### Built by Protege

We're building the infrastructure layer for AI agents. almanac is the first piece—making your organization's knowledge instantly accessible to AI, no matter where it lives.

The future of work is AI agents that understand your entire organization's context. almanac makes that future possible today.

---

## Visual Assets Checklist

For the final blog post, include these visuals:

1. **Hero Architecture Diagram**: MCP servers → almanac → Knowledge Graph → AI Agents
2. **Query Mode Comparison**: Visual table showing the 5 modes with speed/accuracy indicators
3. **Screenshot 1**: Setup wizard UI showing LLM configuration
4. **Screenshot 2**: Data source connection showing OAuth flow
5. **Screenshot 3**: Query interface with results display
6. **Use Case Flow Diagram**: Sales intelligence example showing how data flows from multiple sources through the graph to insights
7. **MCP Ecosystem Diagram**: Community servers connecting to almanac

---

_Ready to give your AI agents access to your organization's knowledge? Get started with almanac in 5 minutes: [https://github.com/tryprotege/almanac](https://github.com/tryprotege/almanac)_
