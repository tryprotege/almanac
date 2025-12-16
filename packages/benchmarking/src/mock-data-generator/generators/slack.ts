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
import { generateRandomStringId } from "../utils/id-generator.js";
import fs from "fs";

/**
 * Generate Slack messages with realistic conversation threads
 */

// Extended MessageElement with channel tracking
export interface MessageWithChannel extends MessageElement {
  channel?: string;
  reactions?: SlackReaction[];
}

// Slack reaction interface
export interface SlackReaction {
  name: string; // emoji name without colons
  users: string[];
  count: number;
}

// Channel categories for context-aware message generation
const CHANNEL_CATEGORIES = {
  work: ["engineering"],
  workAdjacent: ["general", "product"],
  casual: ["random"],
};

// Thread length distribution (weighted random)
const THREAD_LENGTHS = {
  standalone: { min: 0, max: 0, weight: 10 }, // 10% standalone messages
  short: { min: 2, max: 5, weight: 20 }, // 20% short threads (increased minimum)
  medium: { min: 6, max: 12, weight: 35 }, // 35% medium threads (wider range)
  long: { min: 13, max: 20, weight: 25 }, // 25% long threads
  veryLong: { min: 21, max: 35, weight: 10 }, // 10% very long threads (much longer)
};

// Message length distribution (weighted random)
const MESSAGE_LENGTHS = {
  veryShort: { minWords: 1, maxWords: 3, weight: 25 }, // "Thanks!", "Got it", "👍" (reduced)
  short: { minWords: 4, maxWords: 12, weight: 25 }, // "I'll look into this"
  medium: { minWords: 13, maxWords: 35, weight: 30 }, // Brief explanations (increased range)
  long: { minWords: 36, maxWords: 70, weight: 15 }, // Detailed responses (increased)
  veryLong: { minWords: 71, maxWords: 120, weight: 5 }, // Very detailed technical discussions
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
    "k",
    "thx",
    "cool",
    "ok",
    "yep",
    "sure",
    "sure thing",
    "sounds great",
    "nice",
    "great",
    "ty",
    "thanks",
    "got it!",
    "kk",
    "roger that",
    "np",
    "no prob",
    "all good",
    "👌",
    "alright",
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
    "totally",
    "+1",
    "same",
    "agreed",
    "100%",
    "this",
    "yeah",
    "yup",
    "definitely",
    "absolutely",
    "facts",
    "right on",
    "couldn't agree more",
    "spot on",
    "exactly right",
    "that's it",
    "you got it",
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
    "done ✓",
    "merged",
    "shipped",
    "fixed it",
    "pushed",
    "live now",
    "deployed it",
    "sorted",
    "finished",
    "all done",
    "✅",
    "done and done",
    "shipped it",
  ],
  questions: [
    "Quick question:",
    "Anyone available?",
    "Need help with",
    "Thoughts?",
    "What do you think?",
    "Can someone review?",
    "quick q -",
    "hey quick thing",
    "got a sec?",
    "anyone know",
    "has anyone",
    "wondering if",
    "question:",
    "anyone else seeing",
    "am i missing something",
    "ideas?",
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
    "lol",
    "haha",
    "nice",
    "sweet",
    "dope",
    "sick",
    "lit",
    "🔥",
    "love this",
    "omg",
    "wow",
    "yay!",
    "woohoo",
    "hell yeah",
    "let's go",
    "ayy",
    "yasss",
  ],
};

// Emoji-only responses for very casual/quick reactions
const EMOJI_ONLY_RESPONSES = [
  "👍",
  "🎉",
  "😂",
  "🔥",
  "💯",
  "✅",
  "🙌",
  "👀",
  "💪",
  "🚀",
  "👌",
  "❤️",
  "🙏",
  "😊",
  "👏",
];

