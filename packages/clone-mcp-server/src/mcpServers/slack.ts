import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import mockDataStore from "../mockData";

export const slackMcpServer = new McpServer({
  name: "slack-mcp",
  version: "0.1.0",
});

// get_all_channels
slackMcpServer.registerTool(
  "get_all_channels",
  {
    title: "Get All Channels",
    description: "Get all Slack channels",
    inputSchema: z.object({}),
  },
  async () => {
    const result = mockDataStore.slack.channels;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// get_channel_messages
slackMcpServer.registerTool(
  "get_channel_messages",
  {
    title: "Get Channel Messages",
    description: "Get messages from a Slack channel",
    inputSchema: z.object({
      channel_id: z.string().describe("The channel ID"),
      oldest: z
        .string()
        .optional()
        .describe("Only messages after this Unix timestamp"),
      latest: z
        .string()
        .optional()
        .describe("Only messages before this Unix timestamp"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of messages to return"),
    }),
  },
  async (args) => {
    const messages = mockDataStore.slack.messages.filter(
      (m: any) => m.channel === args.channel_id
    );

    // Apply time filters if provided
    let filtered = messages;
    if (args.oldest) {
      filtered = filtered.filter(
        (m: any) => parseFloat(m.ts) >= parseFloat(args.oldest!)
      );
    }
    if (args.latest) {
      filtered = filtered.filter(
        (m: any) => parseFloat(m.ts) <= parseFloat(args.latest!)
      );
    }

    // Apply limit
    if (args.limit && filtered.length > args.limit) {
      filtered = filtered.slice(0, args.limit);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
    };
  }
);

// get_thread_replies
slackMcpServer.registerTool(
  "get_thread_replies",
  {
    title: "Get Thread Replies",
    description: "Get replies to a Slack thread",
    inputSchema: z.object({
      channel_id: z.string().describe("The channel ID"),
      thread_ts: z.string().describe("The thread timestamp"),
    }),
  },
  async (args) => {
    const result = mockDataStore.slack.messages.filter(
      (m: any) =>
        m.channel === args.channel_id && m.thread_ts === args.thread_ts
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// get_all_channel_messages_with_threads
slackMcpServer.registerTool(
  "get_all_channel_messages_with_threads",
  {
    title: "Get All Channel Messages With Threads",
    description: "Get all messages from a channel including thread replies",
    inputSchema: z.object({
      channel_id: z.string().describe("The channel ID"),
      oldest: z
        .string()
        .optional()
        .describe("Only messages after this Unix timestamp"),
      latest: z
        .string()
        .optional()
        .describe("Only messages before this Unix timestamp"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of messages to return"),
    }),
  },
  async (args) => {
    // Get main messages
    const messages = mockDataStore.slack.messages.filter(
      (m: any) => m.channel === args.channel_id
    );

    let filtered = messages;
    if (args.oldest) {
      filtered = filtered.filter(
        (m: any) => parseFloat(m.ts) >= parseFloat(args.oldest!)
      );
    }
    if (args.latest) {
      filtered = filtered.filter(
        (m: any) => parseFloat(m.ts) <= parseFloat(args.latest!)
      );
    }
    if (args.limit && filtered.length > args.limit) {
      filtered = filtered.slice(0, args.limit);
    }

    const allMessages = [...filtered];

    // Get thread replies for messages that have threads
    const threadParents = filtered.filter(
      (m: any) => m.reply_count && m.reply_count > 0
    );

    for (const parent of threadParents) {
      const replies = mockDataStore.slack.messages.filter(
        (m: any) => m.channel === args.channel_id && m.thread_ts === parent.ts
      );
      // Filter out duplicates
      const newReplies = replies.filter(
        (reply: any) => !allMessages.find((m: any) => m.ts === reply.ts)
      );
      allMessages.push(...newReplies);
    }

    // Sort by timestamp
    allMessages.sort((a: any, b: any) => parseFloat(a.ts) - parseFloat(b.ts));

    return {
      content: [{ type: "text", text: JSON.stringify(allMessages, null, 2) }],
    };
  }
);

// get_all_users
slackMcpServer.registerTool(
  "get_all_users",
  {
    title: "Get All Users",
    description: "Get all Slack users",
    inputSchema: z.object({}),
  },
  async () => {
    const result = mockDataStore.slack.users;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);
