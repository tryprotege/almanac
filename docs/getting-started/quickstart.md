# Quick Start

Get Almanac running in under 5 minutes and execute your first query.

## Prerequisites

- Node.js >= 24.0.0
- pnpm >= 8.0.0
- Docker Desktop (or Docker Engine + Docker Compose)

## Installation

Clone and start Almanac with a single command:

```bash
# Clone the repository
git clone https://github.com/tryprotege/almanac.git
cd almanac

# Install dependencies
pnpm install

# Start everything (Docker databases + local dev servers)
pnpm start
```

This command will:

- ✅ Start database services in Docker (MongoDB, Redis, Qdrant, Memgraph)
- ✅ Start the backend server locally (port 3000)
- ✅ Start the frontend UI locally (port 5173)

## Initial Configuration

1. **Open the UI**: Navigate to http://localhost:5173
2. **Complete Setup Wizard**: On first launch, you'll see a setup screen
3. **Add Your LLM API Key**:
   - Provider: OpenAI, Anthropic, or custom endpoint
   - API Key: Your LLM provider key
   - Models: Select chat, embedding, and extraction models

<figure><img src="../.gitbook/assets/setup-wizard.png" alt="Setup wizard showing LLM configuration"><figcaption>Initial setup wizard</figcaption></figure>

4. **Save and Restart**: Click "Save Configuration" and restart the server

## Connect Your First Data Source

Let's connect Slack as an example:

### Step 1: Add Data Source

1. Go to **Data Sources** page in the UI
2. Click **"Add Source"**
3. Select **Slack** from the marketplace
4. Click **"Connect with OAuth"**
5. Authorize Almanac in your Slack workspace

### Step 2: Generate Configuration

Almanac will automatically:

- Discover available Slack tools (channels, messages, users)
- Classify tools as read/write/search
- Generate an indexing configuration
- Show you a preview of the config

Click **"Save Configuration"** to proceed.

### Step 3: Sync Data

1. Go to **Sync** page
2. Click **"Start Sync"** for Slack
3. Watch as Almanac fetches your Slack data

```
📥 Syncing Slack...
   ├─ Fetched 150 channels
   ├─ Fetched 1,247 messages
   └─ ✅ Sync complete (2.3s)
```

### Step 4: Index Data

After syncing, Almanac will automatically start indexing:

```
🔄 Vector indexing...
   └─ ✅ 1,247 documents indexed (5.2s)

🔄 Graph indexing...
   ├─ Extracted 423 entities
   ├─ Found 891 relationships
   └─ ✅ Graph complete (12.4s)
```

## Your First Query

Now you can query your Slack data! Try this in your terminal:

```bash
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What did the team discuss about the API refactor?",
    "mode": "mix",
    "top_k": 5
  }'
```

Or use the UI:

1. Go to **Query** page
2. Enter your question: _"What did the team discuss about the API refactor?"_
3. Select mode: **Mix** (recommended)
4. Click **Search**

### Understanding the Response

```json
{
  "results": [
    {
      "source": "slack",
      "recordType": "message",
      "score": 0.89,
      "rawData": {
        "text": "We should split the API into microservices...",
        "user": "alice",
        "channel": "engineering",
        "timestamp": "2024-01-10T14:30:00Z"
      }
    }
  ],
  "processingTime": 234,
  "mode": "mix"
}
```

- **score**: Relevance score (0-1)
- **source**: Which data source this came from
- **recordType**: Type of record (message, document, issue, etc.)
- **rawData**: The actual data from your source

## Try Different Query Modes

Almanac offers 5 query modes for different use cases:

### Naive Mode (Fast, Simple)

Best for: Quick keyword searches

```bash
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "API refactor", "mode": "naive"}'
```

### Local Mode (Entity-Focused)

Best for: Finding information about specific people, projects, or concepts

```bash
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is Alice working on?", "mode": "local"}'
```

### Global Mode (Relationship-Focused)

Best for: Understanding connections and workflows

```bash
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "How does the authentication system connect to billing?", "mode": "global"}'
```

### Hybrid Mode (Balanced)

Best for: Complex questions requiring both entities and relationships

```bash
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What blockers does the frontend team have?", "mode": "hybrid"}'
```

### Mix Mode (Best Results)

Best for: When you want the most accurate results (combines all modes + reranking)

```bash
curl http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What did we discuss about the API refactor?", "mode": "mix"}'
```

## What's Next?

You now have Almanac running with real data! Here's what to explore next:

- **[Add More Data Sources](../custom-mcp-servers/README.md)** - Connect GitHub, Notion, or build custom integrations
- **[Understand Query Modes](../examples/query-modes.md)** - Deep dive into when to use each mode
- **[See Examples](../examples/README.md)** - Real-world use cases and tutorials
- **[Learn LightRAG](../core-concepts/lightrag.md)** - Understand how the retrieval system works

## Troubleshooting

### Services won't start

```bash
# Check if ports are in use
lsof -i :3000  # Backend
lsof -i :5173  # Frontend
lsof -i :27017 # MongoDB

# Or use different ports
PORT=3001 pnpm dev
```

### Setup wizard doesn't appear

Delete the `.env` file and restart:

```bash
rm packages/server/.env
pnpm start
```

### Sync fails with OAuth error

Check that your OAuth redirect URI matches:

```
Expected: http://localhost:3000/api/oauth/callback
```

See [Configuration Guide](configuration.md) for more details.

## Next Steps

- 📖 [Installation Guide](installation.md) - Production deployment and advanced setup
- ⚙️ [Configuration](configuration.md) - Environment variables and tuning
- 🎯 [Examples](../examples/README.md) - Real-world use cases