// Common Slack reactions with weights
const COMMON_REACTIONS = [
  { name: "thumbsup", weight: 30 },
  { name: "eyes", weight: 15 },
  { name: "white_check_mark", weight: 20 },
  { name: "raised_hands", weight: 10 },
  { name: "fire", weight: 8 },
  { name: "heart", weight: 7 },
  { name: "laughing", weight: 10 },
  { name: "tada", weight: 8 },
  { name: "rocket", weight: 6 },
  { name: "100", weight: 5 },
  { name: "clap", weight: 7 },
  { name: "pray", weight: 5 },
  { name: "thinking_face", weight: 4 },
  { name: "muscle", weight: 3 },
];

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
  category: "work" | "workAdjacent" | "casual",
  messageIndex: number,
  totalMessages: number
): keyof typeof MESSAGE_LENGTHS {
  // For more detailed discussions, vary length more naturally
  // Early messages set context (longer), middle has mix, end wraps up (shorter)

  if (position === "first") {
    // First replies can be substantive (not just quick acks)
    return weightedRandom(
      Object.keys(MESSAGE_LENGTHS) as Array<keyof typeof MESSAGE_LENGTHS>,
      [30, 25, 30, 12, 3] // More medium/long responses to establish discussion
    );
  } else if (position === "last") {
    // Last replies wrap up but can still be meaningful
    return weightedRandom(
      Object.keys(MESSAGE_LENGTHS) as Array<keyof typeof MESSAGE_LENGTHS>,
      [50, 35, 12, 3, 0] // Still mostly short but allow some substance
    );
  } else {
    // Middle replies - this is where detailed discussion happens
    // Favor longer, more substantive messages for better discussions
    if (category === "work" || category === "workAdjacent") {
      return weightedRandom(
        Object.keys(MESSAGE_LENGTHS) as Array<keyof typeof MESSAGE_LENGTHS>,
        [15, 20, 35, 25, 5] // Much more medium/long/very long for work discussions
      );
    } else {
      return weightedRandom(
        Object.keys(MESSAGE_LENGTHS) as Array<keyof typeof MESSAGE_LENGTHS>,
        [20, 25, 30, 20, 5] // Casual still has variety but slightly shorter
      );
    }
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

  // Higher chance for first and last replies (increased for more realism)
  if (position === "first") return Math.random() < 0.75; // 75% chance (up from 60%)
  if (position === "last") return Math.random() < 0.85; // 85% chance (up from 70%)
  return Math.random() < 0.6; // 60% chance for middle (up from 40%)
}

// Add natural imperfections to make messages feel more human
function addNaturalImperfections(
  text: string,
  category: "work" | "workAdjacent" | "casual"
): string {
  let processed = text.trim();

  // Skip if text is already very short (< 10 chars) or emoji-only
  if (
    processed.length < 10 ||
    /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\s]+$/u.test(processed)
  ) {
    return processed;
  }

  // Casual messages get more imperfections
  const imperfectionChance =
    category === "casual" ? 0.35 : category === "workAdjacent" ? 0.25 : 0.15;

  if (Math.random() > imperfectionChance) {
    return processed;
  }

  const modifications: Array<(text: string) => string> = [
    // Remove ending punctuation (20% of imperfect messages)
    (t) => t.replace(/[.!?]$/, ""),

    // Lowercase start (15% of imperfect messages)
    (t) => t.charAt(0).toLowerCase() + t.slice(1),

    // Add casual abbreviations (25% of imperfect messages)
    (t) =>
      t
        .replace(/\bgoing to\b/gi, "gonna")
        .replace(/\bwant to\b/gi, "wanna")
        .replace(/\bkind of\b/gi, "kinda")
        .replace(/\bgot to\b/gi, "gotta")
        .replace(/\bI don't know\b/gi, "idk")
        .replace(/\bprobably\b/gi, "prolly")
        .replace(/\bthough\b/gi, "tho")
        .replace(/\bbecause\b/gi, "cause")
        .replace(/\byou\b/gi, "u")
        .replace(/\bthanks\b/gi, "thx")
        .replace(/\btomorrow\b/gi, "tmrw"),

    // Common typos (10% of imperfect messages - subtle ones)
    (t) => {
      const typos = [
        [/\bthe\b/g, "teh"],
        [/\bthats\b/gi, "thats"],
        [/\byour\b/gi, "ur"],
        [/\bfor\b/g, "fr"],
      ];
      const typo = typos[Math.floor(Math.random() * typos.length)];
      return Math.random() < 0.3 ? t.replace(typo[0], typo[1] as string) : t;
    },

    // Remove some punctuation in the middle
    (t) => t.replace(/,\s/g, " "),
  ];

  // Apply 1-2 random modifications
  const numMods = Math.random() < 0.7 ? 1 : 2;
  const selectedMods = selectRandomMultiple(
    modifications,
    Math.min(numMods, modifications.length)
  );

  for (const mod of selectedMods) {
    processed = mod(processed);
  }

  return processed;
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

// Generate reactions for a message based on context
function generateReactions(
  message: MessageWithChannel,
  users: Member[],
  personalities: Map<string, UserPersonality>,
  category: "work" | "workAdjacent" | "casual",
  position: "starter" | "reply"
): SlackReaction[] {
  // 40% of messages get reactions (higher for starters, celebrations)
  let reactionChance = 0.4;

  // Adjust based on position
  if (position === "starter") {
    reactionChance = 0.5; // Thread starters more likely to get reactions
  }

  // Adjust based on category
  if (category === "casual") {
    reactionChance += 0.15; // Casual messages get more reactions
  }

  const messageText = (message.text || "").toLowerCase();

  // Increase chance for certain content
  if (messageText.includes("🎉") || messageText.includes("congrat")) {
    reactionChance += 0.3; // Celebrations get lots of reactions
  }
  if (messageText.includes("shipped") || messageText.includes("merged")) {
    reactionChance += 0.2; // Achievements get reactions
  }
  if (messageText.includes("help") || messageText.includes("?")) {
    reactionChance += 0.1; // Questions get some reactions
  }

  if (Math.random() > reactionChance) return [];

  // Determine number of different reaction types (1-3)
  const reactionTypeCount = weightedRandom([1, 2, 3], [60, 30, 10]);
  const reactions: SlackReaction[] = [];

  // Select reaction types
  const selectedReactionTypes = selectRandomMultiple(
    COMMON_REACTIONS,
    reactionTypeCount
  );

  for (const reactionType of selectedReactionTypes) {
    // Determine how many users react with this emoji (1-5)
    const userCount = Math.min(Math.floor(Math.random() * 5) + 1, users.length);

    // Select users to react (exclude message author)
    const availableUsers = users.filter((u) => u.id !== message.user);
    if (availableUsers.length === 0) continue;

    const reactingUsers = selectRandomMultiple(
      availableUsers,
      Math.min(userCount, availableUsers.length)
    );

    reactions.push({
      name: reactionType.name,
      users: reactingUsers.map((u) => u.id!),
      count: reactingUsers.length,
    });
  }

  return reactions;
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
      const conversationPlans: Array<{
        threadLength: number;
        hasLinearChat: boolean;
        linearChatCount: number;
      }> = [];
      for (let i = 0; i < batchSize; i++) {
        const threadType = weightedRandom(
          Object.keys(THREAD_LENGTHS),
          Object.values(THREAD_LENGTHS).map((t) => t.weight)
        ) as keyof typeof THREAD_LENGTHS;

        const { min, max } = THREAD_LENGTHS[threadType];
        const threadLength =
          min === max ? min : min + Math.floor(Math.random() * (max - min + 1));

        // 30% chance to have linear chat (root-level follow-ups)
        const hasLinearChat = Math.random() < 0.3;
        // If has linear chat, generate 1-4 additional root messages
        const linearChatCount = hasLinearChat
          ? Math.floor(Math.random() * 4) + 1
          : 0;

        conversationPlans.push({
          threadLength,
          hasLinearChat,
          linearChatCount,
        });
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

        const { threadLength, hasLinearChat, linearChatCount } =
          conversationPlans[index];
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

        // Generate linear chat messages (root-level follow-ups)
        if (hasLinearChat && linearChatCount > 0) {
          const linearMessages = await generateLinearChatMessages(
            starter.message,
            linearChatCount,
            category,
            users,
            config,
            personalities,
            messages
          );
          messages.push(...linearMessages);
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
        [25, 40, 15, 18, 2] // Heavy focus on PRs (40%), GitHub issues (25%), meetings (15%), Notion (18%), minimal general (2%)
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
      // Even in casual channels, 30% should be work-related discussions
      if (context && Math.random() < 0.3) {
        // Work discussion in casual channel
        const contextType = weightedRandom(
          ["github_issue", "github_pr", "notion_page", "general"],
          [30, 40, 25, 5] // Focus on GitHub content (70% combined)
        );

        if (contextType === "github_issue" && context.issues?.length) {
          const issue = selectRandom(context.issues);
          topic = `casual-github-issue-${issue.number}`;
          prompt = `Generate a casual Slack message in #${channel.name} about a GitHub issue.

Author: ${user.real_name} (@${user.name})
GitHub Issue: #${issue.number} - ${issue.title}

Create a casual but work-related message that:
- Informally mentions working on or thinking about this issue
- Might ask for quick thoughts or share a realization
- Keeps the tone relaxed but still productive
- Sounds natural like chatting with colleagues

Return ONLY the message text (no JSON, no quotes):`;
        } else if (
          contextType === "github_pr" &&
          context.pullRequests?.length
        ) {
          const pr = selectRandom(context.pullRequests);
          topic = `casual-github-pr-${pr.number}`;
          prompt = `Generate a casual Slack message in #${channel.name} about a GitHub PR.

Author: ${user.real_name} (@${user.name})
Pull Request: #${pr.number} - ${pr.title}

Create a casual message that:
- Informally mentions the PR or asks for a quick review
- Shares a realization or challenge from working on it
- Keeps it conversational and relaxed
- Natural tone like chatting with colleagues

Return ONLY the message text (no JSON, no quotes):`;
        } else if (contextType === "notion_page" && context.pages?.length) {
          const page = selectRandom(context.pages);
          const pageTitle =
            page.properties?.title?.title?.[0]?.plain_text || "Untitled";
          topic = `casual-notion-${pageTitle.slice(0, 20)}`;
          prompt = `Generate a casual Slack message in #${channel.name} about a Notion document.

Author: ${user.real_name} (@${user.name})
Document: ${pageTitle}

Create a casual message that:
- Informally shares thoughts about the doc or asks for input
- Mentions reading or updating it
- Conversational and relaxed tone
- Still work-focused but not formal

Return ONLY the message text (no JSON, no quotes):`;
        } else {
          topic = "casual-work-chat";
          prompt = `Generate a casual work-related Slack message in #${channel.name}.

Author: ${user.real_name} (@${user.name})
Company: ${COMPANY_DATA.name} - Gaming startup

Create a casual message about work topics like:
- Interesting technical discovery or learning
- Development approach or tool discussion
- Game development thoughts or ideas
- Casual question about tech/architecture

Keep it relaxed and conversational but still substantive and work-related.

Return ONLY the message text (no JSON, no quotes):`;
        }
      } else {
        // Pure casual topics (now only 70% of casual channel content)
        const topicCategory = weightedRandom(
          Object.keys(CASUAL_TOPICS),
          [2, 2, 2, 3, 70, 15, 6] // Very heavily favor gaming (70%), minimal other topics
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
      }
    } else {
      // Work-adjacent - mostly work discussions, minimal announcements
      // 90% should be work-related with context
      if (context && Math.random() < 0.9) {
        // Work discussion in general/product channel
        const contextType = weightedRandom(
          ["github_issue", "github_pr", "meeting", "notion_page"],
          [25, 35, 25, 15] // Balanced work content
        );

        if (contextType === "github_issue" && context.issues?.length) {
          const issue = selectRandom(context.issues);
          topic = `general-github-issue-${issue.number}`;
          prompt = `Generate a Slack message in #${channel.name} about a GitHub issue.

Author: ${user.real_name} (@${user.name})
GitHub Issue: #${issue.number} - ${issue.title}

Create a message that:
- Discusses the issue in a team context
- May ask for input, report progress, or coordinate work
- Professional but conversational tone
- Encourages collaboration

Return ONLY the message text (no JSON, no quotes):`;
        } else if (
          contextType === "github_pr" &&
          context.pullRequests?.length
        ) {
          const pr = selectRandom(context.pullRequests);
          topic = `general-github-pr-${pr.number}`;
          prompt = `Generate a Slack message in #${channel.name} about a GitHub PR.

Author: ${user.real_name} (@${user.name})
Pull Request: #${pr.number} - ${pr.title}

Create a message that:
- Announces the PR or coordinates review
- Briefly describes the changes
- Professional but friendly tone

Return ONLY the message text (no JSON, no quotes):`;
        } else if (contextType === "meeting" && context.meetings?.length) {
          const meeting = selectRandom(context.meetings);
          topic = `general-meeting-${meeting.recording_id}`;
          prompt = `Generate a Slack message in #${channel.name} following up on a meeting.

Author: ${user.real_name} (@${user.name})
Meeting: ${meeting.title}

Create a message that:
- References key decisions or action items from the meeting
- Coordinates next steps with the team
- Professional tone

Return ONLY the message text (no JSON, no quotes):`;
        } else if (contextType === "notion_page" && context.pages?.length) {
          const page = selectRandom(context.pages);
          const pageTitle =
            page.properties?.title?.title?.[0]?.plain_text || "Untitled";
          topic = `general-notion-${pageTitle.slice(0, 20)}`;
          prompt = `Generate a Slack message in #${channel.name} about a Notion document.

Author: ${user.real_name} (@${user.name})
Document: ${pageTitle}

Create a message that:
- Shares the document or asks for feedback
- Coordinates team input
- Professional but conversational

Return ONLY the message text (no JSON, no quotes):`;
        } else {
          topic = "general-work-discussion";
          prompt = `Generate a Slack message in #${channel.name} about work.

Author: ${user.real_name} (@${user.name})
Company: ${COMPANY_DATA.name} - Gaming startup

Create a message about work topics like:
- Technical question or discussion
- Product planning or coordination
- Team collaboration

Professional but friendly tone.

Return ONLY the message text (no JSON, no quotes):`;
        }
      } else {
        // Small percentage of announcements/celebrations
        const subtopic = weightedRandom(
          ["announcement", "celebration"],
          [60, 40] // Mostly brief announcements, some celebrations
        );
        topic = `work-adjacent-${subtopic}`;

        prompt = `Generate a brief Slack message for #${channel.name}.

Author: ${user.real_name} (@${user.name})
Type: ${subtopic}

Create a ${
          subtopic === "announcement"
            ? "short company announcement or team update"
            : "brief celebration of a team achievement or milestone"
        }.

Keep it concise, friendly, and positive.

Return ONLY the message text (no JSON, no quotes):`;
      }
    }
  }

  try {
    // Vary temperature by category for more natural variation
    const temperature =
      category === "casual" ? 1.0 : category === "workAdjacent" ? 0.9 : 0.7;
    let messageText = await generateWithLLM(prompt, config, temperature);
    messageText = messageText.trim();

    // Apply natural imperfections to conversation starters
    messageText = addNaturalImperfections(messageText, category);

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

    const message: MessageWithChannel = {
      type: "message",
      user: user.id,
      text: messageText,
      ts,
      channel: channel.id,
    };

    // Add reactions to conversation starters
    message.reactions = generateReactions(
      message,
      users,
      personalities || new Map(),
      category,
      "starter"
    );

    return { message, topic };
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
    const messageLength = determineMessageLength(
      position,
      category,
      i,
      replyCount
    );
    const { minWords, maxWords } = MESSAGE_LENGTHS[messageLength];

    // Check if we should use a pre-defined short response
    const useShortResponse = shouldUseShortResponse(messageLength, position);

    let replyText: string;

    if (useShortResponse) {
      // 20% chance for emoji-only response
      if (Math.random() < 0.2) {
        replyText = selectRandom(EMOJI_ONLY_RESPONSES);
      } else {
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
      }
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

      const prompt =
        messageLength === "veryShort"
          ? `You're ${replyUser.real_name} replying in Slack to: "${parentMessage.text}"

Reply with just 1-3 words. Be casual like texting. Examples: "got it", "on it", "thanks", "sounds good"

Your reply:`
          : messageLength === "short"
          ? `You're ${replyUser.real_name} in Slack #${
              category === "work" ? "engineering" : "general"
            }.
Someone said: "${parentMessage.text}"

Quick ${
              category === "casual" ? "casual" : "friendly"
            } reply (5-10 words). Like texting a coworker. Can have typos.

Your reply:`
          : `You're ${replyUser.real_name} replying in Slack.

Original: "${parentMessage.text}"
${previousReplies ? `\nRecent replies:\n${previousReplies}` : ""}

Write a ${
              category === "casual" ? "casual" : "friendly but professional"
            } reply (${
              messageLength === "medium" ? "1-2 sentences" : "2-3 sentences"
            }). ${
              i === replyCount - 1
                ? "Could wrap things up."
                : "Keep conversation going."
            } Like texting a coworker - can have typos, be brief.

Your reply:`;

      try {
        // Higher temperature for first replies (more varied), lower for precise responses
        const temperature =
          position === "first" ? 0.95 : category === "casual" ? 1.0 : 0.75;
        replyText = await generateWithLLM(prompt, config, temperature);
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

        // Apply natural imperfections to LLM-generated text
        replyText = addNaturalImperfections(replyText, category);
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

    const replyMessage: MessageWithChannel = {
      type: "message",
      user: replyUser.id,
      text: replyText,
      ts,
      thread_ts: parentMessage.ts, // Critical: links to parent
      channel: parentMessage.channel,
    };

    // Add reactions to replies
    replyMessage.reactions = generateReactions(
      replyMessage,
      users,
      personalities || new Map(),
      category,
      "reply"
    );

    replies.push(replyMessage);
  }

  return replies;
}

// Generate linear chat messages (root-level follow-ups that continue the conversation)
async function generateLinearChatMessages(
  originalMessage: MessageWithChannel,
  count: number,
  category: "work" | "workAdjacent" | "casual",
  users: Member[],
  config: GeneratorConfig,
  personalities: Map<string, UserPersonality> | undefined,
  existingMessages: MessageWithChannel[]
): Promise<MessageWithChannel[]> {
  const linearMessages: MessageWithChannel[] = [];

  // Start after the last message in the thread
  const lastThreadTimestamp = Math.max(
    ...existingMessages.map((m) => parseFloat(m.ts || "0"))
  );

  let currentTimestamp = lastThreadTimestamp;

  // Get thread participants
  const threadUsers = Array.from(new Set(existingMessages.map((m) => m.user)));
  const availableUsers = users.filter(
    (u) => u.id && threadUsers.includes(u.id)
  );

  for (let i = 0; i < count; i++) {
    // Select user (preferably from thread participants, but can be new)
    const useThreadParticipant = Math.random() < 0.7;
    const user =
      useThreadParticipant && availableUsers.length > 0
        ? selectRandom(availableUsers)
        : selectRandom(users);

    // Time gap: 30 min to 8 hours after previous message
    const delayMinutes = 30 + Math.random() * 450;
    currentTimestamp += delayMinutes * 60;
    const ts = currentTimestamp.toFixed(6);

    // Linear messages are usually medium length (continuing discussion)
    const messageLength = weightedRandom(
      Object.keys(MESSAGE_LENGTHS) as Array<keyof typeof MESSAGE_LENGTHS>,
      [10, 20, 40, 25, 5] // Favor medium/long for substantive follow-ups
    );

    // Build context from recent messages
    const recentContext = existingMessages
      .slice(-3)
      .concat(linearMessages.slice(-2))
      .map((m, idx) => `${idx + 1}. ${m.text}`)
      .join("\n");

    const lengthDesc =
      messageLength === "veryShort"
        ? "very brief (1-3 words)"
        : messageLength === "short"
        ? "brief (4-12 words)"
        : messageLength === "medium"
        ? "moderate length (13-35 words)"
        : messageLength === "long"
        ? "detailed (36-70 words)"
        : "very detailed (71-120 words)";

    const prompt = `You're ${
      user.real_name || user.name
    } writing a new message in Slack (NOT a threaded reply, but a new root-level message continuing the conversation).

Original discussion: "${originalMessage.text}"

Recent messages in this conversation:
${recentContext}

Write a ${lengthDesc} follow-up message that:
- Adds new information, thoughts, or questions related to the ongoing discussion
- Feels like a natural continuation (e.g., "oh also...", "just realized...", "update on this...", "following up -")
- ${
      category === "casual"
        ? "Keeps casual, friendly tone"
        : "Stays professional but conversational"
    }
- ${
      i === count - 1
        ? "Could bring the discussion to a natural close"
        : "Keeps the conversation flowing"
    }

This is a NEW message at the root level, not a threaded reply.

Your message:`;

    try {
      const temperature = category === "casual" ? 0.95 : 0.85;
      let messageText = await generateWithLLM(prompt, config, temperature);
      messageText = messageText.trim();

      // Apply natural imperfections
      messageText = addNaturalImperfections(messageText, category);

      // Add emoji based on personality
      if (personalities && user.id) {
        const personality = personalities.get(user.id);
        if (personality) {
          const msgDate = new Date(currentTimestamp * 1000);
          const timeContext = getTimeOfDayContext(msgDate);
          const mood = determineConversationMood(
            category,
            originalMessage.text || "",
            timeContext
          );
          messageText = addEmojiToMessage(
            messageText,
            personality,
            mood,
            i === count - 1 ? "last" : "middle"
          );
        }
      }

      const linearMessage: MessageWithChannel = {
        type: "message",
        user: user.id,
        text: messageText,
        ts,
        channel: originalMessage.channel,
        // NO thread_ts - this is a root-level message
      };

      // Add reactions
      linearMessage.reactions = generateReactions(
        linearMessage,
        users,
        personalities || new Map(),
        category,
        "starter"
      );

      linearMessages.push(linearMessage);
    } catch (error) {
      console.error(`Error generating linear chat message ${i + 1}:`, error);
    }
  }

  return linearMessages;
}

export function generateSlackChannels(): Channel[] {
  return COMPANY_DATA.slackChannels.map((channel, index) => ({
    id: generateRandomStringId("C", 9),
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
    id: generateRandomStringId("U", 9),
    name: member.slackHandle,
    real_name: member.name,
    profile: {
      email: member.email,
      display_name: member.slackHandle,
      real_name: member.name,
    },
  }));
}
