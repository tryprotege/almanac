import type { GeneratorConfig, RelationshipContext } from "../types.js";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";
import type { Channel } from "@slack/web-api/dist/types/response/ConversationsListResponse.js";
import type { Member } from "@slack/web-api/dist/types/response/UsersListResponse.js";
import { COMPANY_DATA } from "../data/company.js";
import { generateWithLLM } from "../utils/llm.js";
import {
  selectRandom,
  selectRandomMultiple,
  weightedRandom,
} from "../utils/random.js";
import { generateRandomDate } from "../utils/dates.js";

/**
 * Generate Slack messages with realistic conversation threads
 */

// Extended MessageElement with channel tracking
export interface MessageWithChannel extends MessageElement {
  channel?: string;
}

// Channel categories for context-aware message generation
const CHANNEL_CATEGORIES = {
  work: ["engineering", "backend", "game-dev"],
  workAdjacent: ["general", "product", "design", "community"],
  casual: ["random", "watercooler"],
};

// Thread length distribution (weighted random)
const THREAD_LENGTHS = {
  standalone: { min: 0, max: 0, weight: 25 }, // 25% standalone messages
  short: { min: 1, max: 3, weight: 30 }, // 30% short threads
  medium: { min: 4, max: 7, weight: 25 }, // 25% medium threads
  long: { min: 8, max: 12, weight: 15 }, // 15% long threads
  veryLong: { min: 13, max: 20, weight: 5 }, // 5% very long threads
};

// Message length distribution (weighted random)
const MESSAGE_LENGTHS = {
  veryShort: { minWords: 1, maxWords: 3, weight: 35 }, // "Thanks!", "Got it", "👍"
  short: { minWords: 4, maxWords: 10, weight: 30 }, // "I'll look into this"
  medium: { minWords: 11, maxWords: 25, weight: 25 }, // Brief explanations
  long: { minWords: 26, maxWords: 50, weight: 10 }, // Detailed responses
};

// Common short responses (used for very short messages)
const SHORT_RESPONSES = {
  acknowledgment: [
    "Thanks!",
    "Got it",
    "👍",
    "Will do",
    "On it",
    "Looking now",
    "Perfect",
    "Sounds good",
    "Thank you!",
    "Awesome",
  ],
  agreement: [
    "Makes sense",
    "Good point",
    "Agreed",
    "Absolutely",
    "Exactly",
    "Same here",
    "For sure",
    "💯",
    "Yep",
    "True",
  ],
  quick_update: [
    "Just merged it",
    "Done",
    "Fixed",
    "Pushed the changes",
    "Updated",
    "All set",
    "Completed",
    "Deployed",
  ],
  questions: [
    "Quick question:",
    "Anyone available?",
    "Need help with",
    "Thoughts?",
    "What do you think?",
    "Can someone review?",
  ],
  casual: [
    "Nice!",
    "Love it",
    "That's awesome",
    "Congrats!",
    "🎉",
    "So cool",
    "Amazing",
    "Haha nice",
    "😂",
    "Same",
  ],
};

// Casual conversation topics
const CASUAL_TOPICS = {
  food: [
    "tried this new restaurant",
    "made homemade pizza",
    "discovered this great coffee shop",
    "ordered from this place",
    "cooking experiment",
  ],
  movies: [
    "watched this movie",
    "started this TV series",
    "finished binging",
    "saw this at the theater",
    "rewatching",
  ],
  weekend: [
    "went hiking",
    "visited the farmers market",
    "had a great brunch",
    "explored a new neighborhood",
    "day trip to",
  ],
  life: [
    "adopted a dog",
    "got a new apartment",
    "started learning",
    "finished my project",
    "celebrating",
  ],
  gaming: [
    "playing Baldur's Gate 3",
    "finally beat Elden Ring",
    "started Tears of the Kingdom",
    "replaying Mass Effect",
    "trying out Hades",
  ],
  books: [
    "reading Project Hail Mary",
    "finished Tomorrow, and Tomorrow, and Tomorrow",
    "started The Three-Body Problem",
    "audiobook recommendation",
    "book club pick",
  ],
  music: [
    "new album from",
    "went to this concert",
    "discovered this artist",
    "playlist recommendation",
    "vinyl shopping",
  ],
};

