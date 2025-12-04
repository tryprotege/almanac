# Fathom MCP Server

A Model Context Protocol (MCP) server that provides integration with Fathom AI notetaker API.

## Features

- 🎯 Complete Fathom API integration
- 📝 Meeting management
- 📄 Transcript access
- 📌 Notes and highlights
- ✅ Action items tracking
- 🔄 Pagination support
- 🛡️ Type-safe TypeScript implementation

## Installation

### From npm (once published)

```bash
npx fathom-mcp-server
```

### Local Development

```bash
# Clone and install
git clone <repo-url>
cd fathom-mcp-server
npm install

# Build
npm run build

# Run
FATHOM_API_KEY=your_key npm start
```

## Configuration

### Environment Variables

- `FATHOM_API_KEY` (required) - Your Fathom API key

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "fathom": {
      "command": "npx",
      "args": ["-y", "fathom-mcp-server"],
      "env": {
        "FATHOM_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Or for local development:

```json
{
  "mcpServers": {
    "fathom": {
      "command": "node",
      "args": ["/path/to/fathom-mcp-server/dist/index.js"],
      "env": {
        "FATHOM_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Available Tools

### User Tools

#### `get_me`

Get current authenticated user information.

**Parameters:** None

**Example:**

```json
{
  "name": "get_me"
}
```

### Meeting Tools

#### `list_meetings`

List all meetings with optional filtering.

**Parameters:**

- `calendar_invitees_domains` (optional): Array of domains to filter by. Exact match.
- `calendar_invitees_domains_type` (optional): Filter by whether calendar invitee list includes external email domains. Options: `all`, `only_internal`, `one_or_more_external`
- `created_after` (optional): ISO timestamp to filter meetings created after this time
- `created_before` (optional): ISO timestamp to filter meetings created before this time
- `cursor` (optional): Cursor for pagination
- `include_action_items` (optional): Include action items for each meeting
- `include_crm_matches` (optional): Include CRM matches for each meeting
- `include_summary` (optional): Include summary for each meeting (unavailable for OAuth apps)
- `include_transcript` (optional): Include transcript for each meeting (unavailable for OAuth apps)
- `limit` (optional): Number of results per page

**Example:**

```json
{
  "name": "list_meetings",
  "arguments": {
    "created_after": "2025-01-01T00:00:00Z",
    "include_action_items": true,
    "include_summary": true,
    "limit": 50
  }
}
```

#### `get_meeting`

Get details of a specific meeting.

**Parameters:**

- `meeting_id` (required): The ID of the meeting

**Example:**

```json
{
  "name": "get_meeting",
  "arguments": {
    "meeting_id": "meeting_123"
  }
}
```

### Recording Tools

#### `get_summary`

Get summary for a specific recording.

**Parameters:**

- `recording_id` (required): The ID of the recording

**Example:**

```json
{
  "name": "get_summary",
  "arguments": {
    "recording_id": "recording_123"
  }
}
```

#### `get_transcript`

Get transcript for a specific recording.

**Parameters:**

- `recording_id` (required): The ID of the recording

**Example:**

```json
{
  "name": "get_transcript",
  "arguments": {
    "recording_id": "recording_123"
  }
}
```

### Team Tools

#### `list_teams`

List all teams.

**Parameters:**

- `cursor` (optional): Cursor for pagination

**Example:**

```json
{
  "name": "list_teams",
  "arguments": {
    "cursor": "eyJpZCI6MTIzfQ=="
  }
}
```

#### `list_team_members`

List all team members.

**Parameters:**

- `cursor` (optional): Cursor for pagination
- `team` (optional): Team name to filter by

**Example:**

```json
{
  "name": "list_team_members",
  "arguments": {
    "team": "Engineering",
    "cursor": "eyJpZCI6MTIzfQ=="
  }
}
```

## Development

### Project Structure

```
fathom-mcp-server/
├── src/
│   ├── index.ts           # Main MCP server
│   └── fathom-client.ts   # Fathom API client
├── dist/                  # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Running in Development

```bash
FATHOM_API_KEY=your_key npm run dev
```

### Testing

Test the server with an MCP client or using stdio:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | FATHOM_API_KEY=your_key node dist/index.js
```

## API Endpoints

This implementation uses the official Fathom API endpoints as documented at https://developers.fathom.ai/api-overview

**Base URL:** `https://api.fathom.ai/external/v1`

**Authentication:** API key via `X-Api-Key` header

**Available Endpoints:**

- `GET /me` - Get current user information
- `GET /meetings` - List meetings with filtering options
- `GET /meetings/{meeting_id}` - Get specific meeting details
- `GET /recordings/{recording_id}/summary` - Get recording summary
- `GET /recordings/{recording_id}/transcript` - Get recording transcript
- `GET /teams` - List teams
- `GET /teammembers` - List team members

## Error Handling

The server returns errors in the following format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"error\": \"Error message here\"}"
    }
  ],
  "isError": true
}
```

## Rate Limiting

Be mindful of Fathom's API rate limits. Consider implementing:

- Request queuing
- Exponential backoff
- Caching for frequently accessed data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT

## Support

For issues and questions:

- GitHub Issues: [repository-url]/issues
- Fathom API Docs: https://fathom.video/api
- MCP Protocol: https://modelcontextprotocol.io

## Changelog

### 1.0.0

- Initial release
- Support for meetings, transcripts, notes, action items, and highlights
- Full MCP protocol implementation
- TypeScript support
