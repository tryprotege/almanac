import type { GeneratorConfig, RelationshipContext } from "../types.js";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";
import type { Channel } from "@slack/web-api/dist/types/response/ConversationsListResponse.js";
import type { Member } from "@slack/web-api/dist/types/response/UsersListResponse.js";
import { COMPANY_DATA } from "../data/company.js";
import { generateWithLLM } from "../utils/llm.js";
import { selectRandom } from "../utils/random.js";
import { generateRandomDate } from "../utils/dates.js";

/**
 * Generate Slack messages (functional approach - no classes)
 */

// Extended MessageElement with channel tracking
export interface MessageWithChannel extends MessageElement {
  channel?: string;
}

// Channel categories for context-aware message generation
const CHANNEL_CATEGORIES = {
  work: ["engineering", "backend", "game-dev", "product"],
  workAdjacent: ["general", "design", "community"],
  casual: ["random", "watercooler"],
};

export async function generateSlackMessages(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: RelationshipContext
): Promise<MessageWithChannel[]> {
  const messages: MessageWithChannel[] = [];
  const users = generateSlackUsers();
  const channels = generateSlackChannels();

  console.log(`Generating ${count} Slack messages...`);
  if (context) {
    console.log(
      `  With context: ${context.issues?.length || 0} issues, ${
        context.meetings?.length || 0
      } meetings, ${context.pages?.length || 0} pages`
    );
  }

  // Distribute messages across channels
  const messagesPerChannel = Math.ceil(count / channels.length);

  for (const channel of channels) {
    const channelMessageCount = Math.min(
      messagesPerChannel,
      count - messages.length
    );

    // Determine channel category
    let category: "work" | "workAdjacent" | "casual" = "work";
    if (CHANNEL_CATEGORIES.casual.includes(channel.name || "")) {
      category = "casual";
    } else if (CHANNEL_CATEGORIES.workAdjacent.includes(channel.name || "")) {
      category = "workAdjacent";
    }

    for (let i = 0; i < channelMessageCount; i++) {
      const user = selectRandom(users);
      const timestamp = generateRandomDate(dates[0], dates[dates.length - 1]);
      const ts = (timestamp.getTime() / 1000).toString();

      // Build base prompt
      let prompt = `Generate a realistic Slack message for the #${
        channel.name
      } channel at ${COMPANY_DATA.name}.

Channel: #${channel.name}
Purpose: ${
        COMPANY_DATA.slackChannels.find((c) => c.name === channel.name)?.purpose
      }
Category: ${category}
Author: ${user.real_name} (@${user.name})
Company: ${COMPANY_DATA.name} - Gaming & Interactive Entertainment startup
`;

      // Add context-based references if available
      if (context && category === "work") {
        // 50% chance to reference a GitHub issue
        if (
          context.issues &&
          context.issues.length > 0 &&
          Math.random() < 0.5
        ) {
          const issue = selectRandom(context.issues);
          prompt += `\nReference this GitHub issue in your message:
- Issue #${issue.number}: ${issue.title}
- URL: ${issue.html_url}
`;
        }
        // 30% chance to reference a meeting
        else if (
          context.meetings &&
          context.meetings.length > 0 &&
          Math.random() < 0.3
        ) {
          const meeting = selectRandom(context.meetings);
          prompt += `\nReference this recent meeting in your message:
- Meeting: ${meeting.title}
- Date: ${new Date(meeting.recording_start_time).toLocaleDateString()}
`;
        }
        // 20% chance to reference a Notion page
        else if (
          context.pages &&
          context.pages.length > 0 &&
          Math.random() < 0.2
        ) {
          const page = selectRandom(context.pages);
          const pageTitle =
            page.properties?.title?.title?.[0]?.plain_text || "Untitled";
          prompt += `\nReference this Notion document in your message:
- Document: ${pageTitle}
- URL: ${page.url}
`;
        }
      }

      prompt += `\nGenerate a ${
        category === "casual"
          ? "casual, friendly"
          : category === "work"
          ? "professional, technical"
          : "semi-professional"
      } message that fits this context.

Return ONLY the message text (no JSON, no quotes, no markdown formatting - just the plain message text):`;

      try {
        const messageText = await generateWithLLM(prompt, config);

        messages.push({
          type: "message",
          user: user.id,
          text: messageText.trim(),
          ts,
          channel: channel.id, // Add channel ID to track which channel this message belongs to
        } as MessageWithChannel);

        if (messages.length % 50 === 0) {
          console.log(`  Generated ${messages.length}/${count} messages`);
        }
      } catch (error) {
        console.error(
          `Error generating message ${messages.length + 1}:`,
          error
        );
      }

      if (messages.length >= count) break;
    }

    if (messages.length >= count) break;
  }

  return messages;
}

export function generateSlackChannels(): Channel[] {
  return COMPANY_DATA.slackChannels.map((channel, index) => ({
    id: `C${String(index + 1).padStart(9, "0")}`,
    name: channel.name,
    is_channel: true,
    created: Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60, // 1 year ago
    creator: "U000000001", // Sarah Chen
    is_archived: false,
    is_general: channel.name === "general",
  }));
}

export function generateSlackUsers(): Member[] {
  return COMPANY_DATA.teamMembers.map((member, index) => ({
    id: `U${String(index + 1).padStart(9, "0")}`,
    name: member.slackHandle,
    real_name: member.name,
    profile: {
      email: member.email,
      display_name: member.slackHandle,
      real_name: member.name,
    },
  }));
}
