import { MessageElement as SlackMessage } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";
import { Channel as SlackChannel } from "@slack/web-api/dist/types/response/ConversationsListResponse.js";
import { Member as SlackUser } from "@slack/web-api/dist/types/response/UsersListResponse.js";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import pLimit from "p-limit";

import { Record } from "../../../models/record.model.js";
import { EntityRelationship, FetchOptions } from "../../../types/index.js";
import { SlackClient } from "../../sources/slack/slackClient.js";
import { BaseRecordAdapter } from "./base-adapter.js";
import { createLLMClient } from "../../llm/providers.js";
import { env } from "../../../env.js";
import logger from "../../../utils/logger.js";

type SlackRecord = SlackChannel | SlackMessage | SlackUser;

const BATCH_SIZE = 50;
const BATCH_OVERLAP = 10;
const CHANNEL_CONCURRENCY = 5; // Process 5 channels concurrently
const LLM_BATCH_CONCURRENCY = 3; // Process 3 LLM batches concurrently

// Zod schema for message grouping response
const MessageGroupingSchema = z.object({
  groupings: z.array(
    z.object({
      messageIndex: z
        .number()
        .int()
        .nonnegative()
        .describe("The message index from the batch (0-based)"),
      groupId: z
        .number()
        .int()
        .nonnegative()
        .describe(
          "The group identifier - messages with the same groupId are related"
        ),
    })
  ),
});

/**
 * Slack adapter for syncing Slack records
 */
export class SlackAdapter extends BaseRecordAdapter<Record> {
  readonly source = "slack" as const;
  readonly supportedRecordTypes = [
    "message",
    "channel",
    "user",
    "thread",
    "conversation",
  ];
  private client: SlackClient;

  constructor(token: string) {
    super();
    this.client = new SlackClient(token);
  }

  /**
   * Fetch all records from Slack workspace
   */
  async *fetchAll(options?: FetchOptions): AsyncIterable<Record[]> {
    const batchSize = options?.batchSize || 100;

    // Fetch users
    const users = await this.client.getAllUsers();
    const transformedUsers = users.map((user) => this.transformUser(user));
    yield transformedUsers;

    // Fetch channels
    const channels = await this.client.getAllChannels();
    const transformedChannels = channels.map((channel) =>
      this.transformChannel(channel)
    );
    yield transformedChannels;

    // Fetch messages from channels with controlled concurrency
    const limit = pLimit(CHANNEL_CONCURRENCY);
    const channelPromises = channels.map((channel) =>
      limit(async () => {
        logger.debug({
          msg: `Fetching messages from channel: ${channel.name}`,
        });
        try {
          const messages = await this.client.getAllChannelMessagesWithThreads(
            channel.id!,
            {
              limit: env.SYNC_MAX_RECORDS,
              oldest: env.SYNC_CUTOFF_DATE
                ? (new Date(env.SYNC_CUTOFF_DATE).getTime() / 1000).toString()
                : undefined,
            }
          );

          return await this.processChannelMessages(messages, channel);
        } catch (error: any) {
          logger.error(
            { err: error },
            `Failed to fetch messages from channel ${channel.name}`
          );
          return [];
        }
      })
    );

    // Wait for all channels to complete and yield results in batches
    const allChannelRecords = await Promise.all(channelPromises);

    for (const channelRecords of allChannelRecords) {
      for (let i = 0; i < channelRecords.length; i += batchSize) {
        yield channelRecords.slice(i, i + batchSize);
      }
    }
  }

