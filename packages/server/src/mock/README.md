# Mock Data Feature

This directory contains mock data for the eBee Dashboard APIs. Mock data allows you to see and test the UI without needing to set up a complete database infrastructure.

## Usage

### Enable Mock Data

Add the following to your `.env` file or `.env.example`:

```env
ENABLE_MOCK_DATA=true
```

Or set it as an environment variable:

```bash
export ENABLE_MOCK_DATA=true
```

### Disable Mock Data

To use real data from your databases:

```env
ENABLE_MOCK_DATA=false
```

Or simply remove/comment out the variable (defaults to `false`).

## Mock Data Files

### `stats.mock.ts`

Contains mock statistics data for:

- **Overview Stats**: Total records, vectors, graph nodes, relationships, MCP servers
- **Record Stats**: Breakdown by source and type
- **Vector Stats**: Qdrant collection information
- **Graph Stats**: Memgraph nodes and relationships

### `schema.mock.ts`

Contains mock schema data including:

- **Entity Types**: Person, Project, Task, Document, Meeting, Feature, Bug, Repository
- **Relationship Types**: ASSIGNED_TO, MENTIONS, PART_OF, DEPENDS_ON, BLOCKS, RELATED_TO, AUTHORED_BY, ATTENDED_BY
- **Extraction Rules**: Configuration for entity/relationship extraction
- **Persona**: Sample user context

### `mcp-servers.mock.ts`

Contains mock MCP server configurations:

- **Notion** server (connected)
- **Slack** server (connected)
- **GitHub** server (disconnected)

### `config.mock.ts`

Contains mock configuration data:

- **Persona**: Sample user persona text
- **Model Config**: LLM and reranker settings with masked API keys

## API Endpoints Using Mock Data

When `ENABLE_MOCK_DATA=true`, the following endpoints return mock data:

### Stats API

- `GET /api/stats/overview`
- `GET /api/stats/records`
- `GET /api/stats/vectors`
- `GET /api/stats/graph`

### Schema API

- `GET /api/schema`

### Persona API

- `GET /api/schema/persona`

### Model Config API

- `GET /api/config/models`

### MCP Servers API

- `GET /api/mcp-servers`
- `GET /api/mcp-servers/:name/status`

## Modifying Mock Data

To customize the mock data for your use case:

1. Edit the relevant mock file (e.g., `stats.mock.ts`)
2. Modify the exported constants
3. Restart the server

Example:

```typescript
// stats.mock.ts
export const mockOverviewStats = {
  totalRecords: 2000, // Change this value
  totalVectors: 1900,
  // ... rest of the data
};
```

## Testing

Mock data is perfect for:

- ✅ **Frontend Development**: Test UI components without backend setup
- ✅ **UI/UX Review**: Show stakeholders the interface with realistic data
- ✅ **E2E Testing**: Run tests without database dependencies
- ✅ **Demos**: Present the application with sample data
- ✅ **Development Speed**: Faster iteration without waiting for indexing

## Architecture

```
API Endpoint
    ↓
Check: env.ENABLE_MOCK_DATA?
    ↓ YES              ↓ NO
Return Mock Data    Query Real Database
    ↓                   ↓
Response to Client  Response to Client
```

Each API endpoint checks the `ENABLE_MOCK_DATA` flag and returns mock data immediately if enabled, bypassing all database queries.

## Important Notes

⚠️ **Read-Only**: Write operations (POST, PUT, DELETE) are not mocked. They will fail or have no effect when mock mode is enabled.

⚠️ **No Persistence**: Changes made in mock mode don't persist. Refreshing will reset to default mock data.

⚠️ **Development Only**: Mock data should only be used in development environments, never in production.

## Real Data vs Mock Data

| Feature           | Real Data                | Mock Data          |
| ----------------- | ------------------------ | ------------------ |
| Database Required | ✅ Yes                   | ❌ No              |
| Data Persistence  | ✅ Yes                   | ❌ No              |
| Write Operations  | ✅ Yes                   | ❌ No (ignored)    |
| Setup Time        | 🐌 Slow (minutes)        | ⚡ Fast (instant)  |
| Customizable      | ✅ Dynamic               | ✅ Static          |
| Best For          | Production, Real Testing | Development, Demos |

## Switching Between Modes

You can easily switch between real and mock data:

```bash
# Use mock data
export ENABLE_MOCK_DATA=true
npm run dev

# Use real data
export ENABLE_MOCK_DATA=false
npm run dev
```

No code changes required!

## Future Enhancements

Potential improvements to the mock data system:

- [ ] Mock data generator CLI tool
- [ ] Multiple mock data profiles (small, medium, large datasets)
- [ ] Mock data from JSON files for easy editing
- [ ] Random data generation for stress testing
- [ ] Mock write operations (in-memory storage)
