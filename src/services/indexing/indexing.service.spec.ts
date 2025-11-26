import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { IndexingService } from "./indexing.service.js";
import { IndexRequest } from "../../contracts/index.js";

describe("IndexingService", () => {
  let service: IndexingService;
  let mockMongo: any;
  let mockQdrant: any;
  let mockMemgraph: any;
  let mockChunker: any;
  let mockEmbedder: any;

  beforeEach(() => {
    mockMongo = {
      saveResource: jest.fn().mockResolvedValue(undefined),
      findByIds: jest.fn().mockResolvedValue([]),
    };

    mockQdrant = {
      upsertPoints: jest.fn().mockResolvedValue(undefined),
      ensureWorkspaceCollection: jest.fn().mockResolvedValue(undefined),
    };

    mockMemgraph = {
      createNode: jest.fn().mockResolvedValue(undefined),
      createRelationships: jest.fn().mockResolvedValue(undefined),
    };

    mockChunker = {
      extractFromIndexRequest: jest.fn(),
      chunkText: jest.fn(),
    };

    mockEmbedder = {
      embedWithPreprocessing: jest.fn(),
      embedBatchWithPreprocessing: jest.fn(),
    };

    service = new IndexingService(
      mockMongo,
      mockQdrant,
      mockMemgraph,
      mockChunker,
      mockEmbedder
    );
  });

  describe("index", () => {
    it("should index small document without chunking", async () => {
      const mockVector = Array(1024).fill(0.1);

      mockChunker.extractFromIndexRequest.mockResolvedValue([
        {
          id: "doc-1",
          source: "notion",
          resourceId: "page-123",
          type: "page",
          title: "Test Page",
          textContent: "Small text content",
          people: ["test@example.com"],
          primaryDate: new Date("2024-01-01"),
          attributes: {},
          relationships: [],
          rawData: {},
        },
      ]);

      mockEmbedder.embedWithPreprocessing.mockResolvedValue(mockVector);

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      const result = await service.index(request);

      expect(result.status).toBe("completed");
      expect(result.stats?.resourcesIndexed).toBe(1);
      expect(result.stats?.resourcesFailed).toBe(0);
      expect(mockMongo.saveResource).toHaveBeenCalled();
      expect(mockQdrant.upsertPoints).toHaveBeenCalled();
      expect(mockMemgraph.createNode).toHaveBeenCalled();
      expect(mockEmbedder.embedWithPreprocessing).toHaveBeenCalledWith(
        "Small text content"
      );
    });

    it("should chunk and index large documents", async () => {
      const largeText = "A".repeat(5000);
      const mockVectors = [
        Array(1024).fill(0.1),
        Array(1024).fill(0.2),
        Array(1024).fill(0.3),
      ];

      mockChunker.extractFromIndexRequest.mockResolvedValue([
        {
          id: "doc-1",
          source: "notion",
          resourceId: "page-123",
          type: "page",
          title: "Large Page",
          textContent: largeText,
          people: [],
          primaryDate: null,
          attributes: {},
          relationships: [],
          rawData: {},
        },
      ]);

      mockChunker.chunkText.mockReturnValue([
        { index: 0, text: "chunk1", start: 0, end: 2000 },
        { index: 1, text: "chunk2", start: 1800, end: 3800 },
        { index: 2, text: "chunk3", start: 3600, end: 5000 },
      ]);

      mockEmbedder.embedBatchWithPreprocessing.mockResolvedValue(mockVectors);

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      await service.index(request);

      expect(mockChunker.chunkText).toHaveBeenCalledWith(largeText);
      expect(mockEmbedder.embedBatchWithPreprocessing).toHaveBeenCalledWith([
        "chunk1",
        "chunk2",
        "chunk3",
      ]);
      expect(mockQdrant.upsertPoints).toHaveBeenCalled();

      const qdrantCall = mockQdrant.upsertPoints.mock.calls[0];
      expect(qdrantCall[1]).toHaveLength(3); // 3 vectors for 3 chunks
    });

    it("should create graph nodes and relationships", async () => {
      mockChunker.extractFromIndexRequest.mockResolvedValue([
        {
          id: "doc-1",
          source: "notion",
          resourceId: "page-123",
          type: "page",
          title: "Test",
          textContent: "Content",
          people: [],
          primaryDate: null,
          attributes: {},
          relationships: [
            {
              sourceId: "doc-1",
              targetId: "doc-2",
              type: "REFERENCES",
              confidence: 0.9,
              extractedBy: "explicit" as const,
            },
          ],
          rawData: {},
        },
      ]);

      mockEmbedder.embedWithPreprocessing.mockResolvedValue(
        Array(1024).fill(0.1)
      );

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      await service.index(request);

      expect(mockMemgraph.createNode).toHaveBeenCalled();
      expect(mockMemgraph.createRelationships).toHaveBeenCalled();

      const relationshipsCall = mockMemgraph.createRelationships.mock.calls[0];
      expect(relationshipsCall[1]).toHaveLength(1);
      expect(relationshipsCall[1][0].type).toBe("REFERENCES");
    });

    it("should handle indexing errors gracefully", async () => {
      mockChunker.extractFromIndexRequest.mockRejectedValue(
        new Error("Extraction failed")
      );

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      const result = await service.index(request);

      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Extraction failed");
    });

    it("should handle partial failures", async () => {
      mockChunker.extractFromIndexRequest.mockResolvedValue([
        {
          id: "doc-1",
          source: "notion",
          resourceId: "page-1",
          type: "page",
          title: "Page 1",
          textContent: "Content 1",
          people: [],
          primaryDate: null,
          attributes: {},
          relationships: [],
          rawData: {},
        },
        {
          id: "doc-2",
          source: "notion",
          resourceId: "page-2",
          type: "page",
          title: "Page 2",
          textContent: "Content 2",
          people: [],
          primaryDate: null,
          attributes: {},
          relationships: [],
          rawData: {},
        },
      ]);

      // First succeeds, second fails
      mockEmbedder.embedWithPreprocessing
        .mockResolvedValueOnce(Array(1024).fill(0.1))
        .mockRejectedValueOnce(new Error("Embedding failed"));

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      const result = await service.index(request);

      expect(result.status).toBe("completed");
      expect(result.stats?.resourcesIndexed).toBe(1);
      expect(result.stats?.resourcesFailed).toBe(1);
    });

    it("should include processing time in response", async () => {
      mockChunker.extractFromIndexRequest.mockResolvedValue([
        {
          id: "doc-1",
          source: "notion",
          resourceId: "page-1",
          type: "page",
          title: "Test",
          textContent: "Content",
          people: [],
          primaryDate: null,
          attributes: {},
          relationships: [],
          rawData: {},
        },
      ]);

      mockEmbedder.embedWithPreprocessing.mockResolvedValue(
        Array(1024).fill(0.1)
      );

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      const result = await service.index(request);

      expect(result.stats?.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.stats?.durationMs).toBe("number");
    });

    it("should generate unique job IDs", async () => {
      mockChunker.extractFromIndexRequest.mockResolvedValue([]);

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      const result1 = await service.index(request);
      const result2 = await service.index(request);

      expect(result1.jobId).not.toBe(result2.jobId);
    });
  });

  describe("indexBatch", () => {
    it("should process multiple requests", async () => {
      mockChunker.extractFromIndexRequest.mockResolvedValue([
        {
          id: "doc-1",
          source: "notion",
          resourceId: "page-1",
          type: "page",
          title: "Test",
          textContent: "Content",
          people: [],
          primaryDate: null,
          attributes: {},
          relationships: [],
          rawData: {},
        },
      ]);

      mockEmbedder.embedWithPreprocessing.mockResolvedValue(
        Array(1024).fill(0.1)
      );

      const requests: IndexRequest[] = [
        {
          workspaceId: "ws-1",
          source: { type: "notion", serverId: "notion" },
          toolCall: { name: "get_page", arguments: {} },
          toolResult: { content: [] },
        },
        {
          workspaceId: "ws-1",
          source: { type: "slack", serverId: "slack" },
          toolCall: { name: "get_message", arguments: {} },
          toolResult: { content: [] },
        },
      ];

      const results = await service.indexBatch(requests);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe("completed");
      expect(results[1].status).toBe("completed");
    });

    it("should handle empty batch", async () => {
      const results = await service.indexBatch([]);
      expect(results).toHaveLength(0);
    });

    it("should process batches in parallel", async () => {
      mockChunker.extractFromIndexRequest.mockResolvedValue([]);

      const requests = Array(5)
        .fill(null)
        .map(
          (): IndexRequest => ({
            workspaceId: "ws-1",
            source: { type: "notion", serverId: "notion" },
            toolCall: { name: "get_page", arguments: {} },
            toolResult: { content: [] },
          })
        );

      const startTime = Date.now();
      await service.indexBatch(requests);
      const duration = Date.now() - startTime;

      // Should be much faster than sequential (< 100ms for empty batch)
      expect(duration).toBeLessThan(500);
    });
  });

  describe("resource processing", () => {
    it("should handle resources with people", async () => {
      mockChunker.extractFromIndexRequest.mockResolvedValue([
        {
          id: "doc-1",
          source: "notion",
          resourceId: "page-1",
          type: "page",
          title: "Team Page",
          textContent: "Content",
          people: ["alice@example.com", "bob@example.com"],
          primaryDate: new Date(),
          attributes: {},
          relationships: [],
          rawData: {},
        },
      ]);

      mockEmbedder.embedWithPreprocessing.mockResolvedValue(
        Array(1024).fill(0.1)
      );

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      await service.index(request);

      const mongoCall = mockMongo.saveResource.mock.calls[0][0];
      expect(mongoCall.people).toEqual([
        "alice@example.com",
        "bob@example.com",
      ]);
    });

    it("should handle resources with attributes", async () => {
      const customAttributes = {
        priority: "high",
        tags: ["urgent", "review"],
        customField: "value",
      };

      mockChunker.extractFromIndexRequest.mockResolvedValue([
        {
          id: "doc-1",
          source: "notion",
          resourceId: "page-1",
          type: "page",
          title: "Task",
          textContent: "Content",
          people: [],
          primaryDate: null,
          attributes: customAttributes,
          relationships: [],
          rawData: {},
        },
      ]);

      mockEmbedder.embedWithPreprocessing.mockResolvedValue(
        Array(1024).fill(0.1)
      );

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      await service.index(request);

      const mongoCall = mockMongo.saveResource.mock.calls[0][0];
      expect(mongoCall.attributes).toEqual(customAttributes);
    });

    it("should preserve raw data", async () => {
      const rawData = { original: "original data", parsed: { key: "value" } };

      mockChunker.extractFromIndexRequest.mockResolvedValue([
        {
          id: "doc-1",
          source: "notion",
          resourceId: "page-1",
          type: "page",
          title: "Page",
          textContent: "Content",
          people: [],
          primaryDate: null,
          attributes: {},
          relationships: [],
          rawData,
        },
      ]);

      mockEmbedder.embedWithPreprocessing.mockResolvedValue(
        Array(1024).fill(0.1)
      );

      const request: IndexRequest = {
        workspaceId: "ws-1",
        source: { type: "notion", serverId: "notion" },
        toolCall: { name: "get_page", arguments: {} },
        toolResult: { content: [] },
      };

      await service.index(request);

      const mongoCall = mockMongo.saveResource.mock.calls[0][0];
      expect(mongoCall.rawData).toEqual(rawData);
    });
  });
});
