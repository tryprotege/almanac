/**
 * LightRAG Query Functions
 * Functional implementation of LightRAG without LLM generation
 * Returns structured chunks (entities, relationships, chunks)
 */

import { RecordModel, Record } from "../../models/record.model.js";
import { GraphStore } from "../../stores/graph.store.js";
import { VectorStore } from "../../stores/vector.store.js";
import { RecordStore } from "../../stores/record.store.js";
import { LLMService } from "../llm/llm.service.js";
import { RerankerService } from "../reranker/reranker.service.js";
import { embed } from "../../utils/embedding.js";
import OpenAI from "openai";
import {
  LightRAGQuery,
  LightRAGResponse,
  LightRAGChunk,
  LightRAGChunkFull,
  LightRAGEntity,
  LightRAGRelationship,
  ExtractedKeywords,
  LightRAGMode,
} from "../../types/lightrag.types.js";

// ============================================
// Dependencies Interface
// ============================================

export interface LightRAGDependencies {
  graphStore: GraphStore;
  vectorStore: VectorStore;
  recordStore: RecordStore;
  llm: LLMService;
  reranker: RerankerService;
  openaiClient: OpenAI;
  embeddingModel: string;
}

// ============================================
// Main Entry Point
// ============================================

export async function lightragQuery(
  query: LightRAGQuery,
  deps: LightRAGDependencies
): Promise<LightRAGResponse> {
  const startTime = Date.now();
  const mode = query.mode || "mix";
  const responseFormat = query.response_format || "compact";

  console.log(`\n[LightRAG] Query: "${query.query}" (mode: ${mode})`);

  // Apply defaults
  const params = applyDefaults(query);

  // Extract keywords for dual-level retrieval
  const keywords = await extractKeywords(query.query, deps.llm);
  console.log(
    `[LightRAG] Keywords - High: [${keywords.high_level.join(
      ", "
    )}], Low: [${keywords.low_level.join(", ")}]`
  );

  // Execute mode-specific retrieval
  let chunks: LightRAGChunk[];
  let vectorMatches = 0;
  let graphExpanded = 0;
  let reranked = false;

  switch (mode) {
    case "naive": {
      const result = await naiveMode(params, deps);
      chunks = result.chunks;
      vectorMatches = result.vectorMatches;
      break;
    }
    case "local": {
      const result = await localMode(params, keywords, deps);
      chunks = result.chunks;
      vectorMatches = result.vectorMatches;
      graphExpanded = result.graphExpanded;
      break;
    }
    case "global": {
      const result = await globalMode(params, keywords, deps);
      chunks = result.chunks;
      vectorMatches = result.vectorMatches;
      graphExpanded = result.graphExpanded;
      break;
    }
    case "hybrid": {
      const result = await hybridMode(params, keywords, deps);
      chunks = result.chunks;
      vectorMatches = result.vectorMatches;
      graphExpanded = result.graphExpanded;
      break;
    }
    case "mix": {
      const result = await mixMode(params, keywords, deps);
      chunks = result.chunks;
      vectorMatches = result.vectorMatches;
      graphExpanded = result.graphExpanded;
      reranked = result.reranked;
      break;
    }
    default:
      throw new Error(`Unknown query mode: ${mode}`);
  }

  // Add full content if requested
  if (responseFormat === "full") {
    chunks = await enrichWithFullContent(chunks, deps.recordStore);
  }

  const processingTime = Date.now() - startTime;

  console.log(
    `[LightRAG] Complete in ${processingTime}ms - ${
      chunks.length
    } chunks from ${countUniqueDocuments(chunks)} documents\n`
  );

  return {
    query: query.query,
    mode,
    processing_time_ms: processingTime,
    chunks,
    stats: {
      total_chunks: chunks.length,
      unique_documents: countUniqueDocuments(chunks),
      processing_time_ms: processingTime,
      retrieval_breakdown: {
        vector_matches: vectorMatches,
        graph_expanded: graphExpanded,
        reranked,
      },
    },
    metadata: {
      keywords_extracted: keywords,
      filters_applied: !!query.filters,
    },
  };
}

// ============================================
// Mode Implementations
// ============================================

