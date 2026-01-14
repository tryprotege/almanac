# Data Sources API Implementation

## Overview

Implemented the missing `/data-sources` REST API endpoints that the client UI was calling but didn't exist on the server, which was causing 400 errors when trying to manage MCP servers through the UI.

## Problem

The client code in `packages/client/src/lib/api.ts` defined a complete set of data source management API calls:

- `POST /api/data-sources` - Create
- `PUT /api/data-sources/:name` - Update
- `DELETE /api/data-sources/:name` - Delete
- `POST /api/data-sources/:name/connect` - Connect
- `POST /api/data-sources/:name/disconnect` - Disconnect
- `GET /api/data-sources/:name/status` - Status
- `GET /api/data-sources` - List

However, these endpoints were **not implemented** on the server. The router was missing from `packages/server/src/api/index.ts`, resulting in 400 Bad Request errors when the UI tried to manage data sources.

## Solution

### 1. Created Data Sources Router

**File:** `packages/server/src/api/data-sources/index.ts`

Implemented all required endpoints:

- **GET /api/data-sources**

  - Lists all data sources with connection status
  - Includes MCP client connection state

- **GET /api/data-sources/:name**

  - Get specific data source details
  - Includes connection status

- **POST /api/data-sources**

  - Create new data source
  - Validates required fields based on transport type
  - Prevents duplicate server names
  - Properly converts env/headers to Map format

- **PUT /api/data-sources/:name**

  - Update existing data source
  - Auto-reconnects if server is currently connected
  - Updates MongoDB and refreshes MCP client

- **DELETE /api/data-sources/:name**

  - Disconnect and remove data source
  - Cleans up MCP client connections

- **POST /api/data-sources/:name/connect**

  - Establish MCP client connection
  - Validates configuration before connecting
  - Returns appropriate errors for OAuth/invalid configs

- **POST /api/data-sources/:name/disconnect**

  - Disconnect MCP client gracefully
  - Keeps MongoDB record intact

- **GET /api/data-sources/:name/status**
  - Check connection status
  - Returns tool count and disabled state

### 2. Registered Router

**File:** `packages/server/src/api/index.ts`

Added the router registration:

```typescript
import dataSourcesRouter from "./data-sources/index.js";
router.use("/data-sources", dataSourcesRouter);
```

## Architecture

The implementation follows the existing pattern:

```
Client UI
  ↓
/api/data-sources/* endpoints
  ↓
DataSourceModel (MongoDB)
  ↓
mcpClientManager (MCP SDK)
  ↓
Remote MCP Servers
```

### Key Features

1. **Separation of Concerns**: Data source config (MongoDB) vs connection management (MCP client)
2. **Connection State Tracking**: Real-time connection status from `mcpClientManager`
3. **Auto-Reconnect**: Updates to connected servers trigger reconnection
4. **Validation**: Config validation before connection attempts
5. **Error Handling**: Proper HTTP status codes and error messages
6. **Encryption**: Sensitive data (env vars, headers, OAuth secrets) encrypted via model hooks

## Integration Points

### MongoDB Model

- Uses existing `DataSourceModel` from `packages/server/src/models/data-source.model.ts`
- Handles encryption/decryption automatically via Mongoose hooks

### MCP Client Manager

- Uses existing `mcpClientManager` from `packages/server/src/mcp/client.ts`
- Manages active connections, tool caching, OAuth flows

### OAuth Support

- OAuth endpoints remain in `/api/oauth/*`
- Data sources API only handles server CRUD, not OAuth flows

## Benefits

1. **Fixes 400 Errors**: UI can now successfully create/manage data sources
2. **Consistent Architecture**: Follows existing API patterns
3. **Type Safety**: Full TypeScript support matching client expectations
4. **Backward Compatible**: Doesn't break existing functionality
5. **Extensible**: Easy to add more endpoints in the future

## Testing

To test the implementation:

1. **Start server**: `cd packages/server && npm run dev`
2. **Open UI**: Navigate to Data Sources page
3. **Add a data source**: Click "Add Source" button
4. **Verify connection**: Should connect without 400 errors
5. **Check logs**: Should see "Connected to MCP server: [name]"

## Future Enhancements

1. **Aggregation Endpoint**: `/data-sources/overview` to return merged view with indexing configs
2. **Bulk Operations**: Batch connect/disconnect for multiple servers
3. **Health Checks**: Periodic connection verification
4. **Metrics**: Track connection uptime, request counts, etc.
