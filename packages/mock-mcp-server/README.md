# Slack Mock MCP Server

An MCP (Model Context Protocol) server that provides tools and resources to query generated mock Slack workspace data. This server allows Claude Desktop, Cline, or any MCP client to interact with realistic Slack data without requiring actual Slack API credentials.

## Features

- **6 Tools** for querying mock Slack data
- **Dynamic Resources** for channels, users, and messages
- **No API Credentials Required** - works with generated mock data
- **Fast & Consistent** - instant responses, reproducible results
- **Type-Safe** - uses official Slack Web API types

## Installation

```bash
cd packages/slack-mock-mcp-server
pnpm install
pnpm run build
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Path to the mock data JSON file (relative or absolute)
MOCK_DATA_PATH=../benchmarking/output/combined/data.json
```

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "slack-mock": {
      "command": "node",
      "args": [
        "/absolute/path/to/ebee-oss/packages/slack-mock-mcp-server/dist/index.js"
      ],
      "env": {
        "MOCK_DATA_PATH": "/absolute/path/to/ebee-oss/packages/benchmarking/output/combined/data.json"
      }
    }
  }
}
```

### Cline Configuration

Add to your VS Code settings or Cline configuration:

```json
{
  "cline.mcpServers": {
    "slack-mock": {
      "command": "node",
      "args": ["./packages/slack-mock-mcp-server/dist/index.js"],
      "env": {
        "MOCK_DATA_PATH": "./packages/benchmarking/output/combined/data.json"
      }
    }
  }
}
```

## Available Tools

### 1. `list_channels`

List all Slack channels in the mock workspace.

**Parameters:**

- `types` (optional): Filter by channel types (e.g., "public_channel,private_channel")

**Example:**

```
List all channels in the mock Slack workspace
```

**Response:**

```json
{
  "channels": [
    {
      "id": "C001",
      "name": "general",
      "is_private": false,
      "topic": "Company-wide announcements",
      "num_members": 10
    }
  ],
  "total": 9
}
```

### 2. `list_users`

List all users in the mock Slack workspace.

**Example:**

```
Show me all users in the workspace
```

**Response:**

```json
{
  "users": [
    {
      "id": "U001",
      "name": "sarah",
      "real_name": "Sarah Chen",
      "email": "sarah@gragger.com",
      "title": "CEO & Co-founder"
    }
  ],
  "total": 10
}
```

### 3. `get_channel_messages`

Get messages from a specific channel.

**Parameters:**

- `channel_id` (required): The channel ID (e.g., "C002")
- `limit` (optional): Maximum number of messages (default: 100)
- `oldest` (optional): Unix timestamp - only messages after this time
- `latest` (optional): Unix timestamp - only messages before this time

**Example:**

```
Show me the last 10 messages from the engineering channel
```

**Response:**

```json
{
  "channel": {
    "id": "C002",
    "name": "engineering"
  },
  "messages": [
    {
      "ts": "1704067200.000000",
      "user": "U003",
      "text": "Looking into the matchmaking timeout issue...",
      "thread_ts": null,
      "reply_count": 0
    }
  ],
  "total": 10
}
```

### 4. `search_messages`

Search for messages containing specific text.

**Parameters:**

- `query` (required): Text to search for
- `channel_id` (optional): Limit search to specific channel
- `limit` (optional): Maximum results (default: 50)

**Example:**

```
Search for messages about "matchmaking" in the engineering channel
```

**Response:**

```json
{
  "query": "matchmaking",
  "messages": [
    {
      "ts": "1704067200.000000",
      "channel": {
        "id": "C002",
        "name": "engineering"
      },
      "user": "U003",
      "text": "Looking into the matchmaking timeout issue..."
    }
  ],
  "total": 5
}
```

### 5. `get_user_info`

Get detailed information about a specific user.

**Parameters:**

- `user_id` (required): The user ID (e.g., "U001")

**Example:**

```
Get information about user U001
```

### 6. `get_channel_info`

Get detailed information about a specific channel.

**Parameters:**

- `channel_id` (required): The channel ID (e.g., "C001")

**Example:**

```
Get information about channel C001
```

## Available Resources

### `slack://channels`

List of all channels in the workspace

### `slack://users`

List of all users in the workspace

### `slack://channel/{channel_id}/messages`

All messages from a specific channel

### `slack://user/{user_id}`

Profile information for a specific user

## Usage Examples

### With Claude Desktop

1. **List channels:**

   ```
   List all Slack channels in the mock workspace
   ```

2. **Get recent messages:**

   ```
   Show me the last 20 messages from the #engineering channel
   ```

3. **Search across channels:**

   ```
   Search for messages mentioning "bug" or "issue"
   ```

4. **Analyze conversations:**
   ```
   What are the main topics being discussed in #product?
   ```

### With Cline

1. **Explore workspace:**

   ```
   Show me all channels and their purposes
   ```

2. **Find specific discussions:**

   ```
   Find all messages from Sarah Chen about the matchmaking feature
   ```

3. **Generate reports:**
   ```
   Create a summary of all discussions in #engineering this week
   ```

## Development

### Build

```bash
pnpm run build
```

### Watch Mode

```bash
pnpm run dev
```

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Then open the provided URL in your browser to interact with the server.

## Data Structure

The server expects mock data in the following format:

```json
{
  "slack": {
    "channels": [...],
    "users": [...],
    "messages": [...]
  }
}
```

Generate mock data using the `@ebee-oss/benchmarking` package:

```bash
cd packages/benchmarking
pnpm run generate
```

## Troubleshooting

### Server not starting

- Check that `MOCK_DATA_PATH` points to a valid JSON file
- Ensure the file contains the expected data structure
- Check console output for error messages

### No data returned

- Verify the mock data file has been generated
- Check that channels, users, and messages arrays are not empty
- Ensure the data structure matches the expected format

### Claude Desktop not connecting

- Verify the absolute paths in `claude_desktop_config.json`
- Restart Claude Desktop after configuration changes
- Check Claude Desktop logs for connection errors

## License

MIT
