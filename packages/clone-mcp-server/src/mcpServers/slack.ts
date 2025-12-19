import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stringify } from "csv-stringify/sync";
import { mockData } from "../mockData.js";

const slackMcpServer = new McpServer({
  name: "slack-mcp",
  version: "0.1.0",
});

// channels_list
slackMcpServer.registerTool(
  "channels_list",
  {
    description: "Get list of channels",
    inputSchema: z.object({
      channel_types: z
        .string()
        .describe(
          "Comma-separated channel types. Allowed values: 'mpim', 'im', 'public_channel', 'private_channel'. Example: 'public_channel,private_channel,im'"
        ),
      cursor: z
        .string()
        .optional()
        .describe(
          "Cursor for pagination. Use the value of the last row and column in the response as next_cursor field returned from the previous request."
        ),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe(
          "The maximum number of items to return. Must be an integer between 1 and 1000 (maximum 999)."
        ),
      sort: z
        .string()
        .optional()
        .describe(
          "Type of sorting. Allowed values: 'popularity' - sort by number of members/participants in each channel."
        ),
    }),
  },
  async (args) => {
    const limit = args.limit || 100;
    let channels = mockData.slack.channels;

    // Find starting index based on cursor
    let startIndex = 0;
    if (args.cursor) {
      startIndex = channels.findIndex((c) => c.id === args.cursor);
      if (startIndex === -1) startIndex = 0;
      else startIndex += 1; // Start after the cursor
    }

    // Get paginated slice
    const paginatedChannels = channels.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < channels.length;
    const nextCursor =
      hasMore && paginatedChannels.length > 0
        ? paginatedChannels[paginatedChannels.length - 1].id || ""
        : "";

    // Convert to CSV format with columns: ID, Name, Topic, Purpose, MemberCount, Cursor
    const csvData = paginatedChannels.map((channel) => ({
      ID: channel.id || "",
      Name: channel.name || "",
      Topic: channel.topic?.value || "",
      Purpose: channel.purpose?.value || "",
      MemberCount: channel.num_members || 0,
      Cursor: nextCursor,
    }));

    const csv = stringify(csvData, {
      header: true,
      columns: ["ID", "Name", "Topic", "Purpose", "MemberCount", "Cursor"],
    });

    return {
      content: [{ type: "text", text: csv }],
    };
  }
);

