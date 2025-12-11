#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadMockData } from "./data-loader.js";
import type { MockData, SourceType } from "./types.js";

// Import all handlers
import * as slackHandlers from "./handlers/slack.js";
import * as githubHandlers from "./handlers/github.js";
import * as notionHandlers from "./handlers/notion.js";
import * as fathomHandlers from "./handlers/fathom.js";

// Get configuration from environment variables
const MOCK_DATA_PATH =
  process.env.MOCK_DATA_PATH || "../benchmarking/output/combined/data.json";
const SOURCE_TYPE = (process.env.SOURCE_TYPE || "slack") as SourceType;

// Validate SOURCE_TYPE
const VALID_SOURCE_TYPES: SourceType[] = [
  "slack",
  "github",
  "notion",
  "fathom",
];
if (!VALID_SOURCE_TYPES.includes(SOURCE_TYPE)) {
  console.error(
    `Invalid SOURCE_TYPE: ${SOURCE_TYPE}. Must be one of: ${VALID_SOURCE_TYPES.join(
      ", "
    )}`
  );
  process.exit(1);
}

// Load mock data at startup
let mockData: MockData;
try {
  mockData = loadMockData(MOCK_DATA_PATH, SOURCE_TYPE);
} catch (error) {
  console.error("Failed to load mock data:", error);
  process.exit(1);
}