  /**
   * Fetch records modified since timestamp
   */
  async *fetchIncremental(
    since: Date,
    _cursor?: string
  ): AsyncIterable<Record[]> {
    const sinceTs = (since.getTime() / 1000).toString();

    // Fetch channels (no incremental support, fetch all and filter)
    const channels = await this.client.getAllChannels();
    const modifiedChannels = channels.filter(
      (c) => c.updated && new Date(c.updated * 1000) > since
    );

    if (modifiedChannels.length > 0) {
      const transformedChannels = modifiedChannels.map((channel) =>
        this.transformChannel(channel)
      );
      yield transformedChannels;
    }

    // Fetch messages from channels with controlled concurrency
    const limit = pLimit(CHANNEL_CONCURRENCY);
    const channelPromises = channels.map((channel) =>
      limit(async () => {
        try {
          const messages = await this.client.getAllChannelMessagesWithThreads(
            channel.id!,
            {
              oldest: sinceTs,
              limit: env.SYNC_MAX_RECORDS,
            }
          );

          if (messages.length > 0) {
            return messages.map((msg) => this.transformMessage(msg));
          }
          return [];
        } catch (error: any) {
          logger.error(
            { err: error },
            `Failed to fetch incremental messages from channel ${channel.name}`
          );
          return [];
        }
      })
    );

    // Wait for all channels and yield results
    const allResults = await Promise.all(channelPromises);
    for (const messages of allResults) {
      if (messages.length > 0) {
        yield messages;
      }
    }
  }

  /**
   * Transform Slack record to unified format
   */
  async transform(sourceRecord: Record): Promise<Record> {
    // Transform is now done in fetchAll/fetchIncremental
    // This method just passes through the already-transformed record
    return sourceRecord;
  }

  /**
   * Process all messages from a channel and return records (messages, threads, conversations)
   */
  private async processChannelMessages(
    messages: SlackMessage[],
    channel: SlackChannel
  ): Promise<Record[]> {
    const records: Record[] = [];

    // Group messages by thread
    const { threadedMessages, standaloneMessages } =
      this.groupByThread(messages);

    // Process threaded messages
    for (const [threadTs, threadMsgs] of Object.entries(threadedMessages)) {
      const sortedMessages = threadMsgs.sort(
        (a, b) => parseFloat(a.ts!) - parseFloat(b.ts!)
      );
      const parent =
        sortedMessages.find((m) => m.ts === threadTs) || sortedMessages[0];

      // Create thread record
      const threadRecord = this.transformThread(
        sortedMessages,
        parent,
        channel
      );
      records.push(threadRecord);

      // Create individual message records with parentId set to thread
      for (const msg of sortedMessages) {
        const msgRecord = this.transformMessage(msg, threadRecord._id);
        records.push(msgRecord);
      }
    }

    // Process standalone messages with LLM grouping
    if (standaloneMessages.length > 0) {
      const groupedRecords = await this.processStandaloneMessages(
        standaloneMessages,
        channel
      );
      records.push(...groupedRecords);
    }

    return records;
  }

  /**
   * Group messages by thread
   */
  private groupByThread(messages: SlackMessage[]): {
    threadedMessages: { [key: string]: SlackMessage[] };
    standaloneMessages: SlackMessage[];
  } {
    const threadedMessages: { [key: string]: SlackMessage[] } = {};
    const standaloneMessages: SlackMessage[] = [];

    for (const msg of messages) {
      if (msg.thread_ts) {
        if (!threadedMessages[msg.thread_ts]) {
          threadedMessages[msg.thread_ts] = [];
        }
        threadedMessages[msg.thread_ts].push(msg);
      } else if (!msg.reply_count) {
        standaloneMessages.push(msg);
      }
    }

    return { threadedMessages, standaloneMessages };
  }

