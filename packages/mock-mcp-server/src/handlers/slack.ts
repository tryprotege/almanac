import type { MockData, MessageWithChannel } from "../types.js";
import type { Channel } from "@slack/web-api/dist/types/response/ConversationsListResponse.js";
import type { Member } from "@slack/web-api/dist/types/response/UsersListResponse.js";

/**
 * Get all channels, optionally filtered by type
 */
export function getChannels(data: MockData, types?: string): Channel[] {
  if (!data.slack) return [];

  let channels = data.slack.channels;

  if (types) {
    const typeList = types.split(",").map((t) => t.trim());
    channels = channels.filter((c) => {
      if (c.is_private && typeList.includes("private_channel")) return true;
      if (!c.is_private && typeList.includes("public_channel")) return true;
      return false;
    });
  }

  return channels;
}

/**
 * Get all users
 */
export function getUsers(data: MockData): Member[] {
  return data.slack?.users || [];
}

/**
 * Get user by ID
 */
export function getUserById(
  data: MockData,
  userId: string
): Member | undefined {
  return data.slack?.users.find((u) => u.id === userId);
}

/**
 * Get channel by ID
 */
export function getChannelById(
  data: MockData,
  channelId: string
): Channel | undefined {
  return data.slack?.channels.find((c) => c.id === channelId);
}

/**
 * Get messages from a specific channel
 */
export function getChannelMessages(
  data: MockData,
  channelId: string,
  options?: {
    limit?: number;
    oldest?: string;
    latest?: string;
  }
): MessageWithChannel[] {
  if (!data.slack) return [];

  let messages = data.slack.messages.filter((m) => m.channel === channelId);

  // Apply timestamp filters
  if (options?.oldest) {
    const oldestTs = parseFloat(options.oldest);
    messages = messages.filter((m) => parseFloat(m.ts!) >= oldestTs);
  }

  if (options?.latest) {
    const latestTs = parseFloat(options.latest);
    messages = messages.filter((m) => parseFloat(m.ts!) <= latestTs);
  }

  // Sort by timestamp (ascending)
  messages.sort((a, b) => parseFloat(a.ts!) - parseFloat(b.ts!));

  // Apply limit
  if (options?.limit && options.limit > 0) {
    messages = messages.slice(0, options.limit);
  }

  return messages;
}

/**
 * Search messages by text query
 */
export function searchMessages(
  data: MockData,
  query: string,
  options?: {
    channel_id?: string;
    limit?: number;
  }
): MessageWithChannel[] {
  if (!data.slack) return [];

  const queryLower = query.toLowerCase();

  let messages = data.slack.messages.filter((m) => {
    const text = m.text?.toLowerCase() || "";
    return text.includes(queryLower);
  });

  // Filter by channel if specified
  if (options?.channel_id) {
    messages = messages.filter((m) => m.channel === options.channel_id);
  }

  // Sort by timestamp (descending - most recent first)
  messages.sort((a, b) => parseFloat(b.ts!) - parseFloat(a.ts!));

  // Apply limit
  if (options?.limit && options.limit > 0) {
    messages = messages.slice(0, options.limit);
  }

  return messages;
}