interface ConversationStarter {
  message: MessageWithChannel;
  topic: string;
  category: "work" | "workAdjacent" | "casual";
  threadLength: number;
  participants: string[]; // User IDs who participated
  keywords: string[]; // Key topics for cross-referencing
}

// User personality traits for more realistic conversations
interface UserPersonality {
  userId: string;
  name: string;
  chattiness: number; // 0-1, likelihood to participate in threads
  technicalDepth: number; // 0-1, how technical their responses are
  emojiUsage: number; // 0-1, how often they use emojis
  responseStyle: "detailed" | "brief" | "balanced";
  favoriteEmojis: string[]; // Personal emoji preferences
}

// Conversation mood types
type ConversationMood =
  | "urgent"
  | "casual"
  | "celebratory"
  | "problem-solving"
  | "brainstorming";

// Time of day context
interface TimeOfDayContext {
  hour: number;
  period:
    | "early-morning"
    | "morning"
    | "midday"
    | "afternoon"
    | "evening"
    | "late-night";
  isBusinessHours: boolean;
}

// Helper function to determine message length based on position
function determineMessageLength(
  position: "first" | "middle" | "last",
  category: "work" | "workAdjacent" | "casual"
): keyof typeof MESSAGE_LENGTHS {
  // Adjust weights based on position
  if (position === "first") {
    // First replies are more likely to be short
    return weightedRandom(
      Object.keys(MESSAGE_LENGTHS) as Array<keyof typeof MESSAGE_LENGTHS>,
      [50, 30, 15, 5] // Very short: 50%, short: 30%, medium: 15%, long: 5%
    );
  } else if (position === "last") {
    // Last replies are usually short closures
    return weightedRandom(
      Object.keys(MESSAGE_LENGTHS) as Array<keyof typeof MESSAGE_LENGTHS>,
      [60, 30, 8, 2] // Very short: 60%, short: 30%, medium: 8%, long: 2%
    );
  } else {
    // Middle replies use standard distribution
    return weightedRandom(
      Object.keys(MESSAGE_LENGTHS) as Array<keyof typeof MESSAGE_LENGTHS>,
      Object.values(MESSAGE_LENGTHS).map((l) => l.weight)
    );
  }
}

// Helper function to select a short response
function selectShortResponse(
  responseType:
    | "acknowledgment"
    | "agreement"
    | "quick_update"
    | "questions"
    | "casual"
): string {
  return selectRandom(SHORT_RESPONSES[responseType]);
}

// Helper function to determine if we should use a pre-defined short response
function shouldUseShortResponse(
  length: keyof typeof MESSAGE_LENGTHS,
  position: "first" | "middle" | "last"
): boolean {
  if (length !== "veryShort") return false;

  // Higher chance for first and last replies
  if (position === "first") return Math.random() < 0.6; // 60% chance
  if (position === "last") return Math.random() < 0.7; // 70% chance
  return Math.random() < 0.4; // 40% chance for middle
}

