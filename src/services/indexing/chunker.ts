import {
  ExtractedResource,
  DocumentChunk,
  ChunkingStrategy,
  SourceType,
} from "../../types/index.js";
import { IndexRequest } from "../../contracts/index.js";

/**
 * Chunker service - Extracts and chunks content from MCPToolResult
 */
export class ChunkerService {
  private defaultChunkingStrategy: ChunkingStrategy = {
    maxChunkSize: 2000, // Characters
    overlapSize: 200, // Overlap between chunks
    splitOn: "paragraph",
  };

  /**
   * Extract content from IndexRequest
   */
  async extractFromIndexRequest(
    request: IndexRequest
  ): Promise<ExtractedResource[]> {
    const { toolResult, workspaceId, source } = request;

    // Combine all text content from the tool result
    let combinedText = "";
    let title = "";
    let resourceId = "";

    for (const content of toolResult.content) {
      if (content.type === "text" && content.text) {
        combinedText += content.text + "\n";
      } else if (content.type === "resource" && content.resource) {
        if (content.resource.text) {
          combinedText += content.resource.text + "\n";
        }
        // Extract resource ID from URI if possible
        if (content.resource.uri && !resourceId) {
          resourceId = this.extractResourceIdFromUri(content.resource.uri);
        }
      }
    }

    // Try to parse as JSON to extract structured data
    let parsedData: any = null;
    try {
      parsedData = JSON.parse(combinedText);
    } catch {
      // Not JSON, treat as plain text
    }

    if (parsedData) {
      // Handle structured data (e.g., Notion pages, Slack messages)
      return this.extractFromStructuredData(
        parsedData,
        workspaceId,
        source,
        resourceId,
        combinedText
      );
    } else {
      // Handle plain text
      return this.extractFromPlainText(
        combinedText,
        workspaceId,
        source,
        resourceId
      );
    }
  }

  /**
   * Extract resource ID from URI
   */
  private extractResourceIdFromUri(uri: string): string {
    // Extract the last segment of the URI as resource ID
    const parts = uri.split("/");
    return parts[parts.length - 1] || uri;
  }

  /**
   * Extract from structured data (JSON)
   */
  private extractFromStructuredData(
    data: any,
    workspaceId: string,
    source: { type: SourceType; serverId: string },
    resourceId: string,
    rawText: string
  ): ExtractedResource[] {
    // Handle arrays of resources
    if (Array.isArray(data)) {
      return data.flatMap((item) =>
        this.extractSingleResource(item, workspaceId, source, rawText)
      );
    }

    return [this.extractSingleResource(data, workspaceId, source, rawText)];
  }

  /**
   * Extract a single resource from structured data
   */
  private extractSingleResource(
    data: any,
    workspaceId: string,
    source: { type: SourceType; serverId: string },
    rawText: string
  ): ExtractedResource {
    // Common field extraction patterns
    const id = data.id || data._id || data.resource_id || this.generateId();
    const title = this.extractTitle(data);
    const textContent = this.extractTextContent(data);
    const people = this.extractPeople(data);
    const primaryDate = this.extractDate(data);
    const type = this.extractType(data, source.type);

    return {
      id,
      source: source.type,
      resourceId: id,
      type,
      title,
      textContent,
      people,
      primaryDate,
      attributes: data,
      relationships: [],
      rawData: { original: rawText, parsed: data },
    };
  }

  /**
   * Extract title from various field patterns
   */
  private extractTitle(data: any): string {
    // Common title field patterns
    const titleFields = [
      "title",
      "name",
      "subject",
      "summary",
      "headline",
      "properties.Name.title[0].plain_text", // Notion
      "properties.Title.title[0].plain_text",
    ];

    for (const field of titleFields) {
      const value = this.getNestedValue(data, field);
      if (value && typeof value === "string") {
        return value;
      }
    }

    return "Untitled";
  }

  /**
   * Extract text content from various field patterns
   */
  private extractTextContent(data: any): string {
    const contentFields = [
      "content",
      "text",
      "body",
      "description",
      "message",
      "plain_text",
    ];

    let content = "";

    for (const field of contentFields) {
      const value = this.getNestedValue(data, field);
      if (value) {
        if (typeof value === "string") {
          content += value + " ";
        } else if (typeof value === "object") {
          content += JSON.stringify(value) + " ";
        }
      }
    }

    return content.trim() || JSON.stringify(data);
  }