// conversations_add_message
slackMcpServer.registerTool(
  "conversations_add_message",
  {
    description:
      "Add a message to a public channel, private channel, or direct message (DM, or IM) conversation by channel_id and thread_ts.",
    inputSchema: z.object({
      channel_id: z
        .string()
        .describe(
          "ID of the channel in format Cxxxxxxxxxx or its name starting with #... or @... aka #general or @username_dm."
        ),
      content_type: z
        .string()
        .optional()
        .default("text/markdown")
        .describe(
          "Content type of the message. Default is 'text/markdown'. Allowed values: 'text/markdown', 'text/plain'."
        ),
      payload: z
        .string()
        .optional()
        .describe(
          "Message payload in specified content_type format. Example: 'Hello, world!' for text/plain or '# Hello, world!' for text/markdown."
        ),
      thread_ts: z
        .string()
        .optional()
        .describe(
          "Unique identifier of either a thread's parent message or a message in the thread_ts must be the timestamp in format 1234567890.123456 of an existing message with 0 or more replies. Optional, if not provided the message will be added to the channel itself, otherwise it will be added to the thread."
        ),
    }),
  },
  async (args) => {
    const result = {
      ok: true,
      channel: args.channel_id,
      ts: Date.now().toString() + ".000000",
      message: {
        text: args.payload || "",
        user: "mock_user_id",
        type: "message",
        ts: Date.now().toString() + ".000000",
        ...(args.thread_ts && { thread_ts: args.thread_ts }),
      },
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// conversations_history
slackMcpServer.registerTool(
  "conversations_history",
  {
    description:
      "Get messages from the channel (or DM) by channel_id, the last row/column in the response is used as 'cursor' parameter for pagination if not empty",
    inputSchema: z.object({
      channel_id: z
        .string()
        .describe(
          "    - `channel_id` (string): ID of the channel in format Cxxxxxxxxxx or its name starting with #... or @... aka #general or @username_dm."
        ),
      cursor: z
        .string()
        .optional()
        .describe(
          "Cursor for pagination. Use the value of the last row and column in the response as next_cursor field returned from the previous request."
        ),
      include_activity_messages: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, the response will include activity messages such as 'channel_join' or 'channel_leave'. Default is boolean false."
        ),
      limit: z
        .string()
        .optional()
        .default("1d")
        .describe(
          "Limit of messages to fetch in format of maximum ranges of time (e.g. 1d - 1 day, 1w - 1 week, 30d - 30 days, 90d - 90 days which is a default limit for free tier history) or number of messages (e.g. 50). Must be empty when 'cursor' is provided."
        ),
    }),
  },
  async (args) => {
    let messages = mockData.slack.messages.filter(
      (m) => m.channel === args.channel_id
    );

    // Parse limit (treat numeric strings as count, otherwise default to 10)
    const numericLimit = parseInt(args.limit || "10");
    const limit = isNaN(numericLimit) ? 10 : numericLimit;

    // Find starting index based on cursor
    let startIndex = 0;
    if (args.cursor) {
      startIndex = messages.findIndex((m) => m.ts === args.cursor);
      if (startIndex === -1) startIndex = 0;
      else startIndex += 1; // Start after the cursor
    }

    // Get paginated slice
    const paginatedMessages = messages.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < messages.length;
    const nextCursor =
      hasMore && paginatedMessages.length > 0
        ? paginatedMessages[paginatedMessages.length - 1].ts || ""
        : "";

    // Convert to CSV format with columns: MsgID, UserID, UserName, RealName, Channel, ThreadTs, Text, Time, Reactions, Cursor
    const csvData = paginatedMessages.map((msg) => ({
      MsgID: msg.ts || "",
      UserID: msg.user || "",
      UserName: "", // Not available in mock data
      RealName: "", // Not available in mock data
      Channel: msg.channel || args.channel_id,
      ThreadTs: msg.thread_ts || "",
      Text: msg.text || "",
      Time: msg.ts || "",
      Reactions: msg.reactions ? JSON.stringify(msg.reactions) : "",
      Cursor: nextCursor,
    }));

    const csv = stringify(csvData, {
      header: true,
      columns: [
        "MsgID",
        "UserID",
        "UserName",
        "RealName",
        "Channel",
        "ThreadTs",
        "Text",
        "Time",
        "Reactions",
        "Cursor",
      ],
    });

    return {
      content: [{ type: "text", text: csv }],
    };
  }
);

// conversations_replies
slackMcpServer.registerTool(
  "conversations_replies",
  {
    description:
      "Get a thread of messages posted to a conversation by channelID and thread_ts, the last row/column in the response is used as 'cursor' parameter for pagination if not empty",
    inputSchema: z.object({
      channel_id: z
        .string()
        .describe(
          "ID of the channel in format Cxxxxxxxxxx or its name starting with #... or @... aka #general or @username_dm."
        ),
      cursor: z
        .string()
        .optional()
        .describe(
          "Cursor for pagination. Use the value of the last row and column in the response as next_cursor field returned from the previous request."
        ),
      include_activity_messages: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, the response will include activity messages such as 'channel_join' or 'channel_leave'. Default is boolean false."
        ),
      limit: z
        .string()
        .optional()
        .default("1d")
        .describe(
          "Limit of messages to fetch in format of maximum ranges of time (e.g. 1d - 1 day, 30d - 30 days, 90d - 90 days which is a default limit for free tier history) or number of messages (e.g. 50). Must be empty when 'cursor' is provided."
        ),
      thread_ts: z
        .string()
        .describe(
          "Unique identifier of either a thread's parent message or a message in the thread. ts must be the timestamp in format 1234567890.123456 of an existing message with 0 or more replies."
        ),
    }),
  },
  async (args) => {
    let replies = mockData.slack.messages.filter(
      (m) => m.channel === args.channel_id && m.thread_ts === args.thread_ts
    );

    // Parse limit (treat numeric strings as count, otherwise default to 10)
    const numericLimit = parseInt(args.limit || "10");
    const limit = isNaN(numericLimit) ? 10 : numericLimit;

    // Find starting index based on cursor
    let startIndex = 0;
    if (args.cursor) {
      startIndex = replies.findIndex((m) => m.ts === args.cursor);
      if (startIndex === -1) startIndex = 0;
      else startIndex += 1; // Start after the cursor
    }

    // Get paginated slice
    const paginatedReplies = replies.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < replies.length;
    const nextCursor =
      hasMore && paginatedReplies.length > 0
        ? paginatedReplies[paginatedReplies.length - 1].ts || ""
        : "";

    // Convert to CSV format with columns: MsgID, UserID, UserName, RealName, Channel, ThreadTs, Text, Time, Reactions, Cursor
    const csvData = paginatedReplies.map((msg) => ({
      MsgID: msg.ts || "",
      UserID: msg.user || "",
      UserName: "", // Not available in mock data
      RealName: "", // Not available in mock data
      Channel: msg.channel || args.channel_id,
      ThreadTs: msg.thread_ts || args.thread_ts,
      Text: msg.text || "",
      Time: msg.ts || "",
      Reactions: msg.reactions ? JSON.stringify(msg.reactions) : "",
      Cursor: nextCursor,
    }));

    const csv = stringify(csvData, {
      header: true,
      columns: [
        "MsgID",
        "UserID",
        "UserName",
        "RealName",
        "Channel",
        "ThreadTs",
        "Text",
        "Time",
        "Reactions",
        "Cursor",
      ],
    });

    return {
      content: [{ type: "text", text: csv }],
    };
  }
);

export { slackMcpServer };
