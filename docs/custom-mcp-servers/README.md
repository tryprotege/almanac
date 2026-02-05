# Custom MCP Servers

Model Context Protocol (MCP) servers are how Almanac connects to external data sources. Whether you're using built-in integrations (Slack, GitHub, Notion) or building your own, this section explains how to create and configure data sources.

## What is an MCP Server?

An MCP server is a standardized interface that exposes data from any API or service. Think of it as a translator that speaks your API's language and converts it to a format Almanac understands.

```
Your API → MCP Server → Almanac
```

**Examples:**

- **Slack MCP Server**: Exposes Slack's API (channels, messages, users)
- **GitHub MCP Server**: Exposes GitHub's API (repos, issues, PRs)
- **Custom MCP Server**: Your proprietary system, database, or API

## Why MCP?

**Standardization**: Write once, works everywhere

- Same protocol for all data sources
- No custom integration code per source
- Works with any MCP-compatible tool (Claude Desktop, Cline, Zed, etc.)

**Flexibility**: Any data source

- REST APIs
- GraphQL endpoints
- Databases
- File systems
- Custom protocols

**Security**: Built-in OAuth support

- Standard OAuth 2.0 flows
- Secure credential storage
- Token refresh handling

## Two Ways to Configure

Almanac offers two methods to create indexing configurations:

### 1. Assisted UI Method (Recommended)

Let Almanac automatically analyze your MCP server and generate the configuration:

- ✅ **Zero Code**: Point and click interface
- ✅ **Automatic**: Discovers tools, classifies them, generates config
- ✅ **Validated**: Tests config before saving
- ✅ **Iterative**: Auto-fixes common errors

**Best for**: Most use cases, especially when starting

[Learn More →](auto-config.md)

### 2. Manual JSON Method

Write the configuration file yourself:

- ✅ **Full Control**: Specify exact behavior
- ✅ **Advanced Features**: Custom transformations, grouping, relationships
- ✅ **Version Control**: Track changes in Git
- ✅ **Reusable**: Share configs across teams

**Best for**: Complex requirements, advanced users

[Learn More →](config-structure.md)

## Quick Example: Connecting a Data Source

### Using the UI (Assisted Method)

```
1. Go to Data Sources page
2. Click "Add Source"
3. Select your MCP server (or add custom)
4. Click "Generate Config"
5. Review and approve
6. Start syncing!
```

Total time: **~2 minutes**

### Using JSON (Manual Method)

```json
{
  "version": "1.0",
  "source": "my-api",
  "displayName": "My Custom API",
  "fetchers": {
    "list_items": {
      "tool": "list_items",
      "outputs": "items",
      "recordType": "item"
    }
  },
  "recordTypes": {
    "item": {
      "fields": {
        "title": "$.name",
        "content": "$.description",
        "sourceId": "$.id",
        "primaryDate": "$.created_at"
      }
    }
  }
}
```

Total time: **~10-30 minutes** (depending on complexity)

## Built-In MCP Servers

Almanac includes several pre-built MCP servers:

### Slack

**What it indexes:**

- Channels
- Messages
- Threads
- Users

**OAuth**: ✅ Supported  
**Config**: Auto-generated

### GitHub

**What it indexes:**

- Repositories
- Issues
- Pull Requests
- Commits
- Discussions

**OAuth**: ✅ Supported  
**Config**: Auto-generated

### Notion

**What it indexes:**

- Databases
- Pages
- Blocks

**OAuth**: ✅ Supported  
**Config**: Auto-generated

### Fathom

**What it indexes:**

- Website analytics
- Page views
- Events

**OAuth**: ✅ Supported  
**Config**: Auto-generated

## Creating Your Own MCP Server

Building a custom MCP server is straightforward:

### Option 1: Use MCP SDK

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server({
  name: "my-api",
  version: "1.0.0",
});

// Define a tool
server.tool(
  "list_items",
  "Get all items",
  {
    limit: { type: "number", description: "Max items to return" },
  },
  async (args) => {
    const items = await fetchFromYourAPI(args.limit);
    return { items };
  }
);
```

### Option 2: Use HTTP Transport

Expose tools via HTTP endpoints:

```typescript
app.post("/mcp/tools/list_items", async (req, res) => {
  const { limit } = req.body;
  const items = await fetchFromYourAPI(limit);
  res.json({ items });
});
```

[Full Guide →](creating-servers.md)

## Configuration Workflow

Here's the complete flow from MCP server to searchable data:

```
1. MCP Server Created/Connected
         ↓