// Create MCP server
const mcpServer = new McpServer(
  {
    name: `${SOURCE_TYPE}-mock-mcp-server`,
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/**
 * Tool definitions by source type
 */
const TOOL_DEFINITIONS = {
  slack: [
    {
      name: "list_channels",
      description:
        "List all Slack channels in the mock workspace. Optionally filter by channel type (public_channel, private_channel).",
      inputSchema: {
        type: "object",
        properties: {
          types: {
            type: "string",
            description:
              "Comma-separated list of channel types to include (e.g., 'public_channel,private_channel')",
          },
        },
      },
    },
    {
      name: "list_users",
      description: "List all users in the mock Slack workspace.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_channel_messages",
      description:
        "Get messages from a specific Slack channel. Returns messages sorted by timestamp.",
      inputSchema: {
        type: "object",
        properties: {
          channel_id: {
            type: "string",
            description: "The channel ID to fetch messages from (e.g., 'C001')",
          },
          limit: {
            type: "number",
            description: "Maximum number of messages to return (default: 100)",
          },
          oldest: {
            type: "string",
            description: "Only messages after this Unix timestamp (in seconds)",
          },
          latest: {
            type: "string",
            description:
              "Only messages before this Unix timestamp (in seconds)",
          },
        },
        required: ["channel_id"],
      },
    },
    {
      name: "search_messages",
      description:
        "Search for messages containing specific text across all channels or within a specific channel.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for in messages",
          },
          channel_id: {
            type: "string",
            description: "Optional: limit search to a specific channel",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (default: 50)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_user_info",
      description:
        "Get detailed information about a specific user by their ID.",
      inputSchema: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "The user ID to look up (e.g., 'U001')",
          },
        },
        required: ["user_id"],
      },
    },
    {
      name: "get_channel_info",
      description:
        "Get detailed information about a specific channel by its ID.",
      inputSchema: {
        type: "object",
        properties: {
          channel_id: {
            type: "string",
            description: "The channel ID to look up (e.g., 'C001')",
          },
        },
        required: ["channel_id"],
      },
    },
  ],
  github: [
    {
      name: "get_me",
      description: "Get the authenticated user (current user) information.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_repositories",
      description: "List all repositories in the mock GitHub organization.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "search_repositories",
      description:
        "Search for repositories by name or description in the mock GitHub organization.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query to match against repository names and descriptions",
          },
          limit: {
            type: "number",
            description: "Maximum number of repositories to return",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "search_users",
      description:
        "Search for users by login or name in the mock GitHub organization.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to match against user logins and names",
          },
          limit: {
            type: "number",
            description: "Maximum number of users to return",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "list_issues",
      description:
        "List issues from the mock GitHub organization. Optionally filter by repository and state.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Filter by repository name",
          },
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Filter by issue state (default: all)",
          },
          limit: {
            type: "number",
            description: "Maximum number of issues to return",
          },
        },
      },
    },
    {
      name: "list_pull_requests",
      description:
        "List pull requests from the mock GitHub organization. Optionally filter by repository and state.",
      inputSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Filter by repository name",
          },
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Filter by PR state (default: all)",
          },
          limit: {
            type: "number",
            description: "Maximum number of PRs to return",
          },
        },
      },
    },
    {
      name: "get_issue",
      description: "Get a specific issue by its number.",
      inputSchema: {
        type: "object",
        properties: {
          issue_number: {
            type: "number",
            description: "The issue number to look up",
          },
        },
        required: ["issue_number"],
      },
    },
    {
      name: "get_pull_request",
      description: "Get a specific pull request by its number.",
      inputSchema: {
        type: "object",
        properties: {
          pr_number: {
            type: "number",
            description: "The PR number to look up",
          },
        },
        required: ["pr_number"],
      },
    },
  ],
  notion: [
    {
      name: "list_databases",
      description: "List all databases in the mock Notion workspace.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_pages",
      description:
        "List pages from the mock Notion workspace. Optionally filter by database.",
      inputSchema: {
        type: "object",
        properties: {
          database_id: {
            type: "string",
            description: "Filter by database ID",
          },
          limit: {
            type: "number",
            description: "Maximum number of pages to return",
          },
        },
      },
    },
    {
      name: "get_page",
      description: "Get a specific page by its ID.",
      inputSchema: {
        type: "object",
        properties: {
          page_id: {
            type: "string",
            description: "The page ID to look up",
          },
        },
        required: ["page_id"],
      },
    },
    {
      name: "search_pages",
      description: "Search for pages by title.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for in page titles",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return",
          },
        },
        required: ["query"],
      },
    },
  ],
  fathom: [
    {
      name: "list_meetings",
      description:
        "List meetings from the mock Fathom workspace. Optionally filter by date range.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of meetings to return",
          },
          start_date: {
            type: "string",
            description: "Filter meetings after this date (ISO 8601 format)",
          },
          end_date: {
            type: "string",
            description: "Filter meetings before this date (ISO 8601 format)",
          },
        },
      },
    },
    {
      name: "get_meeting",
      description: "Get a specific meeting by its ID.",
      inputSchema: {
        type: "object",
        properties: {
          meeting_id: {
            type: "string",
            description: "The meeting ID to look up",
          },
        },
        required: ["meeting_id"],
      },
    },
    {
      name: "get_transcript",
      description: "Get the transcript for a specific recording.",
      inputSchema: {
        type: "object",
        properties: {
          recording_id: {
            type: "string",
            description: "The recording ID to get transcript for",
          },
        },
        required: ["recording_id"],
      },
    },
    {
      name: "get_summary",
      description: "Get the summary for a specific recording.",
      inputSchema: {
        type: "object",
        properties: {
          recording_id: {
            type: "string",
            description: "The recording ID to get summary for",
          },
        },
        required: ["recording_id"],
      },
    },
    {
      name: "search_meetings",
      description: "Search for meetings by title or participants.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for in meeting titles or participants",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return",
          },
        },
        required: ["query"],
      },
    },
  ],
};

/**
 * List available tools based on SOURCE_TYPE
 */
mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOL_DEFINITIONS[SOURCE_TYPE],
  };
});

/**
 * Handle tool calls based on SOURCE_TYPE
 */
mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (SOURCE_TYPE) {
      case "slack":
        return handleSlackTool(name, args);
      case "github":
        return handleGitHubTool(name, args);
      case "notion":
        return handleNotionTool(name, args);
      case "fathom":
        return handleFathomTool(name, args);
      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Unsupported source type: ${SOURCE_TYPE}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: `Tool execution failed: ${error}`,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Slack tool handlers
 */
function handleSlackTool(name: string, args: any) {
  switch (name) {
    case "list_channels": {
      const channels = slackHandlers.getChannels(mockData, args.types);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                channels: channels.map((c) => ({
                  id: c.id,
                  name: c.name,
                  is_private: c.is_private,
                  topic: c.topic?.value,
                  purpose: c.purpose?.value,
                  num_members: c.num_members,
                })),
                total: channels.length,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "list_users": {
      const users = slackHandlers.getUsers(mockData);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                users: users.map((u) => ({
                  id: u.id,
                  name: u.name,
                  real_name: u.real_name,
                  email: u.profile?.email,
                  title: u.profile?.title,
                  is_bot: u.is_bot,
                })),
                total: users.length,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_channel_messages": {
      const messages = slackHandlers.getChannelMessages(
        mockData,
        args.channel_id,
        {
          limit: args.limit || 100,
          oldest: args.oldest,
          latest: args.latest,
        }
      );

      const channel = slackHandlers.getChannelById(mockData, args.channel_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                channel: {
                  id: channel?.id,
                  name: channel?.name,
                },
                messages: messages.map((m) => ({
                  ts: m.ts,
                  user: m.user,
                  text: m.text,
                  thread_ts: m.thread_ts,
                  reply_count: m.reply_count,
                })),
                total: messages.length,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "search_messages": {
      const messages = slackHandlers.searchMessages(mockData, args.query, {
        channel_id: args.channel_id,
        limit: args.limit || 50,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query: args.query,
                messages: messages.map((m) => {
                  const channel = slackHandlers.getChannelById(
                    mockData,
                    m.channel!
                  );
                  return {
                    ts: m.ts,
                    channel: {
                      id: m.channel,
                      name: channel?.name,
                    },
                    user: m.user,
                    text: m.text,
                  };
                }),
                total: messages.length,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_user_info": {
      const user = slackHandlers.getUserById(mockData, args.user_id);

      if (!user) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `User not found: ${args.user_id}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: user.id,
                name: user.name,
                real_name: user.real_name,
                email: user.profile?.email,
                title: user.profile?.title,
                status_text: user.profile?.status_text,
                is_bot: user.is_bot,
                is_admin: user.is_admin,
                profile: user.profile,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_channel_info": {
      const channel = slackHandlers.getChannelById(mockData, args.channel_id);

      if (!channel) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Channel not found: ${args.channel_id}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: channel.id,
                name: channel.name,
                is_private: channel.is_private,
                is_archived: channel.is_archived,
                topic: channel.topic,
                purpose: channel.purpose,
                num_members: channel.num_members,
                creator: channel.creator,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
          },
        ],
        isError: true,
      };
  }
}

/**
 * GitHub tool handlers
 */
function handleGitHubTool(name: string, args: any) {
  switch (name) {
    case "get_me": {
      const user = githubHandlers.getMe(mockData);
      if (!user) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: "Authenticated user not found" },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(user, null, 2),
          },
        ],
      };
    }

    case "list_repositories": {
      const repos = githubHandlers.getRepositories(mockData);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { repositories: repos, total: repos.length },
              null,
              2
            ),
          },
        ],
      };
    }

    case "search_repositories": {
      const repos = githubHandlers.searchRepositories(mockData, args.query, {
        limit: args.limit,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { query: args.query, items: repos, total: repos.length },
              null,
              2
            ),
          },
        ],
      };
    }

    case "search_users": {
      const users = githubHandlers.searchUsers(mockData, args.query, {
        limit: args.limit,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { query: args.query, users, total: users.length },
              null,
              2
            ),
          },
        ],
      };
    }

    case "list_issues": {
      const issues = githubHandlers.getIssues(mockData, {
        repo: args.repo,
        state: args.state || "all",
        limit: args.limit,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ issues, total: issues.length }, null, 2),
          },
        ],
      };
    }

    case "list_pull_requests": {
      const prs = githubHandlers.getPullRequests(mockData, {
        repo: args.repo,
        state: args.state || "all",
        limit: args.limit,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { pull_requests: prs, total: prs.length },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_issue": {
      const issue = githubHandlers.getIssueByNumber(
        mockData,
        args.issue_number
      );
      if (!issue) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Issue not found: #${args.issue_number}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ issue }, null, 2),
          },
        ],
      };
    }

    case "get_pull_request": {
      const pr = githubHandlers.getPullRequestByNumber(
        mockData,
        args.pr_number
      );
      if (!pr) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Pull request not found: #${args.pr_number}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ pull_request: pr }, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
          },
        ],
        isError: true,
      };
  }
}

/**
 * Notion tool handlers
 */
function handleNotionTool(name: string, args: any) {
  switch (name) {
    case "list_databases": {
      const databases = notionHandlers.getDatabases(mockData);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { databases, total: databases.length },
              null,
              2
            ),
          },
        ],
      };
    }

    case "list_pages": {
      const pages = notionHandlers.getPages(mockData, {
        database_id: args.database_id,
        limit: args.limit,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ pages, total: pages.length }, null, 2),
          },
        ],
      };
    }

    case "get_page": {
      const page = notionHandlers.getPageById(mockData, args.page_id);
      if (!page) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Page not found: ${args.page_id}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ page }, null, 2),
          },
        ],
      };
    }

    case "search_pages": {
      const pages = notionHandlers.searchPages(mockData, args.query, {
        limit: args.limit,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { query: args.query, pages, total: pages.length },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
          },
        ],
        isError: true,
      };
  }
}

/**
 * Fathom tool handlers
 */
function handleFathomTool(name: string, args: any) {
  switch (name) {
    case "list_meetings": {
      const meetings = fathomHandlers.getMeetings(mockData, {
        limit: args.limit,
        start_date: args.start_date,
        end_date: args.end_date,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ meetings, total: meetings.length }, null, 2),
          },
        ],
      };
    }

    case "get_meeting": {
      const meeting = fathomHandlers.getMeetingById(mockData, args.meeting_id);
      if (!meeting) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Meeting not found: ${args.meeting_id}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ meeting }, null, 2),
          },
        ],
      };
    }

    case "get_transcript": {
      const transcript = fathomHandlers.getTranscriptByRecordingId(
        mockData,
        args.recording_id
      );
      if (!transcript) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: `Transcript not found for recording: ${args.recording_id}`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ transcript }, null, 2),
          },
        ],
      };
    }

    case "get_summary": {
      const summary = fathomHandlers.getSummaryByRecordingId(
        mockData,
        args.recording_id
      );
      if (!summary) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: `Summary not found for recording: ${args.recording_id}`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ summary }, null, 2),
          },
        ],
      };
    }

    case "search_meetings": {
      const meetings = fathomHandlers.searchMeetings(mockData, args.query, {
        limit: args.limit,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { query: args.query, meetings, total: meetings.length },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
          },
        ],
        isError: true,
      };
  }
}

/**
 * List available resources based on SOURCE_TYPE
 */
mcpServer.server.setRequestHandler(ListResourcesRequestSchema, async () => {
  switch (SOURCE_TYPE) {
    case "slack":
      return listSlackResources();
    case "github":
      return listGitHubResources();
    case "notion":
      return listNotionResources();
    case "fathom":
      return listFathomResources();
    default:
      return { resources: [] };
  }
});

function listSlackResources() {
  const channels = slackHandlers.getChannels(mockData);
  const users = slackHandlers.getUsers(mockData);

  return {
    resources: [
      {
        uri: "slack://channels",
        name: "All Slack Channels",
        description: "List of all channels in the mock workspace",
        mimeType: "application/json",
      },
      {
        uri: "slack://users",
        name: "All Slack Users",
        description: "List of all users in the mock workspace",
        mimeType: "application/json",
      },
      ...channels.map((c) => ({
        uri: `slack://channel/${c.id}/messages`,
        name: `#${c.name} Messages`,
        description: `Messages from the #${c.name} channel`,
        mimeType: "application/json",
      })),
      ...users.map((u) => ({
        uri: `slack://user/${u.id}`,
        name: `${u.real_name || u.name}`,
        description: `Profile information for ${u.real_name || u.name}`,
        mimeType: "application/json",
      })),
    ],
  };
}

function listGitHubResources() {
  const repos = githubHandlers.getRepositories(mockData);
  const issues = githubHandlers.getIssues(mockData);
  const prs = githubHandlers.getPullRequests(mockData);

  return {
    resources: [
      {
        uri: "github://repositories",
        name: "All Repositories",
        description: "List of all repositories in the mock organization",
        mimeType: "application/json",
      },
      {
        uri: "github://issues",
        name: "All Issues",
        description: "List of all issues across repositories",
        mimeType: "application/json",
      },
      {
        uri: "github://pull-requests",
        name: "All Pull Requests",
        description: "List of all pull requests across repositories",
        mimeType: "application/json",
      },
      ...repos.map((r) => ({
        uri: `github://repo/${r.name}`,
        name: r.name,
        description: `Repository: ${r.name}`,
        mimeType: "application/json",
      })),
      ...issues.map((i) => ({
        uri: `github://issue/${i.number}`,
        name: `Issue #${i.number}: ${i.title}`,
        description: `Issue #${i.number} in ${i.repository?.name}`,
        mimeType: "application/json",
      })),
      ...prs.map((pr) => ({
        uri: `github://pr/${pr.number}`,
        name: `PR #${pr.number}: ${pr.title}`,
        description: `Pull request #${pr.number} in ${pr.repository?.name}`,
        mimeType: "application/json",
      })),
    ],
  };
}

function listNotionResources() {
  const databases = notionHandlers.getDatabases(mockData);
  const pages = notionHandlers.getPages(mockData);

  return {
    resources: [
      {
        uri: "notion://databases",
        name: "All Databases",
        description: "List of all databases in the mock workspace",
        mimeType: "application/json",
      },
      {
        uri: "notion://pages",
        name: "All Pages",
        description: "List of all pages in the mock workspace",
        mimeType: "application/json",
      },
      ...databases.map((db) => ({
        uri: `notion://database/${db.id}`,
        name: db.title?.[0]?.plain_text || "Untitled Database",
        description: `Database: ${db.title?.[0]?.plain_text || "Untitled"}`,
        mimeType: "application/json",
      })),
      ...pages.map((p) => ({
        uri: `notion://page/${p.id}`,
        name: p.properties?.title?.title?.[0]?.plain_text || "Untitled Page",
        description: `Page: ${
          p.properties?.title?.title?.[0]?.plain_text || "Untitled"
        }`,
        mimeType: "application/json",
      })),
    ],
  };
}

function listFathomResources() {
  const meetings = fathomHandlers.getMeetings(mockData);

  return {
    resources: [
      {
        uri: "fathom://meetings",
        name: "All Meetings",
        description: "List of all meetings in the mock workspace",
        mimeType: "application/json",
      },
      ...meetings.map((m) => ({
        uri: `fathom://meeting/${m.id}`,
        name: m.title || "Untitled Meeting",
        description: `Meeting: ${m.title || "Untitled"} (${new Date(
          m.start_time
        ).toLocaleDateString()})`,
        mimeType: "application/json",
      })),
    ],
  };
}

/**
 * Read resource content based on SOURCE_TYPE
 */
mcpServer.server.setRequestHandler(
  ReadResourceRequestSchema,
  async (request) => {
    const { uri } = request.params;

    try {
      switch (SOURCE_TYPE) {
        case "slack":
          return readSlackResource(uri);
        case "github":
          return readGitHubResource(uri);
        case "notion":
          return readNotionResource(uri);
        case "fathom":
          return readFathomResource(uri);
        default:
          throw new Error(`Unsupported source type: ${SOURCE_TYPE}`);
      }
    } catch (error) {
      throw new Error(`Failed to read resource: ${error}`);
    }
  }
);

function readSlackResource(uri: string) {
  if (uri === "slack://channels") {
    const channels = slackHandlers.getChannels(mockData);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ channels }, null, 2),
        },
      ],
    };
  }

  if (uri === "slack://users") {
    const users = slackHandlers.getUsers(mockData);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ users }, null, 2),
        },
      ],
    };
  }

  const channelMatch = uri.match(/^slack:\/\/channel\/([^/]+)\/messages$/);
  if (channelMatch) {
    const channelId = channelMatch[1];
    const messages = slackHandlers.getChannelMessages(mockData, channelId);
    const channel = slackHandlers.getChannelById(mockData, channelId);

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              channel: {
                id: channel?.id,
                name: channel?.name,
              },
              messages,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const userMatch = uri.match(/^slack:\/\/user\/([^/]+)$/);
  if (userMatch) {
    const userId = userMatch[1];
    const user = slackHandlers.getUserById(mockData, userId);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ user }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

function readGitHubResource(uri: string) {
  if (uri === "github://repositories") {
    const repos = githubHandlers.getRepositories(mockData);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ repositories: repos }, null, 2),
        },
      ],
    };
  }

  if (uri === "github://issues") {
    const issues = githubHandlers.getIssues(mockData);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ issues }, null, 2),
        },
      ],
    };
  }

  if (uri === "github://pull-requests") {
    const prs = githubHandlers.getPullRequests(mockData);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ pull_requests: prs }, null, 2),
        },
      ],
    };
  }

  const issueMatch = uri.match(/^github:\/\/issue\/(\d+)$/);
  if (issueMatch) {
    const issueNumber = parseInt(issueMatch[1]);
    const issue = githubHandlers.getIssueByNumber(mockData, issueNumber);

    if (!issue) {
      throw new Error(`Issue not found: #${issueNumber}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ issue }, null, 2),
        },
      ],
    };
  }

  const prMatch = uri.match(/^github:\/\/pr\/(\d+)$/);
  if (prMatch) {
    const prNumber = parseInt(prMatch[1]);
    const pr = githubHandlers.getPullRequestByNumber(mockData, prNumber);

    if (!pr) {
      throw new Error(`Pull request not found: #${prNumber}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ pull_request: pr }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

function readNotionResource(uri: string) {
  if (uri === "notion://databases") {
    const databases = notionHandlers.getDatabases(mockData);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ databases }, null, 2),
        },
      ],
    };
  }

  if (uri === "notion://pages") {
    const pages = notionHandlers.getPages(mockData);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ pages }, null, 2),
        },
      ],
    };
  }

  const pageMatch = uri.match(/^notion:\/\/page\/([^/]+)$/);
  if (pageMatch) {
    const pageId = pageMatch[1];
    const page = notionHandlers.getPageById(mockData, pageId);

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    const blocks = notionHandlers.getBlocks(mockData, pageId);

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ page, blocks }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

function readFathomResource(uri: string) {
  if (uri === "fathom://meetings") {
    const meetings = fathomHandlers.getMeetings(mockData);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ meetings }, null, 2),
        },
      ],
    };
  }

  const meetingMatch = uri.match(/^fathom:\/\/meeting\/([^/]+)$/);
  if (meetingMatch) {
    const meetingId = meetingMatch[1];
    const meeting = fathomHandlers.getMeetingById(mockData, meetingId);

    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    // Try to get transcript and summary if available
    const transcript = meeting.recording_id
      ? fathomHandlers.getTranscriptByRecordingId(
          mockData,
          meeting.recording_id
        )
      : null;
    const summary = meeting.recording_id
      ? fathomHandlers.getSummaryByRecordingId(mockData, meeting.recording_id)
      : null;

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ meeting, transcript, summary }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error(
    `${SOURCE_TYPE.toUpperCase()} Mock MCP Server running on stdio`
  );
  console.error(`Source Type: ${SOURCE_TYPE}`);
  console.error(`Loaded data from: ${MOCK_DATA_PATH}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
