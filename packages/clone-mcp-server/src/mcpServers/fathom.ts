import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mockData } from "../mockData.js";

const fathomMcpServer = new McpServer({
  name: "fathom-mcp",
  version: "0.1.0",
});

// list_meetings
fathomMcpServer.registerTool(
  "list_meetings",
  {
    description: "[fathom] List all meetings with optional filtering",
    inputSchema: z.object({
      calendar_invitees_domains: z
        .array(z.string())
        .optional()
        .describe("Domains of the companies to filter by. Exact match."),
      calendar_invitees_domains_type: z
        .enum(["all", "only_internal", "one_or_more_external"])
        .optional()
        .describe(
          "Filter by whether calendar invitee list includes external email domains"
        ),
      created_after: z
        .string()
        .optional()
        .describe(
          "Filter to meetings with created_at after this timestamp, e.g. created_after=2025-01-01T00:00:00Z"
        ),
      created_before: z
        .string()
        .optional()
        .describe("Filter to meetings with created_at before this timestamp"),
      cursor: z.string().optional().describe("Cursor for pagination"),
      include_action_items: z
        .boolean()
        .optional()
        .describe("Include the action items for each meeting"),
      include_crm_matches: z
        .boolean()
        .optional()
        .describe(
          "Include CRM matches for each meeting. Only returns data from your or your team's linked CRM"
        ),
      include_summary: z
        .boolean()
        .optional()
        .describe(
          "Include the summary for each meeting. Unavailable for OAuth connected apps (use /recordings instead)"
        ),
      include_transcript: z
        .boolean()
        .optional()
        .describe(
          "Include the transcript for each meeting. Unavailable for OAuth connected apps (use /recordings instead)"
        ),
      limit: z.number().optional().describe("Number of results per page"),
    }),
  },
  async (args) => {
    let meetings = mockData.fathom.meetings;

    if (args.created_after) {
      const afterDate = new Date(args.created_after);
      meetings = meetings.filter((m) => new Date(m.created_at) >= afterDate);
    }

    if (args.created_before) {
      const beforeDate = new Date(args.created_before);
      meetings = meetings.filter((m) => new Date(m.created_at) <= beforeDate);
    }

    // Handle cursor-based pagination
    let startIndex = 0;
    if (args.cursor) {
      const cursorId = parseInt(args.cursor);
      const cursorIndex = meetings.findIndex(
        (m) => m.recording_id === cursorId
      );
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1; // Start after the cursor
      }
    }

    const limit = args.limit || 50;
    const paginatedMeetings = meetings.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < meetings.length
        ? meetings[startIndex + limit].recording_id.toString()
        : null;

    const result = {
      items: paginatedMeetings,
      next_cursor: nextCursor,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// get_transcript
fathomMcpServer.registerTool(
  "get_transcript",
  {
    description: "[fathom] Get transcript for a specific recording",
    inputSchema: z.object({
      recording_id: z.string().describe("The ID of the recording"),
    }),
  },
  async (args) => {
    const transcript = mockData.fathom.transcripts.find(
      (t) => t.recording_id.toString() === args.recording_id
    );
    const result = transcript || {
      recording_id: parseInt(args.recording_id),
      transcripts: [],
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
    description: "[fathom] Get summary for a specific recording",
    inputSchema: z.object({
      recording_id: z.string().describe("The ID of the recording"),
    }),
  },
  async (args) => {
    const summary = mockData.fathom.summaries.find(
      (s) => s.recording_id.toString() === args.recording_id
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
    description: "[fathom] List all teams",
    inputSchema: z.object({
      cursor: z.string().optional().describe("Cursor for pagination"),
    }),
  },
  async (args) => {
    let teams = mockData.fathom.teams;

    // Handle cursor-based pagination
    let startIndex = 0;
    if (args.cursor) {
      const cursorIndex = teams.findIndex((t) => t.id === args.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1; // Start after the cursor
      }
    }

    const limit = 50;
    const paginatedTeams = teams.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < teams.length ? teams[startIndex + limit].id : null;

    const result = {
      items: paginatedTeams,
      next_cursor: nextCursor,
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
    description: "[fathom] List all team members",
    inputSchema: z.object({
      cursor: z.string().optional().describe("Cursor for pagination"),
      team: z.string().optional().describe("Team name to filter by"),
    }),
  },
  async (args) => {
    let members = mockData.fathom.teamMembers;

    if (args.team) {
      members = members.filter((m) => m.team === args.team);
    }

    // Handle cursor-based pagination
    let startIndex = 0;
    if (args.cursor) {
      const cursorIndex = members.findIndex((m) => m.id === args.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1; // Start after the cursor
      }
    }

    const limit = 50;
    const paginatedMembers = members.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < members.length
        ? members[startIndex + limit].id
        : null;

    const result = {
      items: paginatedMembers,
      next_cursor: nextCursor,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

export { fathomMcpServer };
