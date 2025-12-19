import { mcpClientManager } from "../../../mcp/client.js";
import { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";
import { Channel } from "@slack/web-api/dist/types/response/ConversationsListResponse.js";
import { Member } from "@slack/web-api/dist/types/response/UsersListResponse.js";
import logger from "../../../utils/logger.js";
import { env } from "../../../env.js";
import pThrottle from "p-throttle";
import { parse } from "csv-parse/sync";

/**
 * Slack MCP Client wrapper for data extraction
 * Uses MCP server from https://github.com/korotovsky/slack-mcp-server
 */
export class SlackMCPClient {
  private serverName = "slack";
  private throttledCallTool: <T>(
    toolName: string,
    args: Record<string, any>
  ) => Promise<T>;

  constructor() {
    // Slack rate limits: Tier 3 = 50+ requests per minute
    // Conservative: 40 requests per 60 seconds
    const throttle = pThrottle({
      limit: 40,
      interval: 60000, // 60 seconds in milliseconds
    });

    this.throttledCallTool = throttle(this.callToolInternal.bind(this));
  }

  /**
   * Parse CSV response using csv-parse library
   */
  private parseCsvResponse(csvText: string): any[] {
    try {
      const records = parse(csvText, {
        columns: true, // Use first row as column names
        skip_empty_lines: true,
        trim: true,
        cast: false, // Automatically cast numbers and booleans
        cast_date: false, // Don't auto-cast dates
        relax_quotes: true, // Be lenient with quotes
        relax_column_count: true, // Allow variable column counts
      });

      return records;
    } catch (err) {
      logger.error({ err }, "Failed to parse CSV response");
      throw new Error(`Invalid CSV format: ${err}`);
    }
  }

  /**
   * Internal method to call MCP tool and parse response
   * This is wrapped by throttledCallTool to enforce rate limiting
   */
  private async callToolInternal<T>(
    toolName: string,
    args: Record<string, any>
  ): Promise<T> {
    try {
      const response = await mcpClientManager.callTool(
        this.serverName,
        toolName,
        args
      );

      // MCP response format: { content: [{ type: 'text', text: '...' }] }
      if (response && response.content && Array.isArray(response.content)) {
        const textContent = response.content.find(
          (c: any) => c.type === "text"
        );
        if (textContent && textContent.text) {
          const text = textContent.text.trim();

          // Try JSON first (for compatibility with mock server)
          if (text.startsWith("{") || text.startsWith("[")) {
            try {
              return JSON.parse(text) as T;
            } catch (jsonErr) {
              logger.debug("Response is not JSON, trying CSV parsing");
            }
          }

          // Try CSV parsing
          try {
            const csvRecords = this.parseCsvResponse(text);

            // Convert CSV array to expected response format
            // The Slack MCP server returns CSV with specific structure
            return this.convertCsvToSlackResponse(csvRecords, toolName) as T;
          } catch (csvErr) {
            logger.error(
              { err: csvErr, toolName },
              "Failed to parse MCP response as CSV"
            );
            throw new Error(
              `Invalid response format (neither JSON nor CSV): ${text.substring(
                0,
                100
              )}...`
            );
          }
        }
      }

      // Fallback: return response as-is if it doesn't match expected format
      return response as T;
    } catch (e) {
      logger.error({ err: e, toolName, args }, "Failed to call MCP tool");
      throw e;
    }
  }

  /**
   * Convert CSV records to Slack API response format
   */
  private convertCsvToSlackResponse(csvRecords: any[], toolName: string): any {
    // Extract cursor from last record if present
    let nextCursor = "";
    const lastRecord = csvRecords[csvRecords.length - 1];

    // Convert based on tool type
    if (toolName === "channels_list") {
      // CSV columns: ID, Name, Topic, Purpose, MemberCount, Cursor
      const channels = csvRecords.map((record) => ({
        id: record.ID || record.id,
        name: record.Name || record.name,
        topic: record.Topic ? { value: record.Topic } : undefined,
        purpose: record.Purpose ? { value: record.Purpose } : undefined,
        num_members: record.MemberCount || record.num_members || 0,
      }));

      // Extract cursor from last record
      if (lastRecord && lastRecord.Cursor) {
        nextCursor = lastRecord.Cursor;
      }

      return {
        ok: true,
        channels,
        response_metadata: {
          next_cursor: nextCursor,
        },
      };
    } else if (
      toolName === "conversations_history" ||
      toolName === "conversations_replies"
    ) {
      // CSV columns: MsgID, UserID, UserName, RealName, Channel, ThreadTs, Text, Time, Reactions, Cursor
      const messages = csvRecords.map((record) => {
        const message: any = {
          type: "message",
          ts: record.MsgID || record.ts,
          user: record.UserID || record.user,
          text: record.Text || record.text || "",
          channel: record.Channel || record.channel,
        };

        // Add thread_ts if present
        if (record.ThreadTs || record.thread_ts) {
          message.thread_ts = record.ThreadTs || record.thread_ts;
        }

        // Parse reactions if present
        if (record.Reactions) {
          try {
            // Reactions might be JSON string or already parsed
            const reactions =
              typeof record.Reactions === "string"
                ? JSON.parse(record.Reactions)
                : record.Reactions;
            if (Array.isArray(reactions) && reactions.length > 0) {
              message.reactions = reactions;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }

        return message;
      });

      // Extract cursor from last record
      let hasMore = false;
      if (lastRecord && lastRecord.Cursor) {
        nextCursor = lastRecord.Cursor;
        hasMore = !!nextCursor;
      }

      return {
        ok: true,
        messages,
        has_more: hasMore,
        response_metadata: {
          next_cursor: nextCursor,
        },
      };
    }

    // Default: return as-is
    return {
      ok: true,
      results: csvRecords,
    };
  }

  /**
   * Call MCP tool with rate limiting (40 requests per 60 seconds) and parse response
   */
  private async callTool<T>(
    toolName: string,
    args: Record<string, any>
  ): Promise<T> {
    return this.throttledCallTool<T>(toolName, args);
  }

  /**
   * Generic pagination handler for cursor-based pagination
   */
  private async fetchAllPages<T>(
    toolName: string,
    params: Record<string, any>,
    extractResults: (response: any) => T[],
    extractCursor: (response: any) => string | undefined
  ): Promise<T[]> {
    const allResults: T[] = [];
    let cursor: string | undefined = undefined;
    const limit = env.SYNC_MAX_RECORDS;

    do {
      // Check if we've reached the limit
      if (limit && allResults.length >= limit) {
        logger.info(
          { limit, fetched: allResults.length },
          "Reached SYNC_MAX_RECORDS, stopping pagination"
        );
        break;
      }

      const requestParams: Record<string, any> = { ...params };
      if (cursor) {
        requestParams.cursor = cursor;
      }

      const response: any = await this.callTool(toolName, requestParams);

      // Validate response structure
      if (!response || typeof response !== "object") {
        logger.warn(
          `MCP tool ${toolName} returned invalid response structure:`,
          response
        );
        break;
      }

      const results = extractResults(response);
      if (Array.isArray(results) && results.length > 0) {
        allResults.push(...results);
      }

      // Apply limit if specified
      if (limit && allResults.length > limit) {
        allResults.splice(limit);
        logger.info(
          { limit, fetched: allResults.length },
          "Trimmed results to SYNC_MAX_RECORDS"
        );
        break;
      }

      // Check if there's a next cursor
      cursor = extractCursor(response);

      // Safety check: if no results and no next cursor, break
      if (results.length === 0 && !cursor) break;
    } while (cursor);

    return allResults;
  }

  /**
   * Get all workspace channels
   */
  async getAllChannels(): Promise<Channel[]> {
    return this.fetchAllPages<Channel>(
      "channels_list",
      {
        channel_types: "public_channel,private_channel",
        limit: 999,
      },
      (response) => response.channels || [],
      (response) => response.response_metadata?.next_cursor
    );
  }

  /**
   * Get all messages from a channel
   */
  async getChannelMessages(
    channelId: string,
    options: {
      /** Unix Timestamp in seconds. Only messages after this Unix timestamp will be included in results. */
      oldest?: string;
      /** Unix Timestamp in seconds. Only messages before this Unix timestamp will be included in results. */
      latest?: string;
      limit?: number;
    } = {}
  ): Promise<MessageElement[]> {
    const messages: MessageElement[] = [];
    let cursor: string | undefined = undefined;
    let total = 0;
    const maxRecords = options.limit || env.SYNC_MAX_RECORDS;

    // Convert oldest/latest to time-based limit format if provided
    let limitParam = "1000"; // Default to large number

    while (maxRecords ? total < maxRecords : true) {
      const params: Record<string, any> = {
        channel_id: channelId,
        limit: limitParam,
        include_activity_messages: false,
      };

      if (cursor) {
        params.cursor = cursor;
      }

      const response: any = await this.callTool(
        "conversations_history",
        params
      );

      if (!response || !response.ok) {
        logger.warn(
          { channelId, response },
          "conversations_history returned error"
        );
        break;
      }

      const newMessages = response.messages || [];

      // Filter by oldest/latest if provided
      let filteredMessages = newMessages;
      if (options.oldest || options.latest) {
        filteredMessages = newMessages.filter((msg: MessageElement) => {
          const msgTs = parseFloat(msg.ts || "0");
          if (options.oldest && msgTs < parseFloat(options.oldest)) {
            return false;
          }
          if (options.latest && msgTs > parseFloat(options.latest)) {
            return false;
          }
          return true;
        });
      }

      total += filteredMessages.length;
      messages.push(...filteredMessages);

      // Check if we've reached the limit
      if (maxRecords && total >= maxRecords) {
        messages.splice(maxRecords);
        break;
      }

      // Check for more messages
      const hasMore = response.has_more || false;
      cursor = response.response_metadata?.next_cursor;

      if (!hasMore || !cursor) {
        break;
      }
    }

    return messages;
  }

  /**
   * Get thread replies
   */
  async getThreadReplies(
    channelId: string,
    threadTs: string,
    options: { limit?: number } = {}
  ): Promise<MessageElement[]> {
    const allReplies: MessageElement[] = [];
    let cursor: string | undefined = undefined;
    const maxRecords = options.limit || 999;

    while (true) {
      const params: Record<string, any> = {
        channel_id: channelId,
        thread_ts: threadTs,
        limit: "1000", // Use large number for limit
        include_activity_messages: false,
      };

      if (cursor) {
        params.cursor = cursor;
      }

      const response: any = await this.callTool(
        "conversations_replies",
        params
      );

      if (!response || !response.ok) {
        logger.warn(
          { channelId, threadTs, response },
          "conversations_replies returned error"
        );
        break;
      }

      const messages = response.messages || [];
      if (messages.length > 0) {
        allReplies.push(...messages);
      }

      // Check if we've reached the limit
      if (allReplies.length >= maxRecords) {
        allReplies.splice(maxRecords);
        break;
      }

      // Check for more messages
      const hasMore = response.has_more || false;
      cursor = response.response_metadata?.next_cursor;

      if (!hasMore || !cursor) {
        break;
      }
    }

    return allReplies;
  }

  /**
   * Get all workspace users
   * Note: This functionality is not available in the current MCP server
   * Keeping this method for compatibility but it will throw an error
   */
  async getAllUsers(): Promise<Member[]> {
    throw new Error(
      "getAllUsers is not supported by the Slack MCP server. " +
        "The users_list tool is not available in https://github.com/korotovsky/slack-mcp-server. " +
        "Consider using the Slack WebClient directly for user operations or requesting this feature."
    );
  }

  /**
   * Get all messages from channel including threads
   */
  async getAllChannelMessagesWithThreads(
    channelId: string,
    options: {
      limit?: number;
      oldest?: string;
      latest?: string;
    } = {}
  ): Promise<MessageElement[]> {
    const { limit = 1000, oldest, latest } = options;

    logger.debug({ msg: `Fetching messages from channel ${channelId}...` });

    // Fetch main channel messages
    const mainMessages = await this.getChannelMessages(channelId, {
      oldest,
      latest,
      limit,
    });

    if (mainMessages.length > limit) {
      mainMessages.splice(limit);
    }

    logger.info({ msg: `Fetched ${mainMessages.length} main messages` });

    const allMessages = [...mainMessages];

    // Fetch thread replies
    const threadParents = mainMessages.filter((m) => (m.reply_count || 0) > 0);
    logger.debug({ msg: `Found ${threadParents.length} threads to fetch` });

    for (let i = 0; i < threadParents.length; i++) {
      const parent = threadParents[i];
      logger.info(
        `Fetching thread ${i + 1}/${threadParents.length} (${
          parent.reply_count
        } replies)...`
      );

      try {
        const replies = await this.getThreadReplies(channelId, parent.ts!);

        // Filter out the parent message and duplicates
        const newReplies = replies.filter(
          (reply) =>
            reply.ts !== parent.ts &&
            !allMessages.find((m) => m.ts === reply.ts)
        );

        allMessages.push(...newReplies);
        logger.debug({ msg: `Added ${newReplies.length} new replies` });
      } catch (error: any) {
        logger.error({ err: error }, `Failed to fetch thread ${parent.ts}`);
      }
    }

    logger.debug({ msg: `Total messages fetched: ${allMessages.length}` });

    // Sort by timestamp
    allMessages.sort((a, b) => parseFloat(a.ts!) - parseFloat(b.ts!));

    return allMessages;
  }
}
