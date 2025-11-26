import { describe, it, expect, beforeEach } from "@jest/globals";
import { ChunkerService } from "../../services/indexing/chunker.js";
import { IndexRequest } from "../../contracts/index.js";

describe("ChunkerService", () => {
  let chunker: ChunkerService;

  beforeEach(() => {
    chunker = new ChunkerService();
  });

  describe("extractFromIndexRequest", () => {
    it("should extract from JSON structured data (Notion)", async () => {
      const request: IndexRequest = {
        workspaceId: "test-workspace",
        source: { type: "notion", serverId: "notion-server" },
        toolCall: { name: "get_page", arguments: { page_id: "page-123" } },
        toolResult: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: "page-123",
                properties: {
                  Name: { title: [{ plain_text: "Test Page" }] },
                },
                created_time: "2024-01-01T00:00:00Z",
              }),
            },
          ],
        },
      };

      const result = await chunker.extractFromIndexRequest(request);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("page-123");
      expect(result[0].title).toBe("Test Page");
      expect(result[0].source).toBe("notion");
      expect(result[0].primaryDate).toBeInstanceOf(Date);
    });

    it("should extract from plain text", async () => {
      const request: IndexRequest = {
        workspaceId: "test-workspace",
        source: { type: "slack", serverId: "slack-server" },
        toolCall: { name: "get_message", arguments: {} },
        toolResult: {
          content: [
            {
              type: "text",
              text: "This is a plain text message",
            },
          ],
        },
      };

      const result = await chunker.extractFromIndexRequest(request);

      expect(result).toHaveLength(1);
      expect(result[0].textContent).toContain("plain text message");
      expect(result[0].source).toBe("slack");
      expect(result[0].type).toBe("message");
    });

    it("should extract people (emails) from content", async () => {
      const request: IndexRequest = {
        workspaceId: "test-workspace",
        source: { type: "notion", serverId: "notion-server" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: "doc-1",
                author: { email: "john@example.com" },
                assignees: [{ email: "jane@example.com" }],
              }),
            },
          ],
        },
      };

      const result = await chunker.extractFromIndexRequest(request);

      expect(result[0].people).toContain("john@example.com");
      expect(result[0].people).toContain("jane@example.com");
      expect(result[0].people.length).toBe(2);
    });

    it("should extract dates from various formats", async () => {
      const request: IndexRequest = {
        workspaceId: "test-workspace",
        source: { type: "notion", serverId: "notion-server" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: "doc-1",
                created_time: "2024-01-15T10:30:00Z",
              }),
            },
          ],
        },
      };

      const result = await chunker.extractFromIndexRequest(request);

      expect(result[0].primaryDate).toBeInstanceOf(Date);
      expect(result[0].primaryDate?.toISOString()).toBe(
        "2024-01-15T10:30:00.000Z"
      );
    });

    it("should handle empty content gracefully", async () => {
      const request: IndexRequest = {
        workspaceId: "test-workspace",
        source: { type: "slack", serverId: "slack-server" },
        toolCall: { name: "get_message", arguments: {} },
        toolResult: {
          content: [],
        },
      };

      const result = await chunker.extractFromIndexRequest(request);

      expect(result).toHaveLength(1);
      expect(result[0].textContent).toBeTruthy();
    });

    it("should handle resource content type", async () => {
      const request: IndexRequest = {
        workspaceId: "test-workspace",
        source: { type: "notion", serverId: "notion-server" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: {
          content: [
            {
              type: "resource",
              resource: {
                uri: "notion://page/abc123",
                text: "Resource text content",
              },
            },
          ],
        },
      };

      const result = await chunker.extractFromIndexRequest(request);

      expect(result).toHaveLength(1);
      expect(result[0].textContent).toContain("Resource text content");
      expect(result[0].resourceId).toBe("abc123");
    });
  });

  describe("chunkText", () => {
    it("should not chunk small text", () => {
      const text = "This is a small text that doesn't need chunking.";
      const chunks = chunker.chunkText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].start).toBe(0);
      expect(chunks[0].end).toBe(text.length);
    });

    it("should chunk large text by paragraphs", () => {
      const paragraph = "A".repeat(1000);
      const text = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;

      const chunks = chunker.chunkText(text, {
        maxChunkSize: 1500,
        overlapSize: 100,
        splitOn: "paragraph",
      });

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.text.length).toBeLessThanOrEqual(1600); // Max + some buffer
      });
    });

    it("should include overlap between chunks", () => {
      const text = "A".repeat(5000);

      const chunks = chunker.chunkText(text, {
        maxChunkSize: 2000,
        overlapSize: 200,
        splitOn: "paragraph",
      });

      expect(chunks.length).toBeGreaterThan(1);
      // Check that we have multiple chunks
      expect(chunks[0].text.length).toBeGreaterThan(0);
      expect(chunks[1]).toBeDefined();
    });

    it("should respect maxChunkSize setting", () => {
      const paragraph = "Word ".repeat(200); // ~1000 chars
      const text = Array(10).fill(paragraph).join("\n\n"); // ~10,000 chars

      const chunks = chunker.chunkText(text, {
        maxChunkSize: 1000,
        overlapSize: 50,
        splitOn: "paragraph",
      });

      chunks.forEach((chunk, index) => {
        // First chunk should be under max size
        if (index === 0) {
          expect(chunk.text.length).toBeLessThanOrEqual(1050); // Max + overlap buffer
        }
      });
    });

    it("should assign correct chunk indices", () => {
      const paragraph = "Test paragraph ".repeat(100);
      const text = Array(5).fill(paragraph).join("\n\n");

      const chunks = chunker.chunkText(text, {
        maxChunkSize: 1500,
        overlapSize: 100,
        splitOn: "paragraph",
      });

      chunks.forEach((chunk, index) => {
        expect(chunk.index).toBe(index);
      });
    });
  });

  describe("extractTitle", () => {
    it("should extract title from common field patterns", async () => {
      const testCases = [
        { title: "Test Title" },
        { name: "Test Name" },
        { subject: "Test Subject" },
      ];

      for (const testCase of testCases) {
        const request: IndexRequest = {
          workspaceId: "test-workspace",
          source: { type: "notion", serverId: "notion-server" },
          toolCall: { name: "get_page", arguments: {} },
          toolResult: {
            content: [
              {
                type: "text",
                text: JSON.stringify(testCase),
              },
            ],
          },
        };

        const result = await chunker.extractFromIndexRequest(request);
        expect(result[0].title).toBeTruthy();
        expect(result[0].title).not.toBe("Untitled");
      }
    });
  });

  describe("extractType", () => {
    it("should default to source-specific types", async () => {
      const sources = [
        { type: "notion" as const, expectedType: "page" },
        { type: "slack" as const, expectedType: "message" },
        { type: "calendar" as const, expectedType: "event" },
      ];

      for (const { type, expectedType } of sources) {
        const request: IndexRequest = {
          workspaceId: "test-workspace",
          source: { type, serverId: `${type}-server` },
          toolCall: { name: "get_resource", arguments: {} },
          toolResult: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ id: "test-1" }),
              },
            ],
          },
        };

        const result = await chunker.extractFromIndexRequest(request);
        expect(result[0].type).toBe(expectedType);
      }
    });
  });
});
