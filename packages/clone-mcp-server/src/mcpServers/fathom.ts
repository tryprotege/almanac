import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import mockDataStore from "../mockData";

export const fathomMcpServer = new McpServer({
  name: "fathom-mcp",
  version: "0.1.0",
});

// list_meetings
fathomMcpServer.registerTool(
  "list_meetings",
  {
    title: "List Meetings",
    description: "List all meetings with optional filtering",
    inputSchema: z.object({
      created_after: z
        .string()
        .optional()
        .describe("Filter to meetings with created_at after this timestamp"),
      created_before: z
        .string()
        .optional()
        .describe("Filter to meetings with created_at before this timestamp"),
      cursor: z.string().optional().describe("Cursor for pagination"),
    }),
  },
  async (args) => {
    const result = {
      items: mockDataStore.fathom.meetings,
      next_cursor: null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// get_meeting
fathomMcpServer.registerTool(
  "get_meeting",
  {
    title: "Get Meeting",
    description: "Get a specific meeting by recording ID",
    inputSchema: z.object({
      recording_id: z.string().describe("The ID of the recording"),
    }),
  },
  async (args) => {
    const result = mockDataStore.fathom.meetings.find(
      (m: any) => m.recording_id.toString() === args.recording_id
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// get_transcript
fathomMcpServer.registerTool(
  "get_transcript",
  {
    title: "Get Transcript",
    description: "Get transcript for a specific recording",
    inputSchema: z.object({
      recording_id: z.string().describe("The ID of the recording"),
    }),
  },
  async (args) => {
    const transcript = mockDataStore.fathom.transcripts.find(
      (t: any) => t.recording_id.toString() === args.recording_id
    );
    const result = transcript || {
      recording_id: parseInt(args.recording_id),
      transcripts: [],
      type: "transcript",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// get_summary
fathomMcpServer.registerTool(
  "get_summary",
  {
    title: "Get Summary",
    description: "Get summary for a specific recording",
    inputSchema: z.object({
      recording_id: z.string().describe("The ID of the recording"),
    }),
  },
  async (args) => {
    const summary = mockDataStore.fathom.summaries.find(
      (s: any) => s.recording_id.toString() === args.recording_id
    );
    const result = summary || {
      type: "summary",
      recording_id: parseInt(args.recording_id),
      summary: "",
      created_at: new Date().toISOString(),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// list_teams
fathomMcpServer.registerTool(
  "list_teams",
  {
    title: "List Teams",
    description: "List all teams",
    inputSchema: z.object({}),
  },
  async () => {
    const result = {
      items: mockDataStore.fathom.teams,
      next_cursor: null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// list_team_members
fathomMcpServer.registerTool(
  "list_team_members",
  {
    title: "List Team Members",
    description: "List all team members",
    inputSchema: z.object({
      team_id: z.string().describe("Team ID to filter by"),
    }),
  },
  async (args) => {
    const members = mockDataStore.fathom.teamMembers.filter(
      (m: any) => m.team === args.team_id
    );
    const result = {
      items: members,
      next_cursor: null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// get_me
fathomMcpServer.registerTool(
  "get_me",
  {
    title: "Get Me",
    description: "Get current user information",
    inputSchema: z.object({}),
  },
  async () => {
    const result = {
      email: "user@example.com",
      name: "Current User",
      email_domain: "example.com",
      team: "default",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);