2. Almanac Discovers Tools
   - list_channels
   - get_messages
   - search_users
         ↓
3. Almanac Classifies Tools
   - Read: list_channels, get_messages
   - Write: send_message
   - Search: search_users
         ↓
4. Almanac Generates Config
   - Creates fetchers
   - Maps fields
   - Defines record types
         ↓
5. Almanac Tests Config
   - Dry run with sample data
   - Auto-fixes errors
   - Validates output
         ↓
6. Config Saved
         ↓
7. Data Synced
   - Fetches records
   - Transforms data
   - Stores in MongoDB
         ↓
8. Data Indexed
   - Vector embeddings (Qdrant)
   - Knowledge graph (Memgraph)
         ↓
9. Ready to Query! 🎉
```

## Common Use Cases

### Internal APIs

**Scenario**: Index your company's internal tools

```typescript
// Customer support tickets
server.tool("list_tickets", ...);
server.tool("get_ticket_details", ...);

// Product analytics
server.tool("list_features", ...);
server.tool("get_usage_stats", ...);
```

### Databases

**Scenario**: Index PostgreSQL tables

```typescript
server.tool("query_users", ...);
server.tool("query_orders", ...);
server.tool("query_products", ...);
```

### File Systems

**Scenario**: Index local documentation

```typescript
server.tool("list_markdown_files", ...);
server.tool("read_file", ...);
```

### Third-Party APIs

**Scenario**: Index external services

```typescript
// Zendesk
server.tool("list_zendesk_tickets", ...);

// Jira
server.tool("list_jira_issues", ...);

// Salesforce
server.tool("list_opportunities", ...);
```

## Best Practices

### Tool Design

✅ **DO**: Make tools focused and specific

```typescript
// Good
server.tool("list_open_issues", ...);
server.tool("list_closed_issues", ...);

// Bad
server.tool("list_all_issues_with_filters", ...);
```

✅ **DO**: Use pagination for large datasets

```typescript
server.tool("list_items", {
  limit: { type: "number" },
  offset: { type: "number" },
}, ...);
```

✅ **DO**: Return structured data

```typescript
// Good
return {
  items: [
    { id: 1, title: "Item 1", description: "..." },
    { id: 2, title: "Item 2", description: "..." },
  ],
};

// Bad
return "Item 1: description\nItem 2: description";
```

### Security

✅ **DO**: Use OAuth for authentication  
✅ **DO**: Validate all inputs  
✅ **DO**: Rate limit your endpoints  
✅ **DO**: Encrypt sensitive data

❌ **DON'T**: Store plaintext credentials  
❌ **DON'T**: Expose internal endpoints publicly  
❌ **DON'T**: Return sensitive data in tool responses

## Testing Your MCP Server

Before connecting to Almanac, test your MCP server:

### 1. Manual Testing

```bash
# Call a tool directly
curl http://localhost:3000/mcp/tools/list_items \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

### 2. MCP Inspector

Use the official MCP inspector tool:

```bash
npx @modelcontextprotocol/inspector my-server
```

### 3. Integration Testing

Connect to Almanac in development mode:

```bash
# Almanac will show detailed logs
LOG_LEVEL=debug pnpm start
```

## Troubleshooting

### Common Issues

**Issue**: Tools not appearing in Almanac

```
Solution: Check your server is exposing the tools correctly
- Verify tool definitions
- Check server is running
- Review logs for errors
```

**Issue**: Config generation fails

```
Solution: Ensure tools return sample data
- Add test data to your API
- Verify tool schemas match actual output
- Check for missing required fields
```

**Issue**: OAuth connection fails

```
Solution: Verify OAuth configuration
- Check redirect URI matches
- Ensure client ID/secret are correct
- Verify scopes are requested
```

## Next Steps

- **[Auto-Configuration Guide](auto-config.md)** - Let Almanac generate configs
- **[Config Structure](config-structure.md)** - Understand the JSON format
- **[Creating Servers](creating-servers.md)** - Build your own MCP server
- **[Testing & Validation](testing.md)** - Ensure your config works

## Resources

- **[MCP Specification](https://spec.modelcontextprotocol.io/)** - Official protocol docs
- **[MCP SDK](https://github.com/modelcontextprotocol/sdk)** - TypeScript/Python SDKs
- **[Example Servers](https://github.com/tryprotege/almanac/tree/main/packages)** - Reference implementations
