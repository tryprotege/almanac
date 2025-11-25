import { randomUUID } from "crypto";
import {
  MongoResource,
  QdrantPoint,
  MemgraphNode,
  generateMongoId,
} from "../../types/index.js";
import { IndexRequest, IndexResponse } from "../../contracts/index.js";
import { MongoRepository } from "../../repositories/mongo.repository.js";
import { QdrantRepository } from "../../repositories/qdrant.repository.js";
import { MemgraphRepository } from "../../repositories/memgraph.repository.js";
import { ChunkerService } from "./chunker.js";
import { EmbedderService } from "./embedder.js";

/**
 * Main indexing service - Orchestrates the entire indexing pipeline
 */
export class IndexingService {
  constructor(
    private mongoRepo: MongoRepository,
    private qdrantRepo: QdrantRepository,
    private memgraphRepo: MemgraphRepository,
    private chunker: ChunkerService,
    private embedder: EmbedderService
  ) {}

  /**
   * Index a single request
   */
  async index(request: IndexRequest): Promise<IndexResponse> {
    const jobId = randomUUID();
    const startTime = Date.now();

    try {
      console.log(
        `[${jobId}] Starting indexing for workspace: ${request.workspaceId}`
      );

      // Step 1: Extract resources from MCP tool result
      const extractedResources = await this.chunker.extractFromIndexRequest(
        request
      );

      console.log(
        `[${jobId}] Extracted ${extractedResources.length} resources`
      );

      // Step 2: Process each resource
      let indexed = 0;
      let failed = 0;

      for (const extracted of extractedResources) {
        try {
          await this.processResource(
            request.workspaceId,
            extracted,
            request.source.type
          );
          indexed++;
        } catch (error) {
          console.error(
            `[${jobId}] Failed to process resource ${extracted.id}:`,
            error
          );
          failed++;
        }
      }

      const durationMs = Date.now() - startTime;

      console.log(
        `[${jobId}] Completed: ${indexed} indexed, ${failed} failed in ${durationMs}ms`
      );

      return {
        jobId,
        status: "completed",
        stats: {
          resourcesProcessed: extractedResources.length,
          resourcesIndexed: indexed,
          resourcesFailed: failed,
          durationMs,
        },
      };
    } catch (error) {
      console.error(`[${jobId}] Indexing job failed:`, error);

      return {
        jobId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process a single extracted resource
   */
  private async processResource(
    workspaceId: string,
    extracted: any,
    sourceType: string
  ): Promise<void> {
    const mongoId = generateMongoId(sourceType as any, extracted.resourceId);

    // Check if resource needs chunking
    const needsChunking = extracted.textContent.length > 2000;

    if (needsChunking) {
      // Process with chunking
      await this.processWithChunking(workspaceId, extracted, mongoId);
    } else {
      // Process without chunking (single document)
      await this.processSingleDocument(workspaceId, extracted, mongoId);
    }

    // Create graph node
    const node: MemgraphNode = {
      label: "", // Will be set by repository
      id: mongoId,
      type: extracted.type,
      title: extracted.title,
    };

    await this.memgraphRepo.createNode(workspaceId, node);

    // Create relationships if any
    if (extracted.relationships && extracted.relationships.length > 0) {
      await this.memgraphRepo.createRelationships(
        workspaceId,
        extracted.relationships
      );
    }
  }

  /**
   * Process document without chunking
   */
  private async processSingleDocument(
    workspaceId: string,
    extracted: any,
    mongoId: string
  ): Promise<void> {
    // Generate embedding
    const vector = await this.embedder.embedWithPreprocessing(
      extracted.textContent
    );

    // Create Qdrant point
    const qdrantId = randomUUID();
    const qdrantPoint: QdrantPoint = {
      id: qdrantId,
      vector,
      payload: {
        mongoId,
        workspaceId,
      },
    };

    // Create MongoDB resource
    const mongoResource: MongoResource = {
      _id: mongoId,
      workspaceId,
      source: extracted.source,
      resourceId: extracted.resourceId,
      type: extracted.type,
      title: extracted.title,
      textContent: extracted.textContent,
      people: extracted.people,
      primaryDate: extracted.primaryDate,
      attributes: extracted.attributes,
      rawData: extracted.rawData,
      qdrantIds: [qdrantId],
      embeddingVersion: 1,
      indexedAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to all databases
    await Promise.all([
      this.mongoRepo.saveResource(mongoResource),
      this.qdrantRepo.upsertPoints(workspaceId, [qdrantPoint]),
    ]);
  }

  /**
   * Process document with chunking
   */
  private async processWithChunking(
    workspaceId: string,
    extracted: any,
    mongoId: string
  ): Promise<void> {
    // Chunk the text
    const chunks = this.chunker.chunkText(extracted.textContent);

    console.log(`Chunking document ${mongoId} into ${chunks.length} chunks`);

    // Generate embeddings for all chunks
    const chunkTexts = chunks.map((c) => c.text);
    const vectors = await this.embedder.embedBatchWithPreprocessing(chunkTexts);

    // Create Qdrant points for each chunk
    const qdrantPoints: QdrantPoint[] = chunks.map((chunk, idx) => ({
      id: randomUUID(),
      vector: vectors[idx],
      payload: {
        mongoId,
        workspaceId,
        chunkIndex: chunk.index,
        chunkStart: chunk.start,
        chunkEnd: chunk.end,
      },
    }));

    // Create MongoDB resource
    const mongoResource: MongoResource = {
      _id: mongoId,
      workspaceId,
      source: extracted.source,
      resourceId: extracted.resourceId,
      type: extracted.type,
      title: extracted.title,
      textContent: extracted.textContent, // Store full content
      people: extracted.people,
      primaryDate: extracted.primaryDate,
      attributes: extracted.attributes,
      rawData: extracted.rawData,
      qdrantIds: qdrantPoints.map((p) => p.id),
      embeddingVersion: 1,
      indexedAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to all databases
    await Promise.all([
      this.mongoRepo.saveResource(mongoResource),
      this.qdrantRepo.upsertPoints(workspaceId, qdrantPoints),
    ]);
  }

  /**
   * Batch index multiple requests
   */
  async indexBatch(requests: IndexRequest[]): Promise<IndexResponse[]> {
    return Promise.all(requests.map((req) => this.index(req)));
  }
}
