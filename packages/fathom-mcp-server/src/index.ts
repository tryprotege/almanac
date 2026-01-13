#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { FathomClient } from './fathom-client.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Get API key from environment
const FATHOM_API_KEY = process.env.FATHOM_API_KEY;
if (!FATHOM_API_KEY) {
  console.error('Error: FATHOM_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize Fathom client
const fathomClient = new FathomClient(FATHOM_API_KEY);

// Define MCP tools based on Fathom API
const tools: Tool[] = [
  {
    name: 'list_meetings',
    description: 'List all meetings with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_invitees_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Domains of the companies to filter by. Exact match.',
        },
        calendar_invitees_domains_type: {
          type: 'string',
          enum: ['all', 'only_internal', 'one_or_more_external'],
          description: 'Filter by whether calendar invitee list includes external email domains',
        },
        created_after: {
          type: 'string',
          description:
            'Filter to meetings with created_at after this timestamp, e.g. created_after=2025-01-01T00:00:00Z',
        },
        created_before: {
          type: 'string',
          description: 'Filter to meetings with created_at before this timestamp',
        },
        cursor: {
          type: 'string',
          description: 'Cursor for pagination',
        },
        include_action_items: {
          type: 'boolean',
          description: 'Include the action items for each meeting',
        },
        include_crm_matches: {
          type: 'boolean',
          description:
            "Include CRM matches for each meeting. Only returns data from your or your team's linked CRM",
        },
        include_summary: {
          type: 'boolean',
          description:
            'Include the summary for each meeting. Unavailable for OAuth connected apps (use /recordings instead)',
        },
        include_transcript: {
          type: 'boolean',
          description:
            'Include the transcript for each meeting. Unavailable for OAuth connected apps (use /recordings instead)',
        },
        limit: {
          type: 'number',
          description: 'Number of results per page',
        },
      },
    },
  },
  {
    name: 'get_transcript',
    description: 'Get transcript for a specific recording',
    inputSchema: {
      type: 'object',
      properties: {
        recording_id: {
          type: 'string',
          description: 'The ID of the recording',
        },
      },
      required: ['recording_id'],
    },
  },
  {
    name: 'get_summary',
    description: 'Get summary for a specific recording',
    inputSchema: {
      type: 'object',
      properties: {
        recording_id: {
          type: 'string',
          description: 'The ID of the recording',
        },
      },
      required: ['recording_id'],
    },
  },
  {
    name: 'list_teams',
    description: 'List all teams',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Cursor for pagination',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_team_members',
    description: 'List all team members',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Cursor for pagination',
        },
        team: {
          type: 'string',
          description: 'Team name to filter by',
        },
      },
      required: [],
    },
  },
];

// Create MCP server
const mcpServer = new McpServer(
  {
    name: 'fathom-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Handle list_tools request
mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle call_tool request
mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'list_meetings':
        result = await fathomClient.listMeetings(args as any);
        break;

      case 'get_summary':
        result = await fathomClient.getSummary((args as any).recording_id);
        break;

      case 'get_transcript':
        result = await fathomClient.getTranscript((args as any).recording_id);
        break;

      case 'list_teams':
        result = await fathomClient.getTeams(args as any);
        break;

      case 'list_team_members':
        result = await fathomClient.getTeamMembers(args as any);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: error.message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('Fathom MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