// Generate user personalities based on team roles
function generateUserPersonalities(
  users: Member[]
): Map<string, UserPersonality> {
  const personalities = new Map<string, UserPersonality>();

  users.forEach((user) => {
    const name = user.real_name || user.name || "";
    const role = name.toLowerCase();

    // Assign personality traits based on role patterns
    let chattiness = 0.5;
    let technicalDepth = 0.5;
    let emojiUsage = 0.3;
    let responseStyle: "detailed" | "brief" | "balanced" = "balanced";
    let favoriteEmojis = ["👍", "✅", "🎉"];

    // Leadership (CEO, CTO) - less chatty, more strategic
    if (
      role.includes("ceo") ||
      role.includes("founder") ||
      role.includes("chen")
    ) {
      chattiness = 0.3;
      technicalDepth = 0.4;
      emojiUsage = 0.2;
      responseStyle = "brief";
      favoriteEmojis = ["👍", "✅", "🎯"];
    } else if (role.includes("cto") || role.includes("rodriguez")) {
      chattiness = 0.4;
      technicalDepth = 0.9;
      emojiUsage = 0.3;
      responseStyle = "detailed";
      favoriteEmojis = ["🔧", "💡", "🚀"];
    }
    // Engineers - technical, varied emoji use
    else if (role.includes("engineer") || role.includes("developer")) {
      chattiness = 0.6;
      technicalDepth = 0.8;
      emojiUsage = 0.4;
      responseStyle = Math.random() < 0.5 ? "detailed" : "balanced";
      favoriteEmojis = ["🐛", "🔧", "💻", "🚀", "✅"];
    }
    // Product/Design - more visual, emoji-heavy
    else if (role.includes("product") || role.includes("design")) {
      chattiness = 0.7;
      technicalDepth = 0.4;
      emojiUsage = 0.7;
      responseStyle = "balanced";
      favoriteEmojis = ["✨", "🎨", "👀", "💡", "🎉"];
    }
    // Community - very chatty, emoji-heavy
    else if (role.includes("community")) {
      chattiness = 0.9;
      technicalDepth = 0.3;
      emojiUsage = 0.8;
      responseStyle = "brief";
      favoriteEmojis = ["🎉", "❤️", "🙌", "✨", "😊"];
    }

    personalities.set(user.id!, {
      userId: user.id!,
      name,
      chattiness,
      technicalDepth,
      emojiUsage,
      responseStyle,
      favoriteEmojis,
    });
  });

  return personalities;
}

// Determine time of day context from timestamp
function getTimeOfDayContext(timestamp: Date): TimeOfDayContext {
  const hour = timestamp.getHours();

  let period: TimeOfDayContext["period"];
  if (hour >= 0 && hour < 6) period = "late-night";
  else if (hour >= 6 && hour < 9) period = "early-morning";
  else if (hour >= 9 && hour < 12) period = "morning";
  else if (hour >= 12 && hour < 14) period = "midday";
  else if (hour >= 14 && hour < 17) period = "afternoon";
  else if (hour >= 17 && hour < 21) period = "evening";
  else period = "late-night";

  const isBusinessHours = hour >= 9 && hour < 17;

  return { hour, period, isBusinessHours };
}

// Determine conversation mood based on context
function determineConversationMood(
  category: "work" | "workAdjacent" | "casual",
  topic: string,
  timeContext: TimeOfDayContext
): ConversationMood {
  if (category === "casual") return "casual";

  // Work-adjacent can be celebratory
  if (category === "workAdjacent") {
    if (topic.includes("celebration")) return "celebratory";
    return "casual";
  }

  // Work category - determine based on topic and time
  if (
    topic.includes("issue") ||
    topic.includes("bug") ||
    topic.includes("problem")
  ) {
    return timeContext.isBusinessHours ? "problem-solving" : "urgent";
  }

  if (topic.includes("brainstorm") || topic.includes("architecture")) {
    return "brainstorming";
  }

  return "problem-solving";
}

