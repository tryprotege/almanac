import { embed } from "../../utils/embedding.js";
import { QdrantRepository } from "../../repositories/qdrant.repository.js";
import { MongoRepository } from "../../repositories/mongo.repository.js";
import { SearchQuery, SearchResult } from "../../contracts/search.contracts.js";
import OpenAI from "openai";

/**
 * Vector Search Service
 * Performs semantic search using embeddings with optional metadata filtering
 */
export class VectorSearchService {
  constructor(
    private openaiClient: OpenAI,
    private embeddingModel: string,
    private qdrant: QdrantRepository,
    private mongo: MongoRepository
  ) {}

  /**
   * Main search method
   *
   * Implementation steps:
   * 1. Generate query embedding
   * 2. Apply MongoDB pre-filtering if filters provided
   * 3. Search Qdrant for similar vectors
   * 4. Hydrate results with full document data from MongoDB
   * 5. Return enriched results
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const startTime = Date.now();
    console.log(`[VectorSearch] Query: "${query.text}"`);

    // Step 1 - Generate embedding for query
    const queryVector = (
      await embed(this.openaiClient, this.embeddingModel, [query.text])
    )[0];

    // Step 2 - Pre-filter with MongoDB if filters provided
    let mongoIds: string[] | undefined;
    if (query.filters && this.hasFilters(query.filters)) {
      mongoIds = await this.preFilterWithMongo(query);
      console.log(
        `[VectorSearch] Pre-filtered to ${mongoIds.length} candidates`
      );
    }

    // Step 3 - Vector search
    const vectorResults = mongoIds
      ? await this.qdrant.searchWithMongoFilter(
          query.workspaceId,
          queryVector,
          mongoIds,
          {
            limit: query.limit || 50,
            scoreThreshold: query.scoreThreshold || 0.6,
          }
        )
      : await this.qdrant.search(query.workspaceId, queryVector, {
          limit: query.limit || 50,
          scoreThreshold: query.scoreThreshold || 0.6,
        });

    console.log(`[VectorSearch] Found ${vectorResults.length} vector matches`);

    // Step 4 - Hydrate with MongoDB data
    const results = await this.hydrateResults(query.workspaceId, vectorResults);

    const duration = Date.now() - startTime;
    console.log(`[VectorSearch] Completed in ${duration}ms`);

    return results;
  }

  /**
   * Pre-filter candidates using MongoDB metadata
   * This reduces the search space for Qdrant
   */
  private async preFilterWithMongo(query: SearchQuery): Promise<string[]> {
    const filter: any = {};

    if (query.filters?.sources) {
      filter.source = { $in: query.filters.sources };
    }

    if (query.filters?.types) {
      filter.type = { $in: query.filters.types };
    }

    if (query.filters?.people) {
      filter.people = { $in: query.filters.people };
    }

    if (query.filters?.dateRange) {
      filter.primaryDate = {
        $gte: query.filters.dateRange.start,
        $lte: query.filters.dateRange.end,
      };
    }

    // Query MongoDB with filters
    const resources = await this.mongo.find(query.workspaceId, filter, {
      limit: 1000, // Reasonable cap
    });

    return resources.map((r) => r._id);
  }

  /**
   * Hydrate vector search results with full document data
   */
  private async hydrateResults(
    workspaceId: string,
    vectorResults: Array<{ id: string; score: number; payload: any }>
  ): Promise<SearchResult[]> {
    // Extract unique MongoDB IDs from vector results
    const mongoIds = Array.from(
      new Set(vectorResults.map((r) => r.payload.mongoId))
    );

    // Batch fetch from MongoDB
    const resources = await this.mongo.findByIds(workspaceId, mongoIds);
    const resourceMap = new Map(resources.map((r) => [r._id, r]));

    // Combine vector scores with document data
    const results: SearchResult[] = [];

    for (const vr of vectorResults) {
      const resource = resourceMap.get(vr.payload.mongoId);
      if (!resource) continue;

      results.push({
        id: resource._id,
        score: vr.score,
        title: resource.title,
        textContent: resource.textContent,
        source: resource.source,
        type: resource.type,
        primaryDate: resource.primaryDate || undefined,
        people: resource.people,
        attributes: resource.attributes,
      });
    }

    return results;
  }

  /**
   * Check if query has any filters
   */
  private hasFilters(filters: SearchQuery["filters"]): boolean {
    if (!filters) return false;
    return !!(
      filters.sources?.length ||
      filters.types?.length ||
      filters.people?.length ||
      filters.dateRange
    );
  }
}
