# Fathom MCP Integration

This directory contains the Fathom integration for the ebee-oss project, enabling synchronization of meeting data, transcripts, summaries, and team information from Fathom.

## Overview

The Fathom integration uses the Model Context Protocol (MCP) to communicate with Fathom's API, providing:

- **Meeting Management**: Access to meeting details, participants, and metadata
- **Transcript Access**: Full meeting transcripts with speaker segments
- **Summary Generation**: AI-generated meeting summaries
- **Team Collaboration**: Team and team member information
- **Action Items**: Meeting action items and assignments (when available)
- **Highlights**: Important meeting highlights and bookmarks

## Architecture

### Components

1. **FathomMCPClient** (`mcpClient.ts`)

   - Wrapper around the MCP client for Fathom API calls
   - Handles rate limiting (500ms between requests)
   - Implements cursor-based pagination
   - Provides type-safe methods for all Fathom operations

2. **FathomAdapter** (`../sync/adapters/fathom-adapter.ts`)

   - Extends `BaseRecordAdapter` for unified data synchronization
   - Transforms Fathom data into the unified Record format
   - Extracts relationships between entities
   - Supports incremental and full synchronization

3. **Type Definitions** (`types.ts`)
   - TypeScript interfaces for all Fathom entities
   - Configuration options for the adapter
   - Union types for record handling

## Supported Record Types

- `meeting` - Meeting details with participants and metadata
- `transcript` - Full meeting transcripts with speaker segments
- `note` - Meeting notes (when available)
- `action_item` - Action items from meetings (when available)
- `highlight` - Meeting highlights and bookmarks
- `user` - User information (placeholder)
- `team` - Team information
- `team_member` - Team member details

## Usage

### Basic Setup

```typescript
import { FathomMCPClient } from "./services/sources/fathom/mcpClient.js";
import { FathomAdapter } from "./services/sync/adapters/fathom-adapter.js";

// Initialize the MCP client
const client = new FathomMCPClient();

// Create adapter with configuration
const adapter = new FathomAdapter(client, {
  includeTranscripts: true,
  includeNotes: true,
  includeActionItems: true,
  includeHighlights: true,
  includeTeams: true,
  includeTeamMembers: true,
  since: "2024-01-01T00:00:00Z", // Optional: for incremental sync
});

// Fetch all records
for await (const batch of adapter.fetchAll()) {
  console.log(`Fetched ${batch.length} records`);
  // Process batch...
}
```

### Fetching Specific Data

```typescript
// List all meetings
const meetings = await client.listMeetings();

// Get transcript for a specific recording
const transcript = await client.getTranscript("recording_id");

// Get summary for a recording
const summary = await client.getSummary("recording_id");

// List teams
const teams = await client.listTeams();

// List team members
const members = await client.listTeamMembers();
```

### Configuration Options

```typescript
interface FathomAdapterConfig {
  includeTranscripts?: boolean; // Default: true
  includeNotes?: boolean; // Default: true
  includeActionItems?: boolean; // Default: true
  includeHighlights?: boolean; // Default: true
  includeTeams?: boolean; // Default: true
  includeTeamMembers?: boolean; // Default: true
  since?: string; // ISO timestamp for incremental sync
}
```

## MCP Server Integration

The Fathom MCP server is located in `/fathom-mcp-server` and provides the following tools:

### Available Tools

1. **list_meetings**

   - Lists all meetings with optional filtering
   - Supports pagination via cursor
   - Can include transcripts, summaries, and action items

2. **get_transcript**

   - Retrieves transcript for a specific recording
   - Returns full transcript with speaker segments

3. **get_summary**

   - Gets AI-generated summary for a recording
   - Returns structured summary text

4. **list_teams**

   - Lists all teams
   - Supports cursor-based pagination

5. **list_team_members**
   - Lists team members
   - Optional team filter
   - Supports cursor-based pagination

### MCP Server Configuration