  /**
   * Process standalone messages with LLM-based grouping
   */
  private async processStandaloneMessages(
    messages: SlackMessage[],
    channel: SlackChannel
  ): Promise<Record[]> {
    const records: Record[] = [];
    const sortedMessages = messages.sort(
      (a, b) => parseFloat(a.ts!) - parseFloat(b.ts!)
    );

    // Group messages using LLM
    const messageGroups = await this.groupMessagesWithLLM(sortedMessages);

    // Organize into groups
    const groupMap = new Map<number, number[]>();
    messageGroups.forEach(({ messageIndex, groupId }) => {
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, []);
      }
      groupMap.get(groupId)!.push(messageIndex);
    });

    // Process each group
    for (const [groupId, messageIndices] of groupMap.entries()) {
      if (messageIndices.length === 1) {
        // Standalone message - no conversation needed
        const msg = sortedMessages[messageIndices[0]];
        records.push(this.transformMessage(msg));
      } else {
        // Create conversation record
        const sortedIndices = messageIndices.sort((a, b) => a - b);
        const groupMessages = sortedIndices.map((i) => sortedMessages[i]);

        const conversationRecord = this.transformConversation(
          groupMessages,
          channel,
          groupId
        );
        records.push(conversationRecord);

        // Create individual message records with parentId set to conversation
        for (const msg of groupMessages) {
          const msgRecord = this.transformMessage(msg, conversationRecord._id);
          records.push(msgRecord);
        }
      }
    }

    return records;
  }

  /**
   * Group messages using LLM with parallel batch processing
   */
  private async groupMessagesWithLLM(
    messages: SlackMessage[]
  ): Promise<Array<{ messageIndex: number; groupId: number }>> {
    logger.info({ msg: `Grouping ${messages.length} messages with LLM...` });

    // Prepare all batches
    const batches: Array<{
      batch: SlackMessage[];
      batchStart: number;
      batchEnd: number;
    }> = [];

    for (
      let batchStart = 0;
      batchStart < messages.length;
      batchStart += BATCH_SIZE - BATCH_OVERLAP
    ) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, messages.length);
      const batch = messages.slice(batchStart, batchEnd);

      if (batch.length === 0) break;

      batches.push({ batch, batchStart, batchEnd });

      if (batchEnd >= messages.length) break;
    }

    // Process batches in parallel with concurrency control
    const limit = pLimit(LLM_BATCH_CONCURRENCY);
    const allGroupings = await Promise.all(
      batches.map(({ batch, batchStart, batchEnd }) =>
        limit(async () => {
          try {
            const batchGrouping = await this.groupMessageBatch(
              batch,
              batchStart
            );
            return {
              startIndex: batchStart,
              endIndex: batchEnd,
              grouping: batchGrouping,
            };
          } catch (error) {
            logger.error(
              {
                err: error instanceof Error ? error : new Error(String(error)),
              },
              `Batch grouping failed for batch starting at ${batchStart}`
            );
            return {
              startIndex: batchStart,
              endIndex: batchEnd,
              grouping: batch.map((_, i) => ({
                messageIndex: batchStart + i,
                groupId: batchStart + i,
              })),
            };
          }
        })
      )
    );

    return this.consolidateBatchGroupings(allGroupings, messages.length);
  }

  /**
   * Group a batch of messages using LLM with structured output
   */
  private async groupMessageBatch(
    batch: SlackMessage[],
    batchStartIndex: number
  ): Promise<Array<{ messageIndex: number; groupId: number }>> {
    const messagesList = batch
      .map((msg, i) => {
        const timestamp = new Date(
          parseFloat(msg.ts!) * 1000
        ).toLocaleTimeString();
        return `[${i}] ${timestamp} | ${msg.user}: ${msg.text}`;
      })
      .join("\n");

    const systemPrompt = `You are an expert at analyzing Slack message patterns and grouping related messages into conversations.

Your task is to identify which messages belong together based on:
1. **Topic continuity**: Messages discussing the same subject matter
2. **Temporal proximity**: Messages sent close together in time
3. **User interaction patterns**: Back-and-forth exchanges between users
4. **Contextual references**: Messages that reference or build upon each other

Guidelines:
- Each message must belong to exactly ONE group
- Messages that are clearly related should share the same groupId
- Standalone messages that don't relate to others should have their own unique groupId
- Group IDs should start from 0 and increment sequentially
- Consider both explicit (mentions, replies) and implicit (topic, timing) relationships`;

    const userPrompt = `Analyze these Slack messages and group them into conversations:

${messagesList}

Group related messages together. Each message can only belong to ONE group.`;

    const llm = createLLMClient();
    const response = await llm.chat.completions.create({
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: env.LLM_CHAT_MODEL,
      response_format: zodResponseFormat(
        MessageGroupingSchema,
        "message_grouping"
      ),
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response content from LLM");
    }

    const parsed = MessageGroupingSchema.parse(JSON.parse(content));

    return parsed.groupings.map((item) => ({
      messageIndex: batchStartIndex + item.messageIndex,
      groupId: item.groupId,
    }));
  }

  /**
   * Consolidate batch groupings
   */
  private consolidateBatchGroupings(
    allGroupings: Array<{
      startIndex: number;
      endIndex: number;
      grouping: Array<{ messageIndex: number; groupId: number }>;
    }>,
    totalMessages: number
  ): Array<{ messageIndex: number; groupId: number }> {
    if (allGroupings.length === 0) {
      return Array.from({ length: totalMessages }, (_, i) => ({
        messageIndex: i,
        groupId: i,
      }));
    }

    if (allGroupings.length === 1) {
      return allGroupings[0].grouping;
    }

    const messageToGroup = new Map<number, number>();
    let nextGlobalGroupId = 0;

    for (const { grouping } of allGroupings) {
      const localGroupMap = new Map<number, number>();

      for (const { messageIndex, groupId } of grouping) {
        if (messageToGroup.has(messageIndex)) {
          const existingGroupId = messageToGroup.get(messageIndex)!;
          if (!localGroupMap.has(groupId)) {
            localGroupMap.set(groupId, existingGroupId);
          }
        } else {
          let globalGroupId: number;
          if (localGroupMap.has(groupId)) {
            globalGroupId = localGroupMap.get(groupId)!;
          } else {
            globalGroupId = nextGlobalGroupId++;
            localGroupMap.set(groupId, globalGroupId);
          }
          messageToGroup.set(messageIndex, globalGroupId);
        }
      }
    }

    const result: Array<{ messageIndex: number; groupId: number }> = [];
    for (let i = 0; i < totalMessages; i++) {
      result.push({
        messageIndex: i,
        groupId: messageToGroup.get(i) ?? i,
      });
    }

    return result;
  }

  /**
   * Transform Slack user to unified Record format
   */
  private transformUser(user: SlackUser): Record {
    const sourceId = user.id!;
    const _id = this.generateRecordId("user", sourceId);

    const title = user.real_name || user.name || "Unknown User";
    const parts: string[] = [];
    if (user.real_name) {
      parts.push(user.real_name);
    }
    if (user.profile?.title) {
      parts.push(user.profile.title);
    }
    if (user.profile?.status_text) {
      parts.push(user.profile.status_text);
    }
    const content = parts.join(" - ");
    const primaryDate = user.updated ? new Date(user.updated * 1000) : null;

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType: "user",
      title,
      content: content || title,
      people: [],
      primaryDate,
      tags: [],
      rawData: user,
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: primaryDate || new Date(),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  /**
   * Transform Slack channel to unified Record format
   */
  private transformChannel(channel: SlackChannel): Record {
    const sourceId = channel.id!;
    const _id = this.generateRecordId("channel", sourceId);

    const title = `#${channel.name}`;
    const parts: string[] = [];
    if (channel.topic?.value) {
      parts.push(`Topic: ${channel.topic.value}`);
    }
    if (channel.purpose?.value) {
      parts.push(`Purpose: ${channel.purpose.value}`);
    }
    const content = parts.join("\n");
    const primaryDate = channel.updated
      ? new Date(channel.updated * 1000)
      : null;

    const people: string[] = [];
    if (channel.creator) {
      people.push(channel.creator);
    }

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType: "channel",
      title,
      content,
      people,
      primaryDate,
      tags: [],
      rawData: channel,
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: primaryDate || new Date(),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  /**
   * Transform Slack thread to unified Record format
   */
  private transformThread(
    messages: SlackMessage[],
    parent: SlackMessage,
    channel: SlackChannel
  ): Record {
    const sourceId = parent.ts!;
    const _id = this.generateRecordId("thread", sourceId);

    // Build conversation text
    const lines: string[] = [
      `[Channel: #${channel.name}]`,
      `[Thread started by ${parent.user}]`,
      `Original: ${parent.text}`,
    ];

    const replies = messages.filter((m) => m.ts !== parent.ts);
    if (replies.length > 0) {
      lines.push(`\n[${replies.length} replies]`);
      for (const reply of replies) {
        lines.push(`${reply.user}: ${reply.text}`);
      }
    }

    const content = lines.join("\n");
    const title = parent.text?.substring(0, 100) || "Untitled Thread";
    const primaryDate = new Date(parseFloat(parent.ts!) * 1000);

    // Collect all participants
    const people = [
      ...new Set(messages.map((m) => m.user).filter(Boolean)),
    ] as string[];

    // Store message IDs in rawData
    const messageIds = messages.map((m) => m.ts).sort();

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType: "thread",
      title,
      content,
      people,
      primaryDate,
      tags: [],
      rawData: { messageIds, threadTs: parent.ts, channel: channel.id },
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: primaryDate,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  /**
   * Transform Slack conversation (grouped messages) to unified Record format
   */
  private transformConversation(
    messages: SlackMessage[],
    channel: SlackChannel,
    groupId: number
  ): Record {
    const firstMessage = messages[0];
    const sourceId = `conv-${firstMessage.ts}`;
    const _id = this.generateRecordId("conversation", sourceId);

    // Build conversation text
    const conversationText = messages
      .map((msg) => {
        const time = new Date(parseFloat(msg.ts!) * 1000).toLocaleTimeString();
        return `[${time}] ${msg.user}: ${msg.text}`;
      })
      .join("\n");

    const content = `[Channel: #${channel.name}]\n${conversationText}`;
    const title = `Conversation: ${
      firstMessage.text?.substring(0, 60) || "Untitled"
    }`;
    const primaryDate = new Date(parseFloat(firstMessage.ts!) * 1000);

    // Collect all participants
    const people = [
      ...new Set(messages.map((m) => m.user).filter(Boolean)),
    ] as string[];

    // Store message IDs in ascending order
    const messageIds = messages.map((m) => m.ts).sort();

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType: "conversation",
      title,
      content,
      people,
      primaryDate,
      tags: [],
      rawData: { messageIds, groupId, channel: channel.id },
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: primaryDate,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  /**
   * Transform Slack message to unified Record format
   */
  private transformMessage(message: SlackMessage, parentId?: string): Record {
    const sourceId = message.ts!;
    const recordType =
      message.reply_count && message.reply_count > 0 ? "thread" : "message";
    const _id = this.generateRecordId(recordType, sourceId);

    const title = message.text?.substring(0, 100) || "Untitled Message";
    const content = message.text || "";
    const primaryDate = message.ts
      ? new Date(parseFloat(message.ts) * 1000)
      : null;

    const people: string[] = [];
    if (message.user) {
      people.push(message.user);
    }

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType,
      title,
      content,
      people,
      primaryDate,
      tags: [],
      rawData: message,
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: primaryDate || new Date(),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      parentId,
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  /**
   * Extract relationships from Slack record
   */
  async extractRelationships(
    sourceRecord: Record
  ): Promise<EntityRelationship[]> {
    // Extract from rawData which contains the original Slack record
    const slackRecord = sourceRecord.rawData as SlackRecord;
    const relationships: EntityRelationship[] = [];
    const recordType = sourceRecord.recordType;

    // Message relationships
    if (recordType === "message" || recordType === "thread") {
      const message = slackRecord as SlackMessage;

      // Message -> Channel relationship
      if (message.ts && (message as any).channel) {
        relationships.push({
          sourceId: this.generateRecordId(recordType, message.ts),
          targetId: this.generateRecordId("channel", (message as any).channel),
          type: "IN_CHANNEL",
          confidence: 1.0,
        });
      }

      // Message -> User relationship
      if (message.user && message.ts) {
        relationships.push({
          sourceId: this.generateRecordId(recordType, message.ts),
          targetId: this.generateRecordId("user", message.user),
          type: "POSTED_BY",
          confidence: 1.0,
        });
      }

      // Thread reply relationship
      if (message.thread_ts && message.ts && message.thread_ts !== message.ts) {
        relationships.push({
          sourceId: this.generateRecordId("message", message.ts),
          targetId: this.generateRecordId("message", message.thread_ts),
          type: "REPLY_TO",
          confidence: 1.0,
        });
      }

      // User reactions
      if (message.reactions && message.ts) {
        for (const reaction of message.reactions) {
          if (reaction.users) {
            for (const userId of reaction.users) {
              relationships.push({
                sourceId: this.generateRecordId(recordType, message.ts),
                targetId: this.generateRecordId("user", userId),
                type: "REACTED_BY",
                confidence: 0.8,
              });
            }
          }
        }
      }
    }

    // Thread relationships (conversation context)
    if (recordType === "thread") {
      const threadData = slackRecord as any;

      // Thread -> Channel relationship
      if (threadData.channel && threadData.threadTs) {
        relationships.push({
          sourceId: this.generateRecordId("thread", threadData.threadTs),
          targetId: this.generateRecordId("channel", threadData.channel),
          type: "IN_CHANNEL",
          confidence: 1.0,
        });
      }

      // Thread -> Message relationships (contains messages)
      if (threadData.messageIds && Array.isArray(threadData.messageIds)) {
        for (const messageTs of threadData.messageIds) {
          relationships.push({
            sourceId: this.generateRecordId("thread", threadData.threadTs),
            targetId: this.generateRecordId("message", messageTs),
            type: "CONTAINS_MESSAGE",
            confidence: 1.0,
          });
        }
      }

      // Thread -> User relationships (participants)
      if (sourceRecord.people && Array.isArray(sourceRecord.people)) {
        for (const userId of sourceRecord.people) {
          relationships.push({
            sourceId: this.generateRecordId("thread", threadData.threadTs),
            targetId: this.generateRecordId("user", userId),
            type: "PARTICIPATED_BY",
            confidence: 1.0,
          });
        }
      }
    }

    // Conversation relationships (grouped messages context)
    if (recordType === "conversation") {
      const conversationData = slackRecord as any;

      // Conversation -> Channel relationship
      if (conversationData.channel) {
        relationships.push({
          sourceId: sourceRecord._id,
          targetId: this.generateRecordId("channel", conversationData.channel),
          type: "IN_CHANNEL",
          confidence: 1.0,
        });
      }

      // Conversation -> Message relationships (contains messages)
      if (
        conversationData.messageIds &&
        Array.isArray(conversationData.messageIds)
      ) {
        for (const messageTs of conversationData.messageIds) {
          relationships.push({
            sourceId: sourceRecord._id,
            targetId: this.generateRecordId("message", messageTs),
            type: "CONTAINS_MESSAGE",
            confidence: 1.0,
          });
        }
      }

      // Conversation -> User relationships (participants)
      if (sourceRecord.people && Array.isArray(sourceRecord.people)) {
        for (const userId of sourceRecord.people) {
          relationships.push({
            sourceId: sourceRecord._id,
            targetId: this.generateRecordId("user", userId),
            type: "PARTICIPATED_BY",
            confidence: 1.0,
          });
        }
      }
    }

    // Channel relationships
    if (recordType === "channel") {
      const channel = slackRecord as SlackChannel;

      // Channel -> Creator relationship
      if (channel.creator && channel.id) {
        relationships.push({
          sourceId: this.generateRecordId("channel", channel.id),
          targetId: this.generateRecordId("user", channel.creator),
          type: "CREATED_BY",
          confidence: 1.0,
        });
      }
    }

    return relationships;
  }
}