async function naiveMode(
  params: LightRAGQuery,
  deps: LightRAGDependencies
): Promise<{ chunks: LightRAGChunk[]; vectorMatches: number }> {
  console.log(`[LightRAG] Running naive mode (vector-only)`);

  // Generate embedding
  const queryVector = (await embed([params.query]))[0];

  // Vector search
  const vectorResults = await deps.vectorStore.search(queryVector, {
    limit: params.chunk_top_k || 20,
    scoreThreshold: params.score_threshold || 0.6,
  });

  // Convert to chunks
  const chunks = await resultsToChunks(vectorResults, deps.recordStore);
  const limitedChunks = chunks.slice(0, params.chunk_top_k || 20);

  return {
    chunks: limitedChunks,
    vectorMatches: limitedChunks.length,
  };
}

async function localMode(
  params: LightRAGQuery,
  keywords: ExtractedKeywords,
  deps: LightRAGDependencies
): Promise<{
  chunks: LightRAGChunk[];
  vectorMatches: number;
  graphExpanded: number;
}> {
  console.log(`[LightRAG] Running local mode (entity-focused)`);

  // Use low-level keywords for entity search
  const entities = await searchEntitiesByKeywords(
    keywords.low_level,
    params.top_k || 60,
    deps
  );

  // Get 1-hop relationships
  const relationships = await getEntityRelationships(
    entities.map((e) => e.id),
    deps.graphStore
  );

  // Get chunks
  const chunks = await getChunksForEntities(
    entities,
    params.chunk_top_k || 20,
    deps.recordStore
  );

  return {
    chunks,
    vectorMatches: entities.length,
    graphExpanded: relationships.length,
  };
}

async function globalMode(
  params: LightRAGQuery,
  keywords: ExtractedKeywords,
  deps: LightRAGDependencies
): Promise<{
  chunks: LightRAGChunk[];
  vectorMatches: number;
  graphExpanded: number;
}> {
  console.log(`[LightRAG] Running global mode (relationship-focused)`);

  // Use high-level keywords for relationship search
  const relationships = await searchRelationshipsByKeywords(
    keywords.high_level,
    params.top_k || 60,
    deps
  );

  // Extract unique entities
  const entityIds = new Set<string>();
  relationships.forEach((r) => {
    entityIds.add(r.source.id);
    entityIds.add(r.target.id);
  });

  const entities = await getEntitiesByIds(Array.from(entityIds), deps);

  // Get chunks
  const chunks = await getChunksForEntities(
    entities,
    params.chunk_top_k || 20,
    deps.recordStore
  );

  return {
    chunks,
    vectorMatches: relationships.length,
    graphExpanded: entities.length,
  };
}

async function hybridMode(
  params: LightRAGQuery,
  keywords: ExtractedKeywords,
  deps: LightRAGDependencies
): Promise<{
  chunks: LightRAGChunk[];
  vectorMatches: number;
  graphExpanded: number;
}> {
  console.log(`[LightRAG] Running hybrid mode (local + global)`);

  // Run both in parallel
  const [localResult, globalResult] = await Promise.all([
    localMode(params, keywords, deps),
    globalMode(params, keywords, deps),
  ]);

  // Merge and deduplicate
  const chunks = deduplicateChunks([
    ...localResult.chunks,
    ...globalResult.chunks,
  ]);

  const limitedChunks = chunks.slice(0, params.chunk_top_k || 20);

  return {
    chunks: limitedChunks,
    vectorMatches: localResult.vectorMatches + globalResult.vectorMatches,
    graphExpanded: localResult.graphExpanded + globalResult.graphExpanded,
  };
}

async function mixMode(
  params: LightRAGQuery,
  keywords: ExtractedKeywords,
  deps: LightRAGDependencies
): Promise<{
  chunks: LightRAGChunk[];
  vectorMatches: number;
  graphExpanded: number;
  reranked: boolean;
}> {
  console.log(`[LightRAG] Running mix mode (KG + vector + reranking)`);

  // Run hybrid mode first
  const hybridResult = await hybridMode(params, keywords, deps);

  // Apply reranking if enabled
  if (
    params.enable_rerank !== false &&
    deps.reranker.isEnabled() &&
    hybridResult.chunks.length > 0
  ) {
    console.log(`[LightRAG] Applying reranking...`);
    const rerankedChunks = await rerankChunks(
      params.query,
      hybridResult.chunks,
      deps.reranker
    );
    return { ...hybridResult, chunks: rerankedChunks, reranked: true };
  }

  return { ...hybridResult, reranked: false };
}

// ============================================
// Helper Functions
// ============================================