// Add emoji to message based on personality and mood
function addEmojiToMessage(
  text: string,
  personality: UserPersonality,
  mood: ConversationMood,
  position: "first" | "middle" | "last"
): string {
  // Skip if message already has emoji
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u;
  if (emojiRegex.test(text)) return text;

  // Check if we should add emoji based on personality
  if (Math.random() > personality.emojiUsage) return text;

  // Higher chance for celebratory moods
  if (mood === "celebratory" && Math.random() < 0.8) {
    const celebratoryEmojis = ["🎉", "🎊", "🙌", "✨", "🎈"];
    const emoji = selectRandom(celebratoryEmojis);
    return `${text} ${emoji}`;
  }

  // Higher chance for last messages (wrap-up)
  if (position === "last" && Math.random() < personality.emojiUsage + 0.2) {
    const emoji = selectRandom(personality.favoriteEmojis);
    return `${text} ${emoji}`;
  }

  // Regular chance for other positions
  if (Math.random() < personality.emojiUsage * 0.6) {
    const emoji = selectRandom(personality.favoriteEmojis);

    // 70% at end, 30% at start
    if (Math.random() < 0.7) {
      return `${text} ${emoji}`;
    } else {
      return `${emoji} ${text}`;
    }
  }

  return text;
}

// Helper function to extract keywords from message text
function extractKeywords(text: string): string[] {
  // Remove URLs, mentions, and special chars
  const cleanText = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/<@\w+>/g, "")
    .replace(/[^\w\s]/g, " ")
    .toLowerCase();

  // Split into words and filter
  const words = cleanText
    .split(/\s+/)
    .filter((word) => word.length > 3) // Only words longer than 3 chars
    .filter(
      (word) =>
        ![
          "this",
          "that",
          "with",
          "from",
          "have",
          "been",
          "were",
          "will",
          "your",
          "they",
          "what",
          "when",
          "where",
          "there",
          "their",
        ].includes(word)
    );

  // Return up to 5 unique keywords
  return Array.from(new Set(words)).slice(0, 5);
}

export async function generateSlackMessages(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: RelationshipContext
): Promise<MessageWithChannel[]> {
  const allMessages: MessageWithChannel[] = [];
  const users = generateSlackUsers();
  const channels = generateSlackChannels();

  // Generate user personalities once
  const personalities = generateUserPersonalities(users);

  console.log(`Generating ${count} Slack messages with conversations...`);
  console.log(`  👥 Generated personalities for ${personalities.size} users`);
  if (context) {
    console.log(
      `  With context: ${context.issues?.length || 0} issues, ${
        context.meetings?.length || 0
      } meetings, ${context.pages?.length || 0} pages`
    );
  }

  // Track previous starters for cross-references
  const previousStarters: ConversationStarter[] = [];

  // Distribute messages across channels
  const messagesPerChannel = Math.ceil(count / channels.length);

  // Batch size for parallel generation
  const CONVERSATION_BATCH_SIZE = 10;

  for (const channel of channels) {
    const channelMessageCount = Math.min(
      messagesPerChannel,
      count - allMessages.length
    );

    // Determine channel category
    let category: "work" | "workAdjacent" | "casual" = "work";
    if (CHANNEL_CATEGORIES.casual.includes(channel.name || "")) {
      category = "casual";
    } else if (CHANNEL_CATEGORIES.workAdjacent.includes(channel.name || "")) {
      category = "workAdjacent";
    }

    let channelMessages = 0;

    // Generate conversations in batches until we reach the channel's message count
    while (channelMessages < channelMessageCount) {
      const remaining = channelMessageCount - channelMessages;
      const batchSize = Math.min(CONVERSATION_BATCH_SIZE, remaining);

      // Generate conversation metadata (thread lengths) upfront
      const conversationPlans: Array<{ threadLength: number }> = [];
      for (let i = 0; i < batchSize; i++) {
        const threadType = weightedRandom(
          Object.keys(THREAD_LENGTHS),
          Object.values(THREAD_LENGTHS).map((t) => t.weight)
        ) as keyof typeof THREAD_LENGTHS;

        const { min, max } = THREAD_LENGTHS[threadType];
        const threadLength =
          min === max ? min : min + Math.floor(Math.random() * (max - min + 1));

        conversationPlans.push({ threadLength });
      }

      // Batch generate conversation starters in parallel
      const starterPromises = conversationPlans.map(() =>
        generateConversationStarter(
          channel,
          category,
          users,
          dates,
          config,
          context,
          previousStarters,
          personalities
        )
      );

      const starters = await Promise.all(starterPromises);

      // Process each starter with its thread
      const threadPromises = starters.map(async (starter, index) => {
        if (!starter) return [];

        const threadLength = conversationPlans[index].threadLength;
        const messages: MessageWithChannel[] = [starter.message];

        // Extract keywords from the message for cross-referencing
        const keywords = extractKeywords(starter.message.text || "");

        // Get participants (we'll update this after generating replies)
        const participants = [starter.message.user || ""];

        // Track this starter
        const starterData: ConversationStarter = {
          message: starter.message,
          topic: starter.topic,
          category,
          threadLength,
          participants,
          keywords,
        };
        previousStarters.push(starterData);

        // Keep only last 50 starters for reference to prevent unbounded memory growth
        if (previousStarters.length > 50) {
          previousStarters.shift();
        }

        // Generate thread replies sequentially (within this thread)
        // but this whole thread is generated in parallel with other threads
        if (threadLength > 0) {
          const replies = await generateThreadReplies(
            starter.message,
            threadLength,
            category,
            users,
            config,
            personalities
          );
          messages.push(...replies);
        }

        return messages;
      });

      // Wait for all threads in this batch to complete
      const batchThreads = await Promise.all(threadPromises);

      // Flatten and add to all messages
      for (const thread of batchThreads) {
        allMessages.push(...thread);
        channelMessages += thread.length;
      }

      if (allMessages.length % 100 === 0) {
        console.log(`  Generated ${allMessages.length}/${count} messages`);
      }

      if (channelMessages >= channelMessageCount) break;
    }

    if (allMessages.length >= count) break;
  }

  // Sort all messages by timestamp to maintain chronological order
  allMessages.sort((a, b) => parseFloat(a.ts || "0") - parseFloat(b.ts || "0"));

  return allMessages.slice(0, count);
}

