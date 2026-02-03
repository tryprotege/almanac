# Clone MCP Server

Mock MCP server providing GitHub, Fathom, Notion, and Slack tools for testing and development.

## Features

- **Multiple Service Support**: GitHub, Fathom, Notion, and Slack MCP servers
- **Dual Transport Modes**: STDIO and HTTP/SSE (Streamable) transports
- **Mock Data Integration**: Uses mock data for consistent testing
- **Individual Service Routing**: Each service accessible via dedicated endpoint

## Installation

```bash
npm install @almanac/clone-mcp-server
```

## Usage

### STDIO Mode (Single Service)

```bash
# Set SOURCE_TYPE to one of: github, notion, fathom, slack
SOURCE_TYPE=github npm run start-stdio
```

### HTTP/SSE Mode (All Services)

```bash
npm run start-streamable
```

Server starts on `http://0.0.0.0:4000` with endpoints:

- `/mcp/github` - GitHub tools
- `/mcp/notion` - Notion tools
- `/mcp/fathom` - Fathom tools
- `/mcp/slack` - Slack tools
- `/health` - Health check

## Environment Variables

- `STDIO`: Set to `true` for STDIO mode (default: streamable HTTP)
- `SOURCE_TYPE`: Service type for STDIO mode (`github`, `notion`, `fathom`, `slack`)
- `PORT`: Server port (default: 4000)
- `HOST`: Server host (default: 0.0.0.0)

## Development

```bash
npm run dev          # Watch mode
npm run build        # Build TypeScript
npm run type-check   # Type checking
```

## License

See project root LICENSE file.
