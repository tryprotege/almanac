/**
 * Format processors for specialized data transformations
 * These run in the Bun sandbox and handle complex conversions
 *
 * Design: Generic processors with configurable options instead of platform-specific implementations
 */

import type { FormatProcessor } from "../types/format-processors.js";
import TurndownService from "turndown";
import { parse } from "csv-parse/sync";

/**
 * Built-in format processors
 */
export const formatProcessors: Record<string, FormatProcessor> = {
  /**
   * Rich text array → Markdown (generic, adapter-based)
   * Supports any rich text format via options configuration
   */
  "rich-text-to-markdown": {
    name: "Rich Text to Markdown",
    description:
      "Convert rich text arrays to Markdown using configurable field mapping",
    process: async (
      richText: any[],
      options?: {
        textPath?: string; // JSONPath to extract text content (default: "text.content")
        plainTextPath?: string; // Fallback plain text path (default: "plain_text")
        hrefPath?: string; // Path to link URL (default: "href")
        annotationsPath?: string; // Path to annotations object (default: "annotations")
      }
    ) => {
      if (!Array.isArray(richText)) return "";

      const opts = {
        textPath: options?.textPath || "text.content",
        plainTextPath: options?.plainTextPath || "plain_text",
        hrefPath: options?.hrefPath || "href",
        annotationsPath: options?.annotationsPath || "annotations",
      };

      return richText
        .map((block) => {
          // Extract text using configured paths
          let text = "";
          const textParts = opts.textPath.split(".");
          let current: any = block;
          for (const part of textParts) {
            current = current?.[part];
          }
          text = current || block[opts.plainTextPath] || "";

          // Apply annotations if present
          const annotations = block[opts.annotationsPath];
          if (annotations) {
            if (annotations.bold) text = `**${text}**`;
            if (annotations.italic) text = `*${text}*`;
            if (annotations.code) text = `\`${text}\``;
            if (annotations.strikethrough) text = `~~${text}~~`;
            if (annotations.underline) text = `<u>${text}</u>`;
          }

          // Handle links
          const href = block[opts.hrefPath];
          if (href) text = `[${text}](${href})`;

          return text;
        })
        .join("");
    },
  },

  /**
   * Block array → Markdown (generic, adapter-based)
   * Supports any block-based format via type mapping
   */
  "blocks-to-markdown": {
    name: "Blocks to Markdown",
    description:
      "Convert block arrays to Markdown using configurable block type handlers",
    process: async (
      blocks: any[],
      options?: {
        typePath?: string; // Path to block type field (default: "type")
        contentPath?: string; // Path to content object (default: uses type as key)
        richTextField?: string; // Field name for rich text (default: "rich_text")
        maxDepth?: number; // Max nesting depth (default: 3)
        blockTypeMap?: Record<string, (content: any, text: string) => string>;
      }
    ) => {
      if (!Array.isArray(blocks)) return "";

      const opts = {
        typePath: options?.typePath || "type",
        richTextField: options?.richTextField || "rich_text",
        maxDepth: options?.maxDepth || 3,
        blockTypeMap: options?.blockTypeMap,
      };

      function processBlock(block: any, depth: number = 0): string {
        if (depth > opts.maxDepth || !block) return "";

        const type = block[opts.typePath];
        const content = options?.contentPath
          ? block[options.contentPath]
          : block[type];

        // Extract text from rich text field
        const richText = content?.[opts.richTextField];
        const text = richText
          ? formatProcessors["rich-text-to-markdown"].process(richText)
          : "";

        // Use custom block type map if provided
        if (opts.blockTypeMap && opts.blockTypeMap[type]) {
          return opts.blockTypeMap[type](content, String(text));
        }

        // Default block type handling
        switch (type) {
          case "paragraph":
            return String(text);

          case "heading_1":
          case "h1":
            return `# ${text}`;

          case "heading_2":
          case "h2":
            return `## ${text}`;

          case "heading_3":
          case "h3":
            return `### ${text}`;

          case "bulleted_list_item":
          case "bullet":
            return `- ${text}`;

          case "numbered_list_item":
          case "number":
            return `1. ${text}`;

          case "to_do":
          case "todo":
          case "checkbox":
            const checked = content?.checked || content?.done || false;
            return `- [${checked ? "x" : " "}] ${text}`;

          case "code":
            const language = content?.language || "";
            return `\`\`\`${language}\n${text}\n\`\`\``;

          case "quote":
            return `> ${text}`;

          case "divider":
          case "separator":
            return "---";

          case "callout":
            const icon = content?.icon?.emoji || content?.icon || "📌";
            return `> ${icon} ${text}`;

          case "toggle":
            return `▶ ${text}`;

          default:
            return String(text);
        }
      }

      return blocks
        .map((b) => processBlock(b))
        .filter(Boolean)
        .join("\n\n");
    },
  },

  /**
   * Custom markup → Markdown (generic)
   * Supports any markup syntax via regex rules
   */
  "markup-to-markdown": {
    name: "Markup to Markdown",
    description:
      "Convert custom markup syntax to standard Markdown using transformation rules",
    process: async (
      text: string,
      options?: {
        rules?: Array<{ pattern: string | RegExp; replacement: string }>;
        userMap?: Record<string, string>; // For user mentions
        channelMap?: Record<string, string>; // For channel mentions
      }
    ) => {
      if (!text) return "";

      let result = text;
      const opts = options || {};

      // Apply custom rules if provided
      if (opts.rules) {
        for (const rule of opts.rules) {
          const pattern =
            typeof rule.pattern === "string"
              ? new RegExp(rule.pattern, "g")
              : rule.pattern;
          result = result.replace(pattern, rule.replacement);
        }
        return result;
      }

      // Default rules (Slack-like syntax)
      // Convert user mentions <@U123>
      result = result.replace(/<@(\w+)>/g, (_, userId) => {
        return opts.userMap?.[userId] || `@${userId}`;
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
   * Transcript segments → Markdown (generic)
   * Supports any transcript format via field mapping
   */
  "transcript-to-markdown": {
    name: "Transcript to Markdown",
    description: "Format transcript segments with timestamps and speakers",
    process: async (
      segments: any[],
      options?: {
        speakerPath?: string; // Path to speaker field (default: "speaker")
        textPath?: string; // Path to text field (default: "text")
        timestampPath?: string; // Path to timestamp field (default: "start_time")
        timeFormat?: "seconds" | "milliseconds" | "timestamp";
      }
    ) => {
      if (!Array.isArray(segments)) return "";

      const opts = {
        speakerPath: options?.speakerPath || "speaker",
        textPath: options?.textPath || "text",
        timestampPath: options?.timestampPath || "start_time",
        timeFormat: options?.timeFormat || "seconds",
      };

      function formatTime(value: number): string {
        let seconds = value;
        if (opts.timeFormat === "milliseconds") {
          seconds = value / 1000;
        }
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
      }

      return segments
        .map((seg) => {
          const speaker = seg[opts.speakerPath] || "Unknown";
          const text = seg[opts.textPath] || "";
          const timestamp = seg[opts.timestampPath];
          const time = timestamp ? `[${formatTime(timestamp)}]` : "";

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

  /**
   * CSV → JSON Array
   * Uses the industry-standard csv-parse library for robust CSV parsing
   */
  "csv-to-json": {
    name: "CSV to JSON",
    description:
      "Convert CSV formatted data to JSON array of objects using csv-parse library",
    process: async (
      input: string,
      options?: {
        delimiter?: string; // Column delimiter (default: ",")
        skipEmptyLines?: boolean; // Skip empty lines (default: true)
        trimValues?: boolean; // Trim whitespace from values (default: true)
        hasHeaders?: boolean; // Whether first row contains headers (default: true)
      }
    ) => {
      if (!input || typeof input !== "string") return [];

      try {
        // Parse CSV using csv-parse library
        const records = parse(input, {
          columns: options?.hasHeaders ?? true, // Use first row as column names
          skip_empty_lines: options?.skipEmptyLines ?? true,
          trim: options?.trimValues ?? true,
          delimiter: options?.delimiter || ",",
          relax_quotes: true, // Be more forgiving with quotes
          relax_column_count: true, // Handle inconsistent column counts
          cast: true, // Auto-convert types (numbers, booleans)
        });

        return records;
      } catch (error) {
        console.error("CSV parsing error:", error);
        return [];
      }
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
