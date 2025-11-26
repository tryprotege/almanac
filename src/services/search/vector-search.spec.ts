import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { VectorSearchService } from "./vector-search.service.js";
import { SearchQuery } from "../../contracts/search.contracts.js";

describe("VectorSearchService", () => {
  let service: VectorSearchService;
  let mockEmbedder: any;
  let mockQdrant: any;
  let mockMongo: any;

  beforeEach(() => {
    mockEmbedder = {
      embed: jest.fn(),
    };

    mockQdrant = {
      search: jest.fn(),
      searchWithMongoFilter: jest.fn(),
    };

    mockMongo = {
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    service = new VectorSearchService(mockEmbedder, mockQdrant, mockMongo);
  });

  describe("search", () => {
    it("should perform vector search without filters", async () => {
      const mockVector = Array(1024).fill(0.1);
      mockEmbedder.embed.mockResolvedValue(mockVector);

      mockQdrant.search.mockResolvedValue([
        {
          id: "vec-1",
          score: 0.95,
          payload: { mongoId: "doc-1", workspaceId: "ws-1" },
        },
      ]);

      mockMongo.findByIds.mockResolvedValue([
        {
          _id: "doc-1",
          title: "Test Document",
          textContent: "Test content",
          source: "notion",
          type: "page",
          primaryDate: new Date("2024-01-01"),
          people: ["test@example.com"],
          attributes: {},
        },
      ]);

      const query: SearchQuery = {
        text: "test query",
        workspaceId: "ws-1",
      };

      const results = await service.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("doc-1");
      expect(results[0].score).toBe(0.95);
      expect(results[0].title).toBe("Test Document");
      expect(mockEmbedder.embed).toHaveBeenCalledWith("test query");
      expect(mockQdrant.search).toHaveBeenCalled();
    });

    it("should apply MongoDB pre-filtering when filters provided", async () => {
      const mockVector = Array(1024).fill(0.1);
      mockEmbedder.embed.mockResolvedValue(mockVector);

      mockMongo.find.mockResolvedValue([{ _id: "doc-1" }, { _id: "doc-2" }]);

      mockQdrant.searchWithMongoFilter.mockResolvedValue([
        {
          id: "vec-1",
          score: 0.9,
          payload: { mongoId: "doc-1", workspaceId: "ws-1" },
        },
      ]);

      mockMongo.findByIds.mockResolvedValue([
        {
          _id: "doc-1",
          title: "Filtered Doc",
          textContent: "Content",
          source: "notion",
          type: "page",
          primaryDate: null,
          people: [],
          attributes: {},
        },
      ]);

      const query: SearchQuery = {
        text: "test query",
        workspaceId: "ws-1",
        filters: {
          sources: ["notion"],
          types: ["page"],
        },
      };

      const results = await service.search(query);

      expect(results).toHaveLength(1);
      expect(mockMongo.find).toHaveBeenCalled();
      expect(mockQdrant.searchWithMongoFilter).toHaveBeenCalledWith(
        "ws-1",
        mockVector,
        ["doc-1", "doc-2"],
        expect.any(Object)
      );
    });

    it("should handle empty results", async () => {
      mockEmbedder.embed.mockResolvedValue(Array(1024).fill(0.1));
      mockQdrant.search.mockResolvedValue([]);

      const query: SearchQuery = {
        text: "query with no results",
        workspaceId: "ws-1",
      };

      const results = await service.search(query);

      expect(results).toHaveLength(0);
    });

    it("should apply score threshold", async () => {
      const mockVector = Array(1024).fill(0.1);
      mockEmbedder.embed.mockResolvedValue(mockVector);

      mockQdrant.search.mockResolvedValue([]);

      const query: SearchQuery = {
        text: "test query",
        workspaceId: "ws-1",
        scoreThreshold: 0.8,
      };

      await service.search(query);

      expect(mockQdrant.search).toHaveBeenCalledWith(
        "ws-1",
        mockVector,
        expect.objectContaining({ scoreThreshold: 0.8 })
      );
    });

    it("should apply limit", async () => {
      const mockVector = Array(1024).fill(0.1);
      mockEmbedder.embed.mockResolvedValue(mockVector);

      mockQdrant.search.mockResolvedValue([]);

      const query: SearchQuery = {
        text: "test query",
        workspaceId: "ws-1",
        limit: 10,
      };

      await service.search(query);

      expect(mockQdrant.search).toHaveBeenCalledWith(
        "ws-1",
        mockVector,
        expect.objectContaining({ limit: 10 })
      );
    });

    it("should filter by source", async () => {
      mockEmbedder.embed.mockResolvedValue(Array(1024).fill(0.1));

      mockMongo.find.mockResolvedValue([{ _id: "doc-1" }]);
      mockQdrant.searchWithMongoFilter.mockResolvedValue([]);
      mockMongo.findByIds.mockResolvedValue([]);

      const query: SearchQuery = {
        text: "test",
        workspaceId: "ws-1",
        filters: { sources: ["slack", "notion"] },
      };

      await service.search(query);

      expect(mockMongo.find).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          source: { $in: ["slack", "notion"] },
        }),
        expect.any(Object)
      );
    });

    it("should filter by people", async () => {
      mockEmbedder.embed.mockResolvedValue(Array(1024).fill(0.1));

      mockMongo.find.mockResolvedValue([{ _id: "doc-1" }]);
      mockQdrant.searchWithMongoFilter.mockResolvedValue([]);
      mockMongo.findByIds.mockResolvedValue([]);

      const query: SearchQuery = {
        text: "test",
        workspaceId: "ws-1",
        filters: {
          people: ["alice@example.com"],
        },
      };

      await service.search(query);

      expect(mockMongo.find).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          people: { $in: ["alice@example.com"] },
        }),
        expect.any(Object)
      );
    });

    it("should filter by date range", async () => {
      mockEmbedder.embed.mockResolvedValue(Array(1024).fill(0.1));

      mockMongo.find.mockResolvedValue([{ _id: "doc-1" }]);
      mockQdrant.searchWithMongoFilter.mockResolvedValue([]);
      mockMongo.findByIds.mockResolvedValue([]);

      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");

      const query: SearchQuery = {
        text: "test",
        workspaceId: "ws-1",
        filters: {
          dateRange: { start: startDate, end: endDate },
        },
      };

      await service.search(query);

      expect(mockMongo.find).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          primaryDate: { $gte: startDate, $lte: endDate },
        }),
        expect.any(Object)
      );
    });

    it("should hydrate results with full document data", async () => {
      mockEmbedder.embed.mockResolvedValue(Array(1024).fill(0.1));

      mockQdrant.search.mockResolvedValue([
        {
          id: "vec-1",
          score: 0.95,
          payload: { mongoId: "doc-1", workspaceId: "ws-1" },
        },
        {
          id: "vec-2",
          score: 0.9,
          payload: { mongoId: "doc-2", workspaceId: "ws-1" },
        },
      ]);

      const mockDocs = [
        {
          _id: "doc-1",
          title: "Doc 1",
          textContent: "Content 1",
          source: "notion",
          type: "page",
          primaryDate: new Date(),
          people: ["user1@example.com"],
          attributes: { key: "value1" },
        },
        {
          _id: "doc-2",
          title: "Doc 2",
          textContent: "Content 2",
          source: "slack",
          type: "message",
          primaryDate: new Date(),
          people: ["user2@example.com"],
          attributes: { key: "value2" },
        },
      ];

      mockMongo.findByIds.mockResolvedValue(mockDocs);

      const query: SearchQuery = {
        text: "test",
        workspaceId: "ws-1",
      };

      const results = await service.search(query);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("doc-1");
      expect(results[0].title).toBe("Doc 1");
      expect(results[0].attributes).toEqual({ key: "value1" });
      expect(results[1].id).toBe("doc-2");
      expect(results[1].title).toBe("Doc 2");
    });

    it("should handle missing documents gracefully", async () => {
      mockEmbedder.embed.mockResolvedValue(Array(1024).fill(0.1));

      mockQdrant.search.mockResolvedValue([
        {
          id: "vec-1",
          score: 0.95,
          payload: { mongoId: "doc-1", workspaceId: "ws-1" },
        },
        {
          id: "vec-2",
          score: 0.9,
          payload: { mongoId: "doc-2", workspaceId: "ws-1" },
        },
      ]);

      // Only one document found
      mockMongo.findByIds.mockResolvedValue([
        {
          _id: "doc-1",
          title: "Doc 1",
          textContent: "Content 1",
          source: "notion",
          type: "page",
          primaryDate: null,
          people: [],
          attributes: {},
        },
      ]);

      const query: SearchQuery = {
        text: "test",
        workspaceId: "ws-1",
      };

      const results = await service.search(query);

      // Should only return the found document
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("doc-1");
    });

    it("should deduplicate MongoDB IDs", async () => {
      mockEmbedder.embed.mockResolvedValue(Array(1024).fill(0.1));

      // Multiple vector chunks pointing to same document
      mockQdrant.search.mockResolvedValue([
        {
          id: "vec-1",
          score: 0.95,
          payload: { mongoId: "doc-1", workspaceId: "ws-1" },
        },
        {
          id: "vec-2",
          score: 0.9,
          payload: { mongoId: "doc-1", workspaceId: "ws-1" },
        },
      ]);

      mockMongo.findByIds.mockResolvedValue([
        {
          _id: "doc-1",
          title: "Doc 1",
          textContent: "Content",
          source: "notion",
          type: "page",
          primaryDate: null,
          people: [],
          attributes: {},
        },
      ]);

      const query: SearchQuery = {
        text: "test",
        workspaceId: "ws-1",
      };

      await service.search(query);

      // Should only query MongoDB once for doc-1
      expect(mockMongo.findByIds).toHaveBeenCalledWith("ws-1", ["doc-1"]);
    });
  });
});
