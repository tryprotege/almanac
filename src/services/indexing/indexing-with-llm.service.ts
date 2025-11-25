import { randomUUID } from "crypto";
import {
  MongoResource,
  QdrantPoint,
  MemgraphNode,
  MemgraphRelationship,
  generateMongoId,
} from "../../types/index.js";
import { IndexRequest, IndexResponse } from "../../contracts/index.js";
import { MongoRepository } from "../../repositories/mongo.repository.js";
import { QdrantRepository } from "../../repositories/qdrant.repository.js";
import { MemgraphRepository } from "../../repositories/memgraph.repository.js";
import { GraphSchemaRepository } from "../../repositories/graph-schema.repository.js";
import { ChunkerService } from "./chunker.js";
import { EmbedderService } from "./embedder.js";
import { LLMService } from "../llm/llm.service.js";
import { SchemaLearningService } from "../schema/schema-learning.service.js";

/**
 * Enhanced indexing service with LLM-based relationship extraction
 * and dynamic schema learning
 */
export class IndexingWithLLMService {
  constructor(
    private mongoRepo: MongoRepository,
    private qdrantRepo: QdrantRepository,
    private memgraphRepo: MemgraphRepository,
    private schemaRepo: GraphSchemaRepository,
    private chunker: ChunkerService,
    private embedder: EmbedderService,
    private llm: LLMService,
    private schemaLearner: SchemaLearningService
  ) {}

  /**
   * Index a single request with schema learning and LLM extraction
   */
  async index(request: IndexRequest): Promise<IndexResponse> {
    const jobId = randomUUID();
    const startTime = Date.now();

    try {
      console.log(
        `[${jobId}] Starting indexing with LLM for workspace: ${request.workspaceId}`
      );

      // Step 1: Get or create graph schema
      const schema = await this.schemaRepo.getOrCreateSchema(
        request.workspaceId
      );

      // Step 2: Learn schema from MCP data
      if (schema.extractionRules.autoExtractEntities) {
        const learnedEntityTypes =
          this.schemaLearner.extractEntityTypes(request);
        if (learnedEntityTypes.length > 0) {
          console.log(
            `[${jobId}] Learned ${learnedEntityTypes.length} new entity types`
          );
          await this.schemaRepo.updateEntityTypes(
            request.workspaceId,
            learnedEntityTypes
          );
        }
      }

      if (schema.extractionRules.autoExtractRelationships) {
        const learnedRelTypes =
          this.schemaLearner.extractRelationshipTypes(request);
        if (learnedRelTypes.length > 0) {
          console.log(
            `[${jobId}] Learned ${learnedRelTypes.length} new relationship types`
          );
          await this.schemaRepo.updateRelationshipTypes(
            request.workspaceId,
            learnedRelTypes
          );
        }
      }

      // Refresh schema after learning
      const updatedSchema = await this.schemaRepo.getSchema(
        request.workspaceId
      );

      // Step 3: Extract resources from MCP tool result
      const extractedResources = await this.chunker.extractFromIndexRequest(
        request
      );

      console.log(
        `[${jobId}] Extracted ${extractedResources.length} resources`
      );

      // Step 4: Process each resource
      let indexed = 0;
      let failed = 0;

      for (const extracted of extractedResources) {
        try {
          await this.processResourceWithLLM(
            request.workspaceId,
            extracted,
            request.source.type,
            updatedSchema!
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
   * Process a single resource with LLM relationship extraction
   */
  private async processResourceWithLLM(
    workspaceId: string,
    extracted: any,
    sourceType: string,
    schema: any
  ): Promise<void> {
    const mongoId = generateMongoId(sourceType as any, extracted.resourceId);

    // Check if resource needs chunking
    const needsChunking = extracted.textContent.length > 2000;

    if (needsChunking) {
      await this.processWithChunking(workspaceId, extracted, mongoId);
    } else {
      await this.processSingleDocument(workspaceId, extracted, mongoId);
    }

    // Create graph node
    const node: MemgraphNode = {
      label: "",
      id: mongoId,
      type: extracted.type,
      title: extracted.title,
    };

    await this.memgraphRepo.createNode(workspaceId, node);

    // Extract relationships using LLM
    if (schema.extractionRules.autoExtractRelationships) {
      await this.extractAndCreateRelationships(
        workspaceId,
        mongoId,
        extracted,
        schema
      );
    }
  }

  /**
   * Extract relationships using LLM and create them in graph
   */
  private async extractAndCreateRelationships(
    workspaceId: string,
    sourceId: string,
    extracted: any,
    schema: any
  ): Promise<void> {
    // Get recent resources to compare against
    const recentResources = await this.mongoRepo.find(
      workspaceId,
      {},
      { limit: 50, sort: { indexedAt: -1 } }
    );

    if (recentResources.length === 0) return;

    // Prepare target resources for LLM
    const targetResources = recentResources
      .filter((r) => r._id !== sourceId) // Exclude self
      .map((r) => ({
        id: r._id,
        title: r.title,
        type: r.type,
        content: r.textContent.substring(0, 500),
      }));

    if (targetResources.length === 0) return;

    // Extract relationships using LLM
    const relationships = await this.llm.extractRelationships(
      sourceId,
      extracted.textContent,
      extracted.type,
      targetResources,
      schema.relationshipTypes
    );

    // Filter by confidence threshold
    const validRelationships = relationships.filter(
      (rel) => rel.confidence >= schema.extractionRules.confidenceThreshold
    );

    if (validRelationships.length === 0) return;

    console.log(
      `Extracted ${validRelationships.length} relationships for ${sourceId}`
    );

    // Create relationships in Memgraph
    const memgraphRels: MemgraphRelationship[] = validRelationships.map(
      (rel) => ({
        sourceId,
        targetId: rel.targetId,
        type: rel.type,
        confidence: rel.confidence,
        extractedBy: "llm" as const,
      })
    );

    await this.memgraphRepo.createRelationships(workspaceId, memgraphRels);
  }

  /**
   * Process document without chunking
   */
  private async processSingleDocument(
    workspaceId: string,
    extracted: any,
    mongoId: string
  ): Promise<void> {
    const vector = await this.embedder.embedWithPreprocessing(
      extracted.textContent
    );

    const qdrantId = randomUUID();
    const qdrantPoint: QdrantPoint = {
      id: qdrantId,
      vector,
      payload: {
        mongoId,
        workspaceId,
      },
    };

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
    const chunks = this.chunker.chunkText(extracted.textContent);

    console.log(`Chunking document ${mongoId} into ${chunks.length} chunks`);

    const chunkTexts = chunks.map((c) => c.text);
    const vectors = await this.embedder.embedBatchWithPreprocessing(chunkTexts);

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
      qdrantIds: qdrantPoints.map((p) => p.id),
      embeddingVersion: 1,
      indexedAt: new Date(),
      updatedAt: new Date(),
    };

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