Add to your MCP configuration file:

```json
{
  "mcpServers": {
    "fathom": {
      "command": "node",
      "args": ["./fathom-mcp-server/dist/index.js"],
      "env": {
        "FATHOM_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Data Flow

1. **Sync Initiation**: Adapter calls `fetchAll()` or `fetchIncremental()`
2. **MCP Communication**: Client makes requests to Fathom MCP server
3. **Data Transformation**: Raw Fathom data is transformed to unified Record format
4. **Relationship Extraction**: Relationships between entities are identified
5. **Storage**: Records are stored in MongoDB, vectors in Qdrant, graph in Memgraph

## Relationships

The adapter automatically extracts the following relationships:

- `HAS_PARTICIPANT`: Meeting → User
- `TRANSCRIPT_OF`: Transcript → Meeting
- `NOTE_IN_MEETING`: Note → Meeting
- `CREATED_BY`: Note/Highlight → User
- `ACTION_ITEM_FROM`: ActionItem → Meeting
- `ASSIGNED_TO`: ActionItem → User
- `HIGHLIGHT_IN`: Highlight → Meeting

## Rate Limiting

The client implements automatic rate limiting:

- Default: 500ms between requests (~2 requests/second)
- Configurable via `setRateLimitDelay(ms)`
- Prevents API throttling

## Error Handling

The integration includes comprehensive error handling:

```typescript
try {
  const meetings = await client.listMeetings();
} catch (error) {
  console.error("Failed to fetch meetings:", error);
  // Handle error appropriately
}
```

## Incremental Sync

For efficient updates, use incremental sync:

```typescript
const lastSync = new Date("2024-01-01T00:00:00Z");

for await (const batch of adapter.fetchIncremental(lastSync)) {
  // Only processes records updated since lastSync
}
```

## Testing

To test the Fathom integration:

```bash
# Ensure MCP server is running
cd fathom-mcp-server
npm run build
npm start

# In another terminal, test the integration
cd packages/server
npm run test:fathom
```

## Troubleshooting

### Common Issues

1. **Empty Results**

   - Verify FATHOM_API_KEY is set correctly
   - Check if your account has meetings/teams
   - Ensure API key has necessary permissions

2. **Rate Limiting**

   - Increase delay: `client.setRateLimitDelay(1000)`
   - Reduce batch size in fetchAll options

3. **Missing Data**
   - Check configuration flags (includeTranscripts, etc.)
   - Verify data exists in Fathom account
   - Review MCP server logs for errors

## API Reference

### FathomMCPClient Methods

- `listMeetings(since?: string): Promise<FathomMeeting[]>`
- `getMeeting(meetingId: string): Promise<FathomMeeting>`
- `getTranscript(recordingId: string): Promise<FathomTranscript>`
- `getSummary(recordingId: string): Promise<string>`
- `listTeams(): Promise<FathomTeam[]>`
- `listTeamMembers(team?: string): Promise<FathomTeamMember[]>`
- `setRateLimitDelay(delayMs: number): void`

### FathomAdapter Methods

- `fetchAll(options?: FetchOptions): AsyncIterable<FathomRecord[]>`
- `fetchIncremental(since: Date, cursor?: string): AsyncIterable<FathomRecord[]>`
- `fetchById(id: string): Promise<FathomRecord | null>`
- `transform(sourceRecord: FathomRecord): Promise<Record>`
- `extractRelationships(sourceRecord: FathomRecord): Promise<EntityRelationship[]>`

## Future Enhancements

- [ ] Support for meeting recordings download
- [ ] Real-time webhook integration
- [ ] Advanced filtering and search
- [ ] Custom field mapping
- [ ] Bulk operations support

## Contributing

When contributing to the Fathom integration:

1. Follow the existing code patterns
2. Add tests for new functionality
3. Update type definitions as needed
4. Document new features in this README
5. Ensure backward compatibility

## License

See the main project LICENSE file.
