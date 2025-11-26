import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { EmbedderService } from "./embedder.js";
import OpenAI from "openai";

describe("EmbedderService", () => {
  let embedder: EmbedderService;
  let mockClient: jest.Mocked<OpenAI>;

  beforeEach(() => {
    mockClient = {
      embeddings: {
        create: jest.fn(),
      },
    } as any;

    embedder = new EmbedderService({
      client: mockClient,
      model: "text-embedding-3-small",
      dimension: 1024,
    });
  });

  describe("embed", () => {
    it("should generate embedding for single text", async () => {
      const mockEmbedding = Array(1024).fill(0.1);
      mockClient.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      } as any);

      const result = await embedder.embed("test text");

      expect(result).toEqual(mockEmbedding);
      expect(result.length).toBe(1024);
      expect(mockClient.embeddings.create).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        input: ["test text"],
      });
    });

    it("should throw on dimension mismatch", async () => {
      const wrongDimension = Array(512).fill(0.1);
      mockClient.embeddings.create.mockResolvedValue({
        data: [{ embedding: wrongDimension }],
      } as any);

      await expect(embedder.embed("test")).rejects.toThrow();
    });

    it("should handle API errors gracefully", async () => {
      mockClient.embeddings.create.mockRejectedValue(
        new Error("API rate limit exceeded")
      );

      await expect(embedder.embed("test")).rejects.toThrow(
        "API rate limit exceeded"
      );
    });

    it("should handle empty string", async () => {
      const mockEmbedding = Array(1024).fill(0.0);
      mockClient.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      } as any);

      const result = await embedder.embed("");

      expect(result).toEqual(mockEmbedding);
      expect(mockClient.embeddings.create).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        input: [""],
      });
    });
  });

  describe("embedBatch", () => {
    it("should generate embeddings for multiple texts", async () => {
      const mockEmbeddings = [Array(1024).fill(0.1), Array(1024).fill(0.2)];
      mockClient.embeddings.create.mockResolvedValue({
        data: mockEmbeddings.map((e) => ({ embedding: e })),
      } as any);

      const result = await embedder.embedBatch(["text1", "text2"]);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockEmbeddings[0]);
      expect(result[1]).toEqual(mockEmbeddings[1]);
      expect(mockClient.embeddings.create).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        input: ["text1", "text2"],
      });
    });

    it("should return empty array for empty input", async () => {
      const result = await embedder.embedBatch([]);

      expect(result).toEqual([]);
      expect(mockClient.embeddings.create).not.toHaveBeenCalled();
    });

    it("should validate dimensions for all embeddings", async () => {
      const mockEmbeddings = [
        Array(1024).fill(0.1),
        Array(512).fill(0.2), // Wrong dimension
      ];
      mockClient.embeddings.create.mockResolvedValue({
        data: mockEmbeddings.map((e) => ({ embedding: e })),
      } as any);

      await expect(embedder.embedBatch(["text1", "text2"])).rejects.toThrow();
    });

    it("should handle batch of 100 texts", async () => {
      const texts = Array(100)
        .fill(null)
        .map((_, i) => `text ${i}`);
      const mockEmbeddings = texts.map(() => Array(1024).fill(0.1));

      mockClient.embeddings.create.mockResolvedValue({
        data: mockEmbeddings.map((e) => ({ embedding: e })),
      } as any);

      const result = await embedder.embedBatch(texts);

      expect(result).toHaveLength(100);
      expect(mockClient.embeddings.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("embedWithPreprocessing", () => {
    it("should preprocess long text by truncating", async () => {
      const longText = "A".repeat(50000);
      const mockEmbedding = Array(1024).fill(0.1);
      mockClient.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      } as any);

      await embedder.embedWithPreprocessing(longText);

      const callArgs = mockClient.embeddings.create.mock.calls[0][0];
      expect(callArgs.input[0].length).toBeLessThan(longText.length);
      expect(callArgs.input[0].length).toBeLessThanOrEqual(30000);
    });

    it("should trim whitespace", async () => {
      const textWithWhitespace = "   test text   ";
      const mockEmbedding = Array(1024).fill(0.1);
      mockClient.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      } as any);

      await embedder.embedWithPreprocessing(textWithWhitespace);

      const callArgs = mockClient.embeddings.create.mock.calls[0][0];
      expect(callArgs.input[0]).toBe("test text");
    });

    it("should handle normal length text", async () => {
      const normalText = "This is a normal length text.";
      const mockEmbedding = Array(1024).fill(0.1);
      mockClient.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      } as any);

      await embedder.embedWithPreprocessing(normalText);

      const callArgs = mockClient.embeddings.create.mock.calls[0][0];
      expect(callArgs.input[0]).toBe(normalText);
    });
  });

  describe("embedBatchWithPreprocessing", () => {
    it("should preprocess all texts in batch", async () => {
      const texts = [
        "  text1  ",
        "text2",
        "A".repeat(50000), // Very long
      ];
      const mockEmbeddings = [
        Array(1024).fill(0.1),
        Array(1024).fill(0.2),
        Array(1024).fill(0.3),
      ];
      mockClient.embeddings.create.mockResolvedValue({
        data: mockEmbeddings.map((e) => ({ embedding: e })),
      } as any);

      const result = await embedder.embedBatchWithPreprocessing(texts);

      expect(result).toHaveLength(3);
      const callArgs = mockClient.embeddings.create.mock.calls[0][0];
      expect(callArgs.input[0]).toBe("text1"); // Trimmed
      expect(callArgs.input[1]).toBe("text2");
      expect(callArgs.input[2].length).toBeLessThanOrEqual(30000); // Truncated
    });
  });

  describe("getDimension", () => {
    it("should return configured dimension", () => {
      const dimension = embedder.getDimension();
      expect(dimension).toBe(1024);
    });

    it("should work with custom dimension", () => {
      const customEmbedder = new EmbedderService({
        client: mockClient,
        model: "text-embedding-3-large",
        dimension: 3072,
      });

      expect(customEmbedder.getDimension()).toBe(3072);
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      mockClient.embeddings.create.mockRejectedValue(
        new Error("Network error: ECONNREFUSED")
      );

      await expect(embedder.embed("test")).rejects.toThrow("Network error");
    });

    it("should handle invalid API key", async () => {
      mockClient.embeddings.create.mockRejectedValue(
        new Error("Invalid API key")
      );

      await expect(embedder.embed("test")).rejects.toThrow("Invalid API key");
    });

    it("should handle timeout", async () => {
      mockClient.embeddings.create.mockRejectedValue(
        new Error("Request timeout")
      );

      await expect(embedder.embed("test")).rejects.toThrow("Request timeout");
    });
  });

  describe("edge cases", () => {
    it("should handle special characters", async () => {
      const specialText = "Test with émojis 🎉 and spëcial çhars";
      const mockEmbedding = Array(1024).fill(0.1);
      mockClient.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      } as any);

      const result = await embedder.embed(specialText);

      expect(result).toEqual(mockEmbedding);
      expect(mockClient.embeddings.create).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        input: [specialText],
      });
    });

    it("should handle newlines and tabs", async () => {
      const textWithWhitespace = "Line 1\nLine 2\tTab";
      const mockEmbedding = Array(1024).fill(0.1);
      mockClient.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      } as any);

      const result = await embedder.embed(textWithWhitespace);

      expect(result).toEqual(mockEmbedding);
    });
  });
});