async function extractKeywords(
  query: string,
  llm: LLMService
): Promise<ExtractedKeywords> {
  const prompt = `Extract keywords from this query for knowledge graph retrieval.
Return JSON with two arrays:
- "high_level": Conceptual/thematic keywords (3-5 keywords)
- "low_level": Specific entities/names (3-7 keywords)

Query: "${query}"

Return ONLY valid JSON, no explanation.`;

  try {
    const response = await llm.chat(
      [
        {
          role: "system",
          content:
            "You are a keyword extraction system. Always respond with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.1 }
    );

    const cleaned = response
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    return {
      high_level: parsed.high_level || [],
      low_level: parsed.low_level || [],
    };
  } catch (error) {
    console.warn(
      `[LightRAG] Keyword extraction failed, using query as-is:`,
      error
    );
    return {
      high_level: [query],
      low_level: [query],
    };
  }
}

async function searchEntitiesByKeywords(
  keywords: string[],
  limit: number,
  deps: LightRAGDependencies
): Promise<LightRAGEntity[]> {
  const searchQuery = keywords.join(" ");
  const records = await RecordModel.find(
    { $text: { $search: searchQuery } },
    { score: { $meta: "textScore" } }
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(limit)
    .lean();

  const entities: LightRAGEntity[] = await Promise.all(
    records.map(async (record) => {
      const relationships = await deps.graphStore.getNodeRelationships(
        record._id
      );

      return {
        id: record._id,
        name: record.title,
        type: record.recordType,
        description: record.content.substring(0, 200),
        degree: relationships.length,
        rank: calculateNodeRank(relationships.length),
        source: record.source,
        sourceId: record.sourceId,
        date: record.primaryDate?.toISOString(),
        relevance_score: (record as any).score || 0,
      };
    })
  );

  entities.sort((a, b) => b.degree - a.degree);
  return entities;
}

async function searchRelationshipsByKeywords(
  keywords: string[],
  limit: number,
  deps: LightRAGDependencies
): Promise<LightRAGRelationship[]> {
  const entities = await searchEntitiesByKeywords(keywords, limit, deps);

  const allRelationships: LightRAGRelationship[] = [];

  for (const entity of entities) {
    const rels = await deps.graphStore.getNodeRelationships(entity.id);

    for (const rel of rels) {
      allRelationships.push({
        id: `${rel.relationship.sourceId}_${rel.relationship.type}_${rel.relationship.targetId}`,
        source: {
          id: rel.relationship.sourceId,
          name: entity.name,
          type: entity.type,
        },
        target: {
          id: rel.relatedNode.id,
          name: rel.relatedNode.title,
          type: rel.relatedNode.type,
        },
        type: rel.relationship.type,
        confidence: rel.relationship.confidence,
        weight: Math.round(rel.relationship.confidence * 10),
        rank: await calculateEdgeRank(
          rel.relationship.sourceId,
          rel.relationship.targetId,
          deps.graphStore
        ),
        extracted_by: rel.relationship.extractedBy,
      });
    }
  }

  const uniqueRels = deduplicateRelationships(allRelationships);
  uniqueRels.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return b.weight - a.weight;
  });

  return uniqueRels.slice(0, limit);
}

async function getEntitiesByIds(
  ids: string[],
  deps: LightRAGDependencies
): Promise<LightRAGEntity[]> {
  const records = await RecordModel.find({ _id: { $in: ids } }).lean();

  const entities: LightRAGEntity[] = await Promise.all(
    records.map(async (record) => {
      const relationships = await deps.graphStore.getNodeRelationships(
        record._id
      );

      return {
        id: record._id,
        name: record.title,
        type: record.recordType,
        description: record.content.substring(0, 200),
        degree: relationships.length,
        rank: calculateNodeRank(relationships.length),
        source: record.source,
        sourceId: record.sourceId,
        date: record.primaryDate?.toISOString(),
        relevance_score: 0,
      };
    })
  );

  return entities;
}

async function getEntityRelationships(
  entityIds: string[],
  graphStore: GraphStore
): Promise<LightRAGRelationship[]> {
  const relationships: LightRAGRelationship[] = [];

  for (const entityId of entityIds) {
    const rels = await graphStore.getNodeRelationships(entityId);

    for (const rel of rels) {
      relationships.push({
        id: `${rel.relationship.sourceId}_${rel.relationship.type}_${rel.relationship.targetId}`,
        source: {
          id: rel.relationship.sourceId,
          name: "",
          type: "",
        },
        target: {
          id: rel.relatedNode.id,
          name: rel.relatedNode.title,
          type: rel.relatedNode.type,
        },
        type: rel.relationship.type,
        confidence: rel.relationship.confidence,
        weight: Math.round(rel.relationship.confidence * 10),
        rank: await calculateEdgeRank(
          rel.relationship.sourceId,
          rel.relationship.targetId,
          graphStore
        ),
        extracted_by: rel.relationship.extractedBy,
      });
    }
  }

  return deduplicateRelationships(relationships);
}

async function getChunksForEntities(
  entities: LightRAGEntity[],
  limit: number,
  recordStore: RecordStore
): Promise<LightRAGChunk[]> {
  const records = await RecordModel.find({
    _id: { $in: entities.map((e) => e.id) },
  }).lean();

  const chunks: LightRAGChunk[] = records.map((record) => ({
    id: record._id,
    document_id: record._id,
    chunk_index: 0,
    title: record.title,
    source: record.source,
    source_id: record.sourceId,
    snippet: record.content.substring(0, 500),
    score: 0.8,
    type: record.recordType,
    people: record.people || [],
  }));

  return chunks.slice(0, limit);
}

async function resultsToChunks(
  results: Array<{ id: string; score: number; payload: any }>,
  recordStore: RecordStore
): Promise<LightRAGChunk[]> {
  // Extract MongoDB IDs from payload
  const mongoIds = results.map((r) => r.payload.mongoId);
  const records = await recordStore.findByIds(mongoIds);
  const recordMap = new Map(records.map((r) => [r._id, r]));

  const chunks: LightRAGChunk[] = [];

  for (const result of results) {
    const record = recordMap.get(result.payload.mongoId);
    if (!record) continue;

    chunks.push({
      id: record._id,
      document_id: record._id,
      chunk_index: 0,
      title: record.title,
      source: record.source,
      source_id: record.sourceId,
      snippet: record.content.substring(0, 500),
      score: result.score,
      type: record.recordType,
      people: record.people || [],
    });
  }

  return chunks;
}

async function rerankChunks(
  query: string,
  chunks: LightRAGChunk[],
  reranker: RerankerService
): Promise<LightRAGChunk[]> {
  const docs = chunks.map((c) => ({
    id: c.id,
    text: `${c.title}\n${c.snippet}`,
  }));

  const reranked = await reranker.rerank(query, docs, {
    topK: chunks.length,
  });

  const rerankMap = new Map(reranked.map((r) => [r.id, r.score]));

  chunks.forEach((chunk) => {
    const newScore = rerankMap.get(chunk.id);
    if (newScore !== undefined) {
      chunk.score = newScore;
    }
  });

  chunks.sort((a, b) => b.score - a.score);

  return chunks;
}

async function enrichWithFullContent(
  chunks: LightRAGChunk[],
  recordStore: RecordStore
): Promise<LightRAGChunkFull[]> {
  const recordIds = [...new Set(chunks.map((c) => c.document_id))];
  const records = await recordStore.findByIds(recordIds);
  const recordMap = new Map(records.map((r) => [r._id, r]));

  return chunks.map((chunk) => {
    const record = recordMap.get(chunk.document_id);
    if (!record) return chunk as LightRAGChunkFull;

    return {
      ...chunk,
      full_content: record.content,
      metadata: {
        tags: record.tags,
        created_at: record.createdAt?.toISOString(),
        updated_at: record.sourceUpdatedAt?.toISOString(),
        rawData: record.rawData,
      },
    } as LightRAGChunkFull;
  });
}

// ============================================
// Utility Functions
// ============================================

function calculateNodeRank(degree: number): number {
  return Math.min(Math.round((degree / 10) * 100), 100);
}

async function calculateEdgeRank(
  sourceId: string,
  targetId: string,
  graphStore: GraphStore
): Promise<number> {
  const [sourceRels, targetRels] = await Promise.all([
    graphStore.getNodeRelationships(sourceId),
    graphStore.getNodeRelationships(targetId),
  ]);

  return calculateNodeRank(sourceRels.length + targetRels.length);
}

function deduplicateRelationships(
  relationships: LightRAGRelationship[]
): LightRAGRelationship[] {
  const seen = new Set<string>();
  return relationships.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

function deduplicateChunks(chunks: LightRAGChunk[]): LightRAGChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

function countUniqueDocuments(chunks: LightRAGChunk[]): number {
  return new Set(chunks.map((c) => c.document_id)).size;
}

function applyDefaults(query: LightRAGQuery): LightRAGQuery {
  return {
    ...query,
    mode: query.mode || "mix",
    response_format: query.response_format || "compact",
    top_k: query.top_k ?? 60,
    chunk_top_k: query.chunk_top_k ?? 20,
    enable_rerank: query.enable_rerank ?? true,
    score_threshold: query.score_threshold ?? 0.6,
  };
}