  /**
   * Extract people (email addresses) from data
   */
  private extractPeople(data: any): string[] {
    const people = new Set<string>();

    // Look for common people fields
    const peopleFields = [
      "author",
      "owner",
      "creator",
      "user",
      "assignee",
      "assignees",
      "attendees",
      "participants",
    ];

    for (const field of peopleFields) {
      const value = this.getNestedValue(data, field);
      if (value) {
        this.extractEmailsFromValue(value, people);
      }
    }

    return Array.from(people);
  }

  /**
   * Extract emails from a value (string, object, or array)
   */
  private extractEmailsFromValue(value: any, emails: Set<string>): void {
    if (typeof value === "string") {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = value.match(emailRegex);
      if (matches) {
        matches.forEach((email) => emails.add(email));
      }
    } else if (Array.isArray(value)) {
      value.forEach((item) => this.extractEmailsFromValue(item, emails));
    } else if (typeof value === "object" && value !== null) {
      if (value.email) {
        emails.add(value.email);
      }
      Object.values(value).forEach((v) =>
        this.extractEmailsFromValue(v, emails)
      );
    }
  }

  /**
   * Extract primary date from data
   */
  private extractDate(data: any): Date | null {
    const dateFields = [
      "created_time",
      "createdAt",
      "created_at",
      "timestamp",
      "date",
      "start",
      "updated_time",
      "updatedAt",
    ];

    for (const field of dateFields) {
      const value = this.getNestedValue(data, field);
      if (value) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date;
          }
        } catch {
          // Invalid date, continue
        }
      }
    }

    return null;
  }

  /**
   * Extract resource type
   */
  private extractType(data: any, sourceType: SourceType): string {
    // Try to get type from data
    if (data.type) return data.type;
    if (data.object) return data.object;

    // Default types by source
    const defaultTypes: Record<SourceType, string> = {
      notion: "page",
      slack: "message",
      calendar: "event",
      fathom: "call",
      whatsapp: "message",
      codebase: "file",
      asana: "task",
      jira: "issue",
      google_drive: "file",
    };

    return defaultTypes[sourceType] || "unknown";
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => {
      // Handle array notation
      const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, arrayKey, index] = arrayMatch;
        return current?.[arrayKey]?.[parseInt(index)];
      }
      return current?.[key];
    }, obj);
  }

  /**
   * Extract from plain text
   */
  private extractFromPlainText(
    text: string,
    workspaceId: string,
    source: { type: SourceType; serverId: string },
    resourceId: string
  ): ExtractedResource[] {
    const id = resourceId || this.generateId();

    // Extract title from first line
    const lines = text.split("\n").filter((l) => l.trim());
    const title = lines[0]?.substring(0, 100) || "Untitled";

    return [
      {
        id,
        source: source.type,
        resourceId: id,
        type: this.extractType({}, source.type),
        title,
        textContent: text,
        people: [],
        primaryDate: new Date(),
        attributes: {},
        relationships: [],
        rawData: { original: text },
      },
    ];
  }

  /**
   * Chunk text content for large documents
   */
  chunkText(
    text: string,
    strategy: ChunkingStrategy = this.defaultChunkingStrategy
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    if (text.length <= strategy.maxChunkSize) {
      // Text is small enough, return as single chunk
      return [
        {
          index: 0,
          text,
          start: 0,
          end: text.length,
        },
      ];
    }

    // Split based on strategy
    let segments: string[];
    if (strategy.splitOn === "paragraph") {
      segments = text.split(/\n\n+/);
    } else if (strategy.splitOn === "sentence") {
      segments = text.split(/[.!?]+\s+/);
    } else {
      // Character-based splitting
      segments = [text];
    }

    let currentChunk = "";
    let currentStart = 0;
    let chunkIndex = 0;

    for (const segment of segments) {
      if (currentChunk.length + segment.length + 1 > strategy.maxChunkSize) {
        if (currentChunk.length > 0) {
          // Save current chunk
          chunks.push({
            index: chunkIndex++,
            text: currentChunk.trim(),
            start: currentStart,
            end: currentStart + currentChunk.length,
          });

          // Start new chunk with overlap
          const overlapText = currentChunk.slice(-strategy.overlapSize);
          currentStart =
            currentStart + currentChunk.length - overlapText.length;
          currentChunk = overlapText + " " + segment;
        } else {
          // Segment itself is too large, split it
          currentChunk = segment;
        }
      } else {
        currentChunk += (currentChunk ? " " : "") + segment;
      }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push({
        index: chunkIndex,
        text: currentChunk.trim(),
        start: currentStart,
        end: currentStart + currentChunk.length,
      });
    }

    return chunks;
  }

  /**
   * Generate a random ID
   */
  private generateId(): string {
    return `resource_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
  }
}