async function generateConversationStarter(
  channel: Channel,
  category: "work" | "workAdjacent" | "casual",
  users: Member[],
  dates: Date[],
  config: GeneratorConfig,
  context?: RelationshipContext,
  previousStarters?: ConversationStarter[],
  personalities?: Map<string, UserPersonality>
): Promise<{ message: MessageWithChannel; topic: string } | null> {
  const user = selectRandom(users);
  const timestamp = generateRandomDate(dates[0], dates[dates.length - 1]);
  const ts = (timestamp.getTime() / 1000).toFixed(6);

  // Get time of day context
  const timeContext = getTimeOfDayContext(timestamp);

  let prompt = "";
  let topic = "";

  // 10-15% chance to reference a previous thread
  const shouldReference =
    previousStarters && previousStarters.length > 5 && Math.random() < 0.12;

  if (shouldReference) {
    const previousStarter = selectRandom(previousStarters!);
    topic = `reference-to-${previousStarter.topic}`;

    prompt = `Generate a Slack message that references an earlier conversation.

Channel: #${channel.name}
Author: ${user.real_name} (@${user.name})
Company: ${COMPANY_DATA.name} - Gaming & Interactive Entertainment startup

Previous discussion topic: "${previousStarter.topic}"

Create a follow-up message that:
- References the earlier discussion naturally (e.g., "Following up on the Redis discussion...")
- Adds new information or a related thought
- Invites further discussion
- Keep it ${
      category === "casual"
        ? "casual and friendly"
        : category === "work"
        ? "professional"
        : "semi-professional"
    }

Return ONLY the message text (no JSON, no quotes):`;
  } else {
    // Generate based on category and context
    if (category === "work" && context) {
      // Work-related topics with GitHub/Notion/Fathom context
      const contextType = weightedRandom(
        ["github_issue", "github_pr", "meeting", "notion_page", "general"],
        [30, 20, 20, 15, 15]
      );

      if (contextType === "github_issue" && context.issues?.length) {
        const issue = selectRandom(context.issues);
        topic = `github-issue-${issue.number}`;
        prompt = `Generate a Slack message starting a conversation about a GitHub issue.

Channel: #${channel.name}
Author: ${user.real_name} (@${user.name})
GitHub Issue: #${issue.number} - ${issue.title}
Issue URL: ${issue.html_url}

Create a message that:
- Mentions the issue number and briefly describes the problem
- Asks for input or reports progress
- Encourages team discussion
- Sounds natural and conversational

Return ONLY the message text (no JSON, no quotes):`;
      } else if (contextType === "github_pr" && context.pullRequests?.length) {
        const pr = selectRandom(context.pullRequests);
        topic = `github-pr-${pr.number}`;
        prompt = `Generate a Slack message about a GitHub pull request.

Channel: #${channel.name}
Author: ${user.real_name} (@${user.name})
Pull Request: #${pr.number} - ${pr.title}

Create a message that:
- Announces the PR or asks for review
- Briefly describes what it does
- Is professional but friendly

Return ONLY the message text (no JSON, no quotes):`;
      } else if (contextType === "meeting" && context.meetings?.length) {
        const meeting = selectRandom(context.meetings);
        topic = `meeting-followup-${meeting.recording_id}`;
        prompt = `Generate a Slack message following up on a meeting.

Channel: #${channel.name}
Author: ${user.real_name} (@${user.name})
Meeting: ${meeting.title}
Date: ${new Date(meeting.recording_start_time).toLocaleDateString()}

Create a message that:
- References the meeting
- Summarizes a key decision or action item
- Tags relevant people if needed
- Professional tone

Return ONLY the message text (no JSON, no quotes):`;
      } else if (contextType === "notion_page" && context.pages?.length) {
        const page = selectRandom(context.pages);
        const pageTitle =
          page.properties?.title?.title?.[0]?.plain_text || "Untitled";
        topic = `notion-doc-${pageTitle.slice(0, 20)}`;
        prompt = `Generate a Slack message about a Notion document.

Channel: #${channel.name}
Author: ${user.real_name} (@${user.name})
Document: ${pageTitle}
URL: ${page.url}

Create a message that:
- Announces or asks for feedback on the doc
- Briefly describes its purpose
- Invites team input

Return ONLY the message text (no JSON, no quotes):`;
      } else {
        // General work message
        topic = "general-work-question";
        prompt = `Generate a Slack message starting a technical discussion.

Channel: #${channel.name}
Author: ${user.real_name} (@${user.name})
Company: ${COMPANY_DATA.name} - Gaming startup

Create a message about:
- A technical question or problem
- Architecture discussion
- Best practices
- Performance issue
- Code review question

Keep it professional and specific to game development/backend engineering.

Return ONLY the message text (no JSON, no quotes):`;
      }
    } else if (category === "casual") {
      // Casual topics
      const topicCategory = weightedRandom(
        Object.keys(CASUAL_TOPICS),
        [15, 15, 12, 12, 20, 13, 13] // food, movies, weekend, life, gaming, books, music
      ) as keyof typeof CASUAL_TOPICS;

      const topicPhrase = selectRandom(CASUAL_TOPICS[topicCategory]);
      topic = `casual-${topicCategory}-${topicPhrase.slice(0, 15)}`;

      prompt = `Generate a casual Slack message starting a conversation.

Channel: #${channel.name}
Author: ${user.real_name} (@${user.name})
Topic: ${topicPhrase}

Create a friendly, conversational message about:
- ${topicCategory === "food" ? "A restaurant, meal, or food experience" : ""}
- ${topicCategory === "movies" ? "A movie or TV show" : ""}
- ${topicCategory === "weekend" ? "A weekend activity or outing" : ""}
- ${topicCategory === "life" ? "A life update or personal news" : ""}
- ${topicCategory === "gaming" ? "A video game experience" : ""}
- ${topicCategory === "books" ? "A book or reading experience" : ""}
- ${topicCategory === "music" ? "Music, concerts, or artists" : ""}

Make it engaging so others want to respond. Be specific with details.

Return ONLY the message text (no JSON, no quotes):`;
    } else {
      // Work-adjacent (celebrations, announcements, team stuff)
      const subtopic = weightedRandom(
        ["celebration", "announcement", "team-event", "office-life"],
        [30, 25, 25, 20]
      );
      topic = `work-adjacent-${subtopic}`;

      prompt = `Generate a Slack message for #${channel.name}.

Author: ${user.real_name} (@${user.name})
Type: ${subtopic}

Create a message that is:
- ${
        subtopic === "celebration"
          ? "Celebrating a team member's achievement, birthday, or work anniversary"
          : ""
      }
- ${
        subtopic === "announcement"
          ? "Announcing company news, new hire, or team update"
          : ""
      }
- ${
        subtopic === "team-event"
          ? "Planning or discussing a team lunch, happy hour, or outing"
          : ""
      }
- ${
        subtopic === "office-life"
          ? "Casual observation about office/remote work life"
          : ""
      }

Keep it friendly and positive.

Return ONLY the message text (no JSON, no quotes):`;
    }
  }

  try {
    let messageText = await generateWithLLM(prompt, config);
    messageText = messageText.trim();

    // Add emoji based on user personality and mood
    if (personalities && user.id) {
      const personality = personalities.get(user.id);
      if (personality) {
        const mood = determineConversationMood(category, topic, timeContext);
        messageText = addEmojiToMessage(
          messageText,
          personality,
          mood,
          "first"
        );
      }
    }

    return {
      message: {
        type: "message",
        user: user.id,
        text: messageText,
        ts,
        channel: channel.id,
      } as MessageWithChannel,
      topic,
    };
  } catch (error) {
    console.error("Error generating conversation starter:", error);
    return null;
  }
}

