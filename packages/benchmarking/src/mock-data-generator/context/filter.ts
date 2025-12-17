import type { AllGeneratedData, RelationshipContext } from "../types.js";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";

/**
 * Filter context by category to prevent inappropriate cross-references
 */

// Helper to flatten Map of messages to array
function flattenMessages(
  messagesMap: Map<string, MessageElement[]>
): MessageElement[] {
  const allMessages: MessageElement[] = [];
  for (const messages of messagesMap.values()) {
    allMessages.push(...messages);
  }
  return allMessages;
}

export function buildWorkContext(
  foundation: AllGeneratedData
): Partial<RelationshipContext> {
  const allMessages = flattenMessages(foundation.slack.messages);

  // Filter work meetings
  const workMeetings = foundation.fathom.meetings.filter(
    (m) =>
      m.title.toLowerCase().includes("standup") ||
      m.title.toLowerCase().includes("planning") ||
      m.title.toLowerCase().includes("review") ||
      m.title.toLowerCase().includes("sprint")
  );

  // Get transcripts and summaries for work meetings
  const workMeetingIds = new Set(workMeetings.map((m) => m.recording_id));
  const workTranscripts = foundation.fathom.transcripts.filter((t) =>
    workMeetingIds.has(t.recording_id)
  );
  const workSummaries = foundation.fathom.summaries.filter((s) =>
    workMeetingIds.has(s.recording_id)
  );

  // Filter work pages and get their blocks
  const workPages = foundation.notion.pages.filter((p) =>
    p.id.includes("work")
  );
  const workPageIds = new Set(workPages.map((p) => p.id));
  const allBlocks: any[] = [];
  for (const [pageId, blocks] of foundation.notion.blocks.entries()) {
    if (workPageIds.has(pageId)) {
      allBlocks.push(...blocks);
    }
  }

  return {
    issues: foundation.github.issues,
    pullRequests: foundation.github.pullRequests,
    repositories: foundation.github.repositories,
    meetings: workMeetings,
    transcripts: workTranscripts,
    summaries: workSummaries,
    pages: workPages,
    blocks: allBlocks,
    messages: allMessages,
    channels: foundation.slack.channels,
    users: foundation.slack.users,
    teams: foundation.fathom.teams,
    teamMembers: foundation.fathom.teamMembers,
    databases: foundation.notion.databases,
  };
}

export function buildCasualContext(
  foundation: AllGeneratedData
): Partial<RelationshipContext> {
  const allMessages = flattenMessages(foundation.slack.messages);

  // Filter casual meetings
  const casualMeetings = foundation.fathom.meetings.filter(
    (m) =>
      m.title.toLowerCase().includes("coffee") ||
      m.title.toLowerCase().includes("chat") ||
      m.title.toLowerCase().includes("social")
  );

  // Get transcripts and summaries for casual meetings
  const casualMeetingIds = new Set(casualMeetings.map((m) => m.recording_id));
  const casualTranscripts = foundation.fathom.transcripts.filter((t) =>
    casualMeetingIds.has(t.recording_id)
  );
  const casualSummaries = foundation.fathom.summaries.filter((s) =>
    casualMeetingIds.has(s.recording_id)
  );

  // Filter personal pages and get their blocks
  const personalPages = foundation.notion.pages.filter((p) =>
    p.id.includes("personal")
  );
  const personalPageIds = new Set(personalPages.map((p) => p.id));
  const allBlocks: any[] = [];
  for (const [pageId, blocks] of foundation.notion.blocks.entries()) {
    if (personalPageIds.has(pageId)) {
      allBlocks.push(...blocks);
    }
  }

  return {
    meetings: casualMeetings,
    transcripts: casualTranscripts,
    summaries: casualSummaries,
    pages: personalPages,
    blocks: allBlocks,
    messages: allMessages,
    channels: foundation.slack.channels,
    users: foundation.slack.users,
  };
}
