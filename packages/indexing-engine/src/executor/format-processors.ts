/**
 * Format processors for specialized data transformations
 * These run in the Bun sandbox and handle complex conversions
 */

import type { FormatProcessor } from "../types/format-processors.js";
import TurndownService from "turndown";

/**
 * Built-in format processors
 */
export const formatProcessors: Record<string, FormatProcessor> = {
  /**
   * Notion rich text → Markdown
   */
  "notion-rich-text": {
    name: "Notion Rich Text",
    description: "Convert Notion rich text arrays to Markdown",
    process: async (richText: any[]) => {
      if (!Array.isArray(richText)) return "";

      return richText
        .map((block) => {
          let text = block.text?.content || block.plain_text || "";

          // Apply annotations
          if (block.annotations?.bold) text = `**${text}**`;
          if (block.annotations?.italic) text = `*${text}*`;
          if (block.annotations?.code) text = `\`${text}\``;
          if (block.annotations?.strikethrough) text = `~~${text}~~`;
          if (block.annotations?.underline) text = `<u>${text}</u>`;

          // Handle links
          if (block.href) text = `[${text}](${block.href})`;

          return text;
        })
        .join("");
    },
  },

  /**
   * Notion blocks → Markdown
   */
  "notion-blocks": {
    name: "Notion Blocks",
    description: "Convert Notion block array to Markdown document",
    process: async (blocks: any[], options?: { maxDepth?: number }) => {
      if (!Array.isArray(blocks)) return "";

      const maxDepth = options?.maxDepth || 3;

      function processBlock(block: any, depth: number = 0): string {
        if (depth > maxDepth || !block) return "";

        const type = block.type;
        const content = block[type];

        // Extract text using the rich-text processor
        const textPromise = content?.rich_text
          ? formatProcessors["notion-rich-text"].process(content.rich_text)
          : "";

        // For now, handle synchronously (will be awaited at top level)
        const text = String(textPromise);

        switch (type) {
          case "paragraph":
            return text;

          case "heading_1":
            return `# ${text}`;

          case "heading_2":
            return `## ${text}`;

          case "heading_3":
            return `### ${text}`;

          case "bulleted_list_item":
            return `- ${text}`;

          case "numbered_list_item":
            return `1. ${text}`;

          case "to_do":
            return `- [${content.checked ? "x" : " "}] ${text}`;

          case "code":
            return `\`\`\`${content.language || ""}\n${text}\n\`\`\``;

          case "quote":
            return `> ${text}`;

          case "divider":
            return "---";

          case "callout":
            const icon = content.icon?.emoji || "📌";
            return `> ${icon} ${text}`;

          case "toggle":
            return `▶ ${text}`;

          default:
            return text;
        }
      }

      return blocks
        .map((b) => processBlock(b))
        .filter(Boolean)
        .join("\n\n");
    },
  },

  /**
   * Slack mrkdwn → Markdown
   */
  "slack-mrkdwn": {
    name: "Slack Mrkdwn",
    description: "Convert Slack mrkdwn to standard Markdown",
    process: async (
      text: string,
      context?: { users?: Record<string, string> }
    ) => {
      if (!text) return "";

      let result = text;

      // Convert user mentions <@U123> to names
      result = result.replace(/<@(\w+)>/g, (_, userId) => {
        return context?.users?.[userId] || `@${userId}`;
      });

      // Convert channel mentions <#C123|channel-name>
      result = result.replace(/<#\w+\|([^>]+)>/g, "#$1");

      // Convert links <http://url|text>
      result = result.replace(/<([^|>]+)\|([^>]+)>/g, "[$2]($1)");
      result = result.replace(/<([^>]+)>/g, "$1");

      // Convert bold *text* → **text**
      result = result.replace(/\*([^*]+)\*/g, "**$1**");

      // Convert italic _text_ → *text*
      result = result.replace(/_([^_]+)_/g, "*$1*");

      // Convert strikethrough ~text~ → ~~text~~
      result = result.replace(/~([^~]+)~/g, "~~$1~~");

      return result;
    },
  },

  /**
   * Fathom transcript processing
   */
  "fathom-transcript": {
    name: "Fathom Transcript",
    description: "Format Fathom meeting transcripts",
    process: async (segments: any[]) => {
      if (!Array.isArray(segments)) return "";

      function formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
      }

      return segments
        .map((seg) => {
          const speaker = seg.speaker || "Unknown";
          const time = seg.start_time ? `[${formatTime(seg.start_time)}]` : "";
          const text = seg.text || "";
          return `${time} **${speaker}**: ${text}`;
        })
        .join("\n\n");
    },
  },

  /**
   * HTML → Markdown
   */
  "html-to-markdown": {
    name: "HTML to Markdown",
    description: "Convert HTML content to Markdown",
    process: async (html: string) => {
      if (!html) return "";

      const turndown = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      });

      return turndown.turndown(html);
    },
  },

  /**
   * Extract plain text from any format
   */
  "extract-text": {
    name: "Extract Text",
    description: "Extract plain text from various formats",
    process: async (input: any) => {
      if (typeof input === "string") return input;
      if (Array.isArray(input)) {
        return input
          .map((item) => {
            if (typeof item === "string") return item;
            if (item.text) return item.text;
            if (item.content) return item.content;
            return JSON.stringify(item);
          })
          .join(" ");
      }
      if (input && typeof input === "object") {
        if (input.text) return input.text;
        if (input.content) return input.content;
        return JSON.stringify(input);
      }
      return String(input);
    },
  },
};

/**
 * Get a format processor by name
 */
export function getFormatProcessor(name: string): FormatProcessor | undefined {
  return formatProcessors[name];
}

/**
 * Register a custom format processor
 */
export function registerFormatProcessor(
  name: string,
  processor: FormatProcessor
): void {
  formatProcessors[name] = processor;
}
