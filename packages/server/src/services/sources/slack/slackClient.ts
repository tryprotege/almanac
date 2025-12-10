import {
  ConversationsHistoryArguments,
  ConversationsRepliesArguments,
  WebClient,
} from "@slack/web-api";
import { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";
import { Channel } from "@slack/web-api/dist/types/response/ConversationsListResponse.js";
import { Member } from "@slack/web-api/dist/types/response/UsersListResponse.js";

import logger from "../../../utils/logger.js";

/**
 * Slack SDK Client wrapper for data extraction
 * Uses @slack/web-api directly
 */
export class SlackClient {
  private client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  /**
   * Get all workspace channels
   */
  async getAllChannels(): Promise<Channel[]> {
    const allChannels: Channel[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const params: any = {
        limit: 200,
        exclude_archived: true,
        types: "public_channel,private_channel",
      };

      if (cursor) {
        params.cursor = cursor;
      }

      const result = await this.client.conversations.list(params);

      if (result.channels && result.channels.length > 0) {
        allChannels.push(...result.channels);
      }

      hasMore = result.response_metadata?.next_cursor ? true : false;
      cursor = result.response_metadata?.next_cursor;

      if (!hasMore) break;
    }

    return allChannels;
  }

  /**
   * Get all messages from a channel
   */
  async getChannelMessages(
    channelId: string,
    options: {
      /** Unix Timestamp in seconds. Only messages after this Unix timestamp will be included in results. */
      oldest?: string;
      /** Unix Timestamp in seconds. Only messages after this Unix timestamp will be included in results. */
      latest?: string;
      limit?: number;
    } = {}
  ): Promise<MessageElement[]> {
    const messages: MessageElement[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;
    let total = 0;

    while (hasMore && (options.limit ? total < options.limit : true)) {
      const params: ConversationsHistoryArguments = {
        channel: channelId,
        limit: options.limit && options.limit < 999 ? options.limit : 999,
        inclusive: true,
      };

      if (cursor) params.cursor = cursor;
      if (options.oldest) params.oldest = options.oldest;
      if (options.latest) params.latest = options.latest;

      const result = await this.client.conversations.history(params);

      total += result.messages?.length || 0;
      if (result.messages && Array.isArray(result.messages)) {
        messages.push(...result.messages);
      }

      hasMore = result.has_more || false;
      cursor = result.response_metadata?.next_cursor;

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
    let hasMore = true;

    while (hasMore) {
      const params: ConversationsRepliesArguments = {
        channel: channelId,
        ts: threadTs,
        limit: options.limit || 999,
      };

      if (cursor) {
        params.cursor = cursor;
      }

      const result = await this.client.conversations.replies(params);

      if (result.messages && result.messages.length > 0) {
        allReplies.push(...result.messages);
      }

      hasMore = result.has_more || false;
      cursor = result.response_metadata?.next_cursor;

      if (!hasMore || !cursor) {
        break;
      }
    }

    return allReplies;
  }

  /**
   * Get all workspace users
   */
  async getAllUsers(): Promise<Member[]> {
    const allUsers: Member[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const params: any = {
        limit: 200,
      };

      if (cursor) {
        params.cursor = cursor;
      }

      const result = await this.client.users.list(params);

      if (result.members && result.members.length > 0) {
        allUsers.push(...result.members);
      }

      hasMore = result.response_metadata?.next_cursor ? true : false;
      cursor = result.response_metadata?.next_cursor;

      if (!hasMore) break;
    }

    return allUsers;
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

    logger.info(`Fetching messages from channel ${channelId}...`);

    // Fetch main channel messages
    const mainMessages = await this.getChannelMessages(channelId, {
      oldest,
      latest,
      limit,
    });

    if (mainMessages.length > limit) {
      mainMessages.splice(limit);
    }

    logger.info(`Fetched ${mainMessages.length} main messages`);

    const allMessages = [...mainMessages];

    // Fetch thread replies
    const threadParents = mainMessages.filter((m) => (m.reply_count || 0) > 0);
    logger.info(`Found ${threadParents.length} threads to fetch`);

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
        logger.info(`  Added ${newReplies.length} new replies`);
      } catch (error: any) {
        logger.error({ err: error }, `Failed to fetch thread ${parent.ts}`);
      }
    }

    logger.info(`Total messages fetched: ${allMessages.length}`);

    // Sort by timestamp
    allMessages.sort((a, b) => parseFloat(a.ts!) - parseFloat(b.ts!));

    return allMessages;
  }
}
