import { randomUUID } from "crypto";
import {
  MongoResource,
  QdrantPoint,
  MemgraphNode,
  MemgraphRelationship,
  generateMongoId,
  IndexRequest,
  IndexResponse,
} from "../../types/index.js";
import { DocumentStore } from "../../stores/document.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { GraphStore } from "../../stores/graph.store.js";
import { GraphSchemaStore } from "../../stores/graph-schema.store.js";
import { ChunkerService } from "./chunker.js";
import { EmbedderService } from "./embedder.js";
import { LLMService } from "../llm/llm.service.js";
import { SchemaLearningService } from "../schema/schema-learning.service.js";

/**
 * Enhanced indexing service with LLM-based relationship extraction
 * and dynamic schema learning (single-tenant)
 */
export class IndexingWithLLMService {
  constructor(
    private documentStore: DocumentStore,
    private vectorStore: VectorStore,
    private graphStore: GraphStore,
    private schemaStore: GraphSchemaStore,
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
      console.log(`[${jobId}] Starting indexing with LLM`);

      // Step 1: Get or create graph schema
      const schema = await this.schemaStore.getOrCreateSchema();

      // Step 2: Learn schema from MCP data
      if (schema.extractionRules.autoExtractEntities) {
        const learnedEntityTypes =
          this.schemaLearner.extractEntityTypes(request);
        if (learnedEntityTypes.length > 0) {
          console.log(
            `[${jobId}] Learned ${learnedEntityTypes.length} new entity types`
          );
          await this.schemaStore.updateEntityTypes(learnedEntityTypes);
        }
      }

      if (schema.extractionRules.autoExtractRelationships) {
        const learnedRelTypes =
          this.schemaLearner.extractRelationshipTypes(request);
        if (learnedRelTypes.length > 0) {
          console.log(
            `[${jobId}] Learned ${learnedRelTypes.length} new relationship types`
          );
          await this.schemaStore.updateRelationshipTypes(learnedRelTypes);
        }
      }

      // Refresh schema after learning
      const updatedSchema = await this.schemaStore.getSchema();

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
    extracted: any,
    sourceType: string,
    schema: any
  ): Promise<void> {
    const mongoId = generateMongoId(sourceType as any, extracted.resourceId);

    // Check if resource needs chunking
    const needsChunking = extracted.textContent.length > 2000;

    if (needsChunking) {
      await this.processWithChunking(extracted, mongoId);
    } else {
      await this.processSingleDocument(extracted, mongoId);
    }

    // Create graph node
    const node: MemgraphNode = {
      label: "",
      id: mongoId,
      type: extracted.type,
      title: extracted.title,
    };

    await this.graphStore.createNode(node);

    // Extract relationships using LLM
    if (schema.extractionRules.autoExtractRelationships) {
      await this.extractAndCreateRelationships(mongoId, extracted, schema);
    }
  }

  /**
   * Extract relationships using LLM and create them in graph
   */
  private async extractAndCreateRelationships(
    sourceId: string,
    extracted: any,
    schema: any
  ): Promise<void> {
    // Get recent resources to compare against
    const recentResources = await this.documentStore.find(
      {},
      { limit: 50, sort: { indexedAt: -1 } }
    );

    if (recentResources.length === 0) return;

    // Prepare target resources for LLM
    const targetResources = recentResources
      .filter((r) => r._id !== sourceId) // Exclude self
      .map((r) => ({
        id: r._id!,
        title: r.metadata.title || "Untitled",
        type: r.type,
        content: r.content.text.substring(0, 500),
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

    await this.graphStore.createRelationships(memgraphRels);
  }

  /**
   * Process document without chunking
   */
  private async processSingleDocument(
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
      },
    };

    const mongoResource: MongoResource = {
      _id: mongoId,
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
      this.documentStore.save(mongoResource),
      this.vectorStore.upsertPoints([qdrantPoint]),
    ]);
  }

  /**
   * Process document with chunking
   */
  private async processWithChunking(
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
        chunkIndex: chunk.index,
        chunkStart: chunk.start,
        chunkEnd: chunk.end,
      },
    }));

    const mongoResource: MongoResource = {
      _id: mongoId,
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
      this.documentStore.save(mongoResource),
      this.vectorStore.upsertPoints(qdrantPoints),
    ]);
  }

  /**
   * Batch index multiple requests
   */
  async indexBatch(requests: IndexRequest[]): Promise<IndexResponse[]> {
    return Promise.all(requests.map((req) => this.index(req)));
  }
}