async function generateThreadReplies(
  parentMessage: MessageWithChannel,
  replyCount: number,
  category: "work" | "workAdjacent" | "casual",
  users: Member[],
  config: GeneratorConfig,
  personalities?: Map<string, UserPersonality>
): Promise<MessageWithChannel[]> {
  const replies: MessageWithChannel[] = [];
  const parentTimestamp = parseFloat(parentMessage.ts || "0");

  // Select participants for this thread (2-7 unique users)
  const participantCount = Math.min(Math.max(2, Math.ceil(replyCount / 3)), 7);

  // Ensure parent user is not in participants (can't reply to themselves first)
  const otherUsers = users.filter((u) => u.id !== parentMessage.user);
  const participants = selectRandomMultiple(otherUsers, participantCount);

  let currentTimestamp = parentTimestamp;

  for (let i = 0; i < replyCount; i++) {
    // Select a participant (can be same user multiple times in long threads)
    const replyUser = selectRandom(participants);

    // Calculate reply timing
    // First reply: 5-30 minutes
    // Subsequent: 10 minutes to 6 hours
    const delayMinutes =
      i === 0 ? 5 + Math.random() * 25 : 10 + Math.random() * 350;

    currentTimestamp += delayMinutes * 60;
    const ts = currentTimestamp.toFixed(6);

    // Determine position for length calculation
    const position: "first" | "middle" | "last" =
      i === 0 ? "first" : i === replyCount - 1 ? "last" : "middle";

    // Determine message length based on position
    const messageLength = determineMessageLength(position, category);
    const { minWords, maxWords } = MESSAGE_LENGTHS[messageLength];

    // Check if we should use a pre-defined short response
    const useShortResponse = shouldUseShortResponse(messageLength, position);

    let replyText: string;

    if (useShortResponse) {
      // Use a pre-defined short response
      let responseType: keyof typeof SHORT_RESPONSES;

      if (position === "first") {
        // First replies are often acknowledgments or agreements
        responseType = Math.random() < 0.7 ? "acknowledgment" : "agreement";
      } else if (position === "last") {
        // Last replies are often acknowledgments or casual closures
        responseType =
          category === "casual"
            ? Math.random() < 0.5
              ? "acknowledgment"
              : "casual"
            : "acknowledgment";
      } else {
        // Middle replies can be varied
        const types: Array<keyof typeof SHORT_RESPONSES> =
          category === "work"
            ? ["acknowledgment", "agreement", "quick_update"]
            : ["acknowledgment", "agreement", "casual"];
        responseType = selectRandom(types);
      }

      replyText = selectShortResponse(responseType);
    } else {
      // Generate using LLM with length guidance
      const previousReplies = replies
        .slice(-3)
        .map((r) => r.text)
        .join("\n");

      const lengthGuidance =
        messageLength === "veryShort"
          ? "VERY SHORT (1-3 words like 'Thanks!', 'Got it', or 'Will do')"
          : messageLength === "short"
          ? "SHORT (4-10 words, brief response)"
          : messageLength === "medium"
          ? "MEDIUM (11-25 words, brief explanation)"
          : "LONGER (26-50 words, detailed response)";

      const prompt = `Generate a Slack thread reply.

Original message: "${parentMessage.text}"
${previousReplies ? `\nRecent replies:\n${previousReplies}` : ""}

Author: ${replyUser.real_name} (@${replyUser.name})
Reply #${i + 1} of ${replyCount}
Category: ${category}
LENGTH REQUIREMENT: ${lengthGuidance}

Create a reply that:
- Responds naturally to the conversation
- ${
        i === 0
          ? "Directly addresses the original message"
          : "Continues the discussion naturally"
      }
- ${
        i === replyCount - 1
          ? "Could wrap up the conversation"
          : "Keeps the discussion going"
      }
- Matches the ${
        category === "casual"
          ? "casual, friendly"
          : category === "work"
          ? "professional"
          : "semi-professional"
      } tone
- IMPORTANT: Keep it ${lengthGuidance} - this is critical for realism
- ${
        messageLength === "veryShort"
          ? "Be extremely brief - just 1-3 words is perfect"
          : ""
      }
- ${
        i > 2 && Math.random() < 0.3 && messageLength !== "veryShort"
          ? "Could add a slight tangent or related thought"
          : ""
      }

Return ONLY the reply text (no JSON, no quotes):`;

      try {
        replyText = await generateWithLLM(prompt, config);
        replyText = replyText.trim();

        // Validate word count and retry if needed
        const wordCount = replyText.split(/\s+/).length;
        if (wordCount < minWords || wordCount > maxWords + 10) {
          console.log(
            `  ⚠️ Reply word count (${wordCount}) outside range [${minWords}-${maxWords}], using fallback`
          );
          // Use a fallback short response if LLM didn't follow length guidance
          if (messageLength === "veryShort") {
            const fallbackType =
              position === "first" ? "acknowledgment" : "agreement";
            replyText = selectShortResponse(fallbackType);
          }
        }
      } catch (error) {
        console.error(`Error generating reply ${i + 1}:`, error);
        // Fallback to short response on error
        replyText = selectShortResponse("acknowledgment");
      }
    }

    // Add emoji based on user personality
    if (personalities && replyUser.id) {
      const personality = personalities.get(replyUser.id);
      if (personality) {
        const replyDate = new Date(currentTimestamp * 1000);
        const timeContext = getTimeOfDayContext(replyDate);
        const mood = determineConversationMood(
          category,
          parentMessage.text || "",
          timeContext
        );
        replyText = addEmojiToMessage(replyText, personality, mood, position);
      }
    }

    replies.push({
      type: "message",
      user: replyUser.id,
      text: replyText,
      ts,
      thread_ts: parentMessage.ts, // Critical: links to parent
      channel: parentMessage.channel,
    } as MessageWithChannel);
  }

  return replies;
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
