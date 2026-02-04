---
icon: robot
layout:
  width: default
  title:
    visible: true
  description:
    visible: true
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
  metadata:
    visible: true
---

# Connecting AI Clients

Almanac exposes an MCP (Model Context Protocol) server that allows AI clients like Claude Desktop, Cline, and ChatGPT to directly access your indexed data. This enables your AI assistant to search and retrieve information from all your connected data sources.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that allows AI applications to securely connect to external data sources and tools. When you connect Almanac via MCP, your AI client can:

- 🔍 Search across all your indexed data sources
- 🧠 Use LightRAG's intelligent retrieval modes
- 📊 Access both vector and graph-based search
- 🔒 Maintain security through local connections

## Claude Desktop

Claude Desktop supports MCP servers through its configuration file.

### Prerequisites

- Almanac running locally (`pnpm start`)
- Claude Desktop installed
- Server accessible at `http://localhost:3000`

### Setup Instructions

1. **Locate your Claude Desktop config file:**
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add Almanac to your MCP servers:**

   Open the config file and add the following to the `mcpServers` section:

   ```json
   {
     "mcpServers": {
       "almanac": {
         "url": "http://127.0.0.1:3000/mcp",
         "type": "streamableHttp",
         "disabled": false
       }
     }
   }
   ```

3. **Restart Claude Desktop**

4. **Verify the connection:**

   In Claude Desktop, you should see Almanac listed in the MCP servers section. Try asking:

   > "Search my Almanac data for discussions about API refactoring"

### Example Configuration

Here's a complete example with multiple MCP servers:

```json
{
  "mcpServers": {
    "almanac": {
      "url": "http://127.0.0.1:3000/mcp",
      "type": "streamableHttp",
      "disabled": false
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
    }
  }
}
```

## Cline (VS Code Extension)

Cline is a VS Code extension that supports MCP servers for enhanced AI assistance.

### Prerequisites

- Almanac running locally (`pnpm start`)
- Cline extension installed in VS Code
- Server accessible at `http://localhost:3000`

### Setup Instructions

1. **Open Cline settings in VS Code:**
   - Open Command Palette (`Cmd/Ctrl + Shift + P`)
   - Search for "Cline: Open MCP Settings"

2. **Add Almanac to your MCP servers:**

   Add the following configuration:

   ```json
   {
     "mcpServers": {
       "almanac": {
         "url": "http://localhost:3000/mcp",
         "type": "streamableHttp",
         "disabled": false
       }
     }
   }
   ```

3. **Restart VS Code or reload the Cline extension**

4. **Verify the connection:**

   In Cline, you should see Almanac tools available. Try asking:

   > "Use Almanac to search for information about our authentication system"

## ChatGPT (Developer Mode)

ChatGPT supports MCP servers through its Developer Mode feature.

### ⚠️ Important Security Warning

**ChatGPT requires your Almanac server to be publicly accessible on the internet.** This means:

- ❌ `localhost` connections are **NOT supported**
- ⚠️ Your data will be accessible over the internet
- 🔒 You **MUST** implement proper security measures:
  - Authentication/API keys
  - HTTPS/TLS encryption
  - Firewall rules
  - Rate limiting

**We strongly advise only exposing Almanac publicly if you have the expertise to secure it properly.**

### Prerequisites

- Almanac deployed on a **publicly accessible server** with HTTPS
- ChatGPT Plus or Enterprise subscription
- Developer Mode enabled in ChatGPT

### Setup Instructions

1. **Deploy Almanac to a public server:**

   ```bash
   # Example using a cloud provider
   # Ensure HTTPS is configured
   # Set up authentication
   ```

2. **Enable Developer Mode in ChatGPT:**

   Follow OpenAI's official guide:
   [Developer Mode and MCP Apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta)

3. **Add Almanac as an MCP server:**

   In ChatGPT's Developer Mode settings, add:

   ```json
   {
     "url": "https://your-domain.com/mcp",
     "type": "streamableHttp"
   }
   ```

4. **Verify the connection:**

   In ChatGPT, try asking:

   > "Search my Almanac data for recent project updates"

### Security Checklist

Before exposing Almanac publicly:

- [ ] HTTPS/TLS configured with valid certificate
- [ ] Authentication mechanism implemented
- [ ] API rate limiting enabled
- [ ] Firewall rules configured
- [ ] Monitoring and logging enabled
- [ ] Regular security updates applied
- [ ] Backup strategy in place

## Available Tools

Once connected, your AI client will have access to these Almanac tools:

### `lightrag_query`

Search your indexed data using LightRAG's intelligent retrieval.

**Parameters:**

- `query` (string, required): Your search query
- `mode` (string, optional): Query mode - `naive`, `local`, `global`, `hybrid`, or `mix` (default: `mix`)
- `top_k` (number, optional): Number of results to return (default: 5)

**Example usage in Claude:**

> "Use lightrag_query to search for 'API authentication' in hybrid mode"

### Query Modes Explained

- **naive**: Fast keyword search
- **local**: Entity-focused search (people, projects, concepts)
- **global**: Relationship-focused search (connections, workflows)
- **hybrid**: Balanced combination of local and global
- **mix**: Best results (combines all modes with reranking)

## Troubleshooting

### Connection Refused

**Problem:** AI client can't connect to Almanac

**Solutions:**

1. Verify Almanac is running: `curl http://localhost:3000/health`
2. Check the URL in your config (use `127.0.0.1` instead of `localhost` if needed)
3. Ensure no firewall is blocking the connection
4. Restart your AI client after config changes

### No Tools Available

**Problem:** MCP server connected but no tools appear

**Solutions:**

1. Check Almanac logs for errors
2. Verify you have data sources connected and synced
3. Ensure indexing has completed
4. Restart both Almanac and your AI client

### Slow Responses

**Problem:** Queries take a long time to return results

**Solutions:**

1. Try a simpler query mode (`naive` or `local`)
2. Reduce `top_k` parameter
3. Check if indexing is still in progress
4. Review Almanac performance settings in `.env`

## Next Steps

- **[Query Modes Guide](../examples/query-modes.md)** - Learn when to use each mode
- **[API Reference](../query-search/api.md)** - Direct API usage
- **[Best Practices](../query-search/best-practices.md)** - Optimize your queries

---

**Need help?** Open an issue on [GitHub](https://github.com/tryprotege/almanac/issues)
