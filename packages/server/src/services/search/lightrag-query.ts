/**
 * LightRAG Query Functions
 * Functional implementation of LightRAG without LLM generation
 * Returns structured chunks (entities, relationships, chunks)
 */

import { RecordModel } from '../../models/record.model.js';
import { GraphStore } from '../../stores/graph.store.js';
import { VectorStore } from '../../stores/vector.store.js';
import { RecordStore } from '../../stores/record.store.js';
import { embed } from '../../utils/embedding.js';
import { extractKeywordsNER } from '../../utils/keyword-extractor.js';
import OpenAI from 'openai';
import {
  LightRAGResponse,
  LightRAGRecord,
  LightRAGChunkFull,
  LightRAGEntity,
  LightRAGRelationship,
  ExtractedKeywords,
  LightRAGQueryInput,
} from '../../types/lightrag.types.js';
import logger from '../../utils/logger.js';
import { GraphEmbeddingMetadata } from '../../models/graph-embedding-metadata.model.js';
import { env } from '../../env.js';
import { rerank } from '../llm/index.js';

// ============================================
// Dependencies Interface
// ============================================

export interface LightRAGDependencies {
  graphStore: GraphStore;
  vectorStore: VectorStore;
  recordStore: RecordStore;
  openaiClient: OpenAI;
  embeddingModel: string;
}

// ============================================
// Main Entry Point
// ============================================

export async function lightragQuery(
  query: LightRAGQueryInput,
  deps: LightRAGDependencies,
): Promise<LightRAGResponse> {
  const startTime = Date.now();
  const mode = query.mode || 'mix';
  const responseFormat = query.response_format || 'compact';

  logger.info({ msg: `[LightRAG] Query`, query: query.query, mode });

  // Apply defaults
  const params = applyDefaults(query);

  // Extract keywords for dual-level retrieval (skip for naive mode)
  const keywords =
    mode !== 'naive' ? extractKeywords(query.query) : { high_level: [], low_level: [] };

  if (mode !== 'naive') {
    logger.info({
      msg: '[LightRAG] Keywords extracted',
      high: keywords.high_level,
      low: keywords.low_level,
    });
  }

  // Execute mode-specific retrieval
  let records: LightRAGRecord[];

  switch (mode) {
    case 'naive': {
      const result = await naiveMode(params, deps);
      records = result.chunks;
      break;
    }
    case 'local': {
      const result = await localMode(params, keywords, deps);
      records = result.records;
      break;
    }
    case 'global': {
      const result = await globalMode(params, keywords, deps);
      records = result.records;
      break;
    }
    case 'hybrid': {
      const result = await hybridMode(params, keywords, deps);
      records = result.chunks;
      break;
    }
    case 'mix': {
      const result = await mixMode(params, keywords, deps);
      records = result.chunks;
      break;
    }
    default:
      throw new Error(`Unknown query mode: ${mode}`);
  }

  // Add full content if requested
  if (responseFormat === 'full') {
    records = await enrichWithFullContent(records, deps.recordStore);
  }

  const processingTime = Date.now() - startTime;

  logger.info({
    msg: '[LightRAG] Query complete',
    processingTime,
    chunks: records.length,
    documents: countUniqueDocuments(records),
  });

  const uniqueDocIds = Array.from(new Set(records.map((c) => c.document_id)));

  const results = await RecordModel.find({ _id: { $in: uniqueDocIds } }).lean();

  const sortedChunks = records.sort((a, b) => b.score - a.score);

  return results
    .sort((a, b) => {
      const aScore = sortedChunks.find((c) => c.document_id === a._id)?.score || 0;
      const bScore = sortedChunks.find((c) => c.document_id === b._id)?.score || 0;
      return bScore - aScore;
    })
    .map((r) => ({
      source: r.source,
      recordType: r.recordType,
      rawData: r.rawData,
      content: r.content,
      score: sortedChunks.find((c) => c.document_id === r._id)?.score || 0,
    }));
}

// ============================================
// Mode Implementations
// ============================================

async function naiveMode(
  params: LightRAGQueryInput,
  deps: LightRAGDependencies,
): Promise<{ chunks: LightRAGRecord[]; vectorMatches: number }> {
  logger.info({ msg: `[LightRAG] Running naive mode (vector-only)` });

  // Generate embedding
  const queryVector = (await embed([params.query]))[0];

  // Vector search
  const vectorResults = await deps.vectorStore.search(queryVector, {
    limit: params.chunk_top_k!,
    scoreThreshold: params.score_threshold ?? env.SCORE_THRESHOLD_VECTOR,
    filter: {
      must_not: [
        {
          key: 'type',
          match: {
            any: ['entity', 'relationship'],
          },
        },
      ],
    },
  });

  // Convert to chunks
  const chunks = await resultsToChunks(vectorResults, deps.recordStore);
  const limitedChunks = chunks.slice(0, params.chunk_top_k!);

  return {
    chunks: limitedChunks,
    vectorMatches: limitedChunks.length,
  };
}

async function localMode(
  params: LightRAGQueryInput,
  keywords: ExtractedKeywords,
  deps: LightRAGDependencies,
): Promise<{
  records: LightRAGRecord[];
  vectorMatches: number;
  graphExpanded: number;
}> {
  logger.info({ msg: `[LightRAG] Running local mode (entity-focused)` });

  // PARALLEL: Search entities and relationships simultaneously
  const [entities, entityRelationships] = await Promise.all([
    searchEntitiesByKeywords(keywords.low_level, params.top_k!, deps, params.score_threshold),
    searchRelationshipsByKeywords(
      keywords.low_level,
      Math.floor(params.top_k! / 2),
      deps,
      params.score_threshold,
    ),
  ]);

  // Get 1-hop graph relationships
  const graphRelationships = await getEntityRelationships(
    entities.map((e) => e.id),
    deps.graphStore,
  );

  const entityIds = new Set<string>();
  graphRelationships.forEach((r) => {
    entityIds.add(r.source.id);
    entityIds.add(r.target.id);
  });

  // Combine relationships from both sources
  const allRelationships = [...entityRelationships, ...graphRelationships];

  // Build score map from initial entity search scores and relationship confidences
  const initialScores = new Map(entities.map((e) => [e.id.toString(), e.relevanceScore]));
  const scoreMap = buildEntityScoreMap(allRelationships, initialScores);

  const allEntities = await getEntitiesByIds(Array.from(entityIds), deps, scoreMap);

  // Get chunks
  const records = await getRecordsForEntities(allEntities, params.chunk_top_k!);

  return {
    records,
    vectorMatches: entities.length,
    graphExpanded: allRelationships.length,
  };
}

async function globalMode(
  params: LightRAGQueryInput,
  keywords: ExtractedKeywords,
  deps: LightRAGDependencies,
): Promise<{
  records: LightRAGRecord[];
  vectorMatches: number;
  graphExpanded: number;
}> {
  logger.info({ msg: `[LightRAG] Running global mode (relationship-focused)` });

  // Use high-level keywords for relationship search
  const relationships = await searchRelationshipsByKeywords(
    keywords.high_level,
    params.top_k!,
    deps,
    params.score_threshold,
  );

  // Extract unique entities
  const entityIds = new Set<string>();
  relationships.forEach((r) => {
    entityIds.add(r.source.id);
    entityIds.add(r.target.id);
  });

  // Build score map from relationship confidences
  const scoreMap = buildEntityScoreMap(relationships);

  const entities = await getEntitiesByIds(Array.from(entityIds), deps, scoreMap);

  // Get chunks
  const records = await getRecordsForEntities(entities, params.chunk_top_k!);

  return {
    records,
    vectorMatches: relationships.length,
    graphExpanded: entities.length,
  };
}

async function hybridMode(
  params: LightRAGQueryInput,
  keywords: ExtractedKeywords,
  deps: LightRAGDependencies,
): Promise<{
  chunks: LightRAGRecord[];
  vectorMatches: number;
  graphExpanded: number;
}> {
  logger.info({ msg: `[LightRAG] Running hybrid mode (local + global)` });

  // Run both in parallel
  const [localResult, globalResult] = await Promise.all([
    localMode(params, keywords, deps),
    globalMode(params, keywords, deps),
  ]);

  // Merge and deduplicate
  const chunks = deduplicateChunks([...localResult.records, ...globalResult.records]);

  const limitedChunks = chunks.slice(0, params.chunk_top_k!);

  return {
    chunks: limitedChunks,
    vectorMatches: localResult.vectorMatches + globalResult.vectorMatches,
    graphExpanded: localResult.graphExpanded + globalResult.graphExpanded,
  };
}

async function mixMode(
  params: LightRAGQueryInput,
  keywords: ExtractedKeywords,
  deps: LightRAGDependencies,
): Promise<{
  chunks: LightRAGRecord[];
  vectorMatches: number;
  graphExpanded: number;
  reranked: boolean;
}> {
  logger.info({ msg: `[LightRAG] Running mix mode (KG + vector + reranking)` });

  // Run hybrid mode first
  const hybridResult = await hybridMode(params, keywords, deps);

  // Apply reranking if not disabled
  if (!params.disable_rerank && env.RERANKER_ENABLED && hybridResult.chunks.length > 0) {
    logger.debug({ msg: `[LightRAG] Applying reranking...` });
    const rerankedChunks = await rerankChunks(params.query, hybridResult.chunks);

    // Filter reranked results by threshold
    const threshold = params.score_threshold ?? env.SCORE_THRESHOLD_RERANKER;
    const filteredChunks = rerankedChunks.filter((chunk) => chunk.score >= threshold);

    logger.debug({
      msg: `[LightRAG] Reranker threshold applied`,
      threshold,
      before: rerankedChunks.length,
      after: filteredChunks.length,
    });

    return { ...hybridResult, chunks: filteredChunks, reranked: true };
  }

  return { ...hybridResult, reranked: false };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract keywords using local NER (compromise)
 * 10x faster than LLM, zero cost, ~85% accuracy
 */
function extractKeywords(query: string): ExtractedKeywords {
  // Use local NER for fast, zero-cost keyword extraction
  const keywords = extractKeywordsNER(query);

  logger.info(
    `[LightRAG] NER extraction - High: [${keywords.high_level.join(
      ', ',
    )}], Low: [${keywords.low_level.join(', ')}]`,
  );

  return keywords;
}

async function searchEntitiesByKeywords(
  keywords: string[],
  limit: number,
  deps: LightRAGDependencies,
  scoreThreshold?: number,
): Promise<LightRAGEntity[]> {
  // Use vector search instead of text search
  const searchQuery = keywords.join(' ');
  const queryVector = (await embed([searchQuery]))[0];

  // Search entity embeddings in Qdrant
  const results = await deps.vectorStore.searchEntities(queryVector, {
    limit,
    scoreThreshold: scoreThreshold ?? env.SCORE_THRESHOLD_VECTOR,
  });

  // With universal UUID system, entityId IS the entity _id
  const graphEmbeddingMetadata = await GraphEmbeddingMetadata.find({
    _id: { $in: results.map((r) => r.payload.entityId) },
  }).lean();

  // Fetch full records from MongoDB using sourceRecordIds
  const recordIds = Array.from(
    new Set(graphEmbeddingMetadata.map((i) => i.sourceRecordIds).flat()),
  );

  const records = await RecordModel.find({ _id: { $in: recordIds } }).lean();

  const entities = records.map<LightRAGEntity>((record) => {
    let relevanceScore = 0;
    results.forEach((r) => {
      const metadata = graphEmbeddingMetadata.find((i) => i._id.toString() === r.payload.entityId);
      if (metadata?.sourceRecordIds.includes(record._id)) {
        if (r.score > relevanceScore) {
          relevanceScore = r.score;
        }
      }
    });
    return {
      id: record._id,
      name: record.title,
      type: record.recordType,
      description: record.content.substring(0, 200),
      source: record.source as import('../../types/index.js').SourceType,
      sourceId: record.sourceId,
      date: record.sourceCreatedAt?.toISOString(),
      relevanceScore,
    };
  });

  return entities;
}

async function searchRelationshipsByKeywords(
  keywords: string[],
  limit: number,
  deps: LightRAGDependencies,
  scoreThreshold?: number,
): Promise<LightRAGRelationship[]> {
  // Use direct relationship vector search
  const searchQuery = keywords.join(' ');
  const queryVector = (await embed([searchQuery]))[0];

  // Search relationship embeddings in Qdrant
  const results = await deps.vectorStore.searchRelationships(queryVector, {
    limit,
    scoreThreshold: scoreThreshold ?? env.SCORE_THRESHOLD_VECTOR,
  });

  // With universal UUID system, sourceEntityId and targetEntityId
  // ARE the entity _ids, so we can fetch them directly
  const entityIds = new Set<string>();
  results.forEach((r) => {
    if (r.payload.sourceEntityId) {
      entityIds.add(r.payload.sourceEntityId);
    }
    if (r.payload.targetEntityId) {
      entityIds.add(r.payload.targetEntityId);
    }
  });

  // Fetch entity metadata to get sourceRecordIds
  const entityMetadata = await GraphEmbeddingMetadata.find({
    _id: { $in: Array.from(entityIds) },
  }).lean();

  // Extract all Record IDs from the entity metadata
  const recordIds = Array.from(new Set(entityMetadata.map((meta) => meta.sourceRecordIds).flat()));

  // Fetch the actual Record documents
  const records = await RecordModel.find({
    _id: { $in: recordIds },
  }).lean();

  // Create a map from entity _id to Record for quick lookup
  const entityIdToRecordMap = new Map<string, (typeof records)[0]>();
  entityMetadata.forEach((meta) => {
    // Use the first sourceRecordId as the primary record for this entity
    const primaryRecordId = meta.sourceRecordIds[0];
    const record = records.find((r) => r._id.toString() === primaryRecordId.toString());
    if (record) {
      entityIdToRecordMap.set(meta._id.toString(), record);
    }
  });

  // Build LightRAGRelationship objects (filter out invalid relationships)
  const relationships: LightRAGRelationship[] = results
    .filter((r) => r.payload.sourceEntityId && r.payload.targetEntityId && r.payload.relType)
    .map((result) => {
      const sourceId = result.payload.sourceEntityId!;
      const targetId = result.payload.targetEntityId!;

      const sourceRecord = entityIdToRecordMap.get(sourceId);
      const targetRecord = entityIdToRecordMap.get(targetId);

      // Use the first sourceRecordId as the entity ID for the relationship
      const sourceRecordId =
        entityMetadata.find((m) => m._id.toString() === sourceId)?.sourceRecordIds[0] || sourceId;
      const targetRecordId =
        entityMetadata.find((m) => m._id.toString() === targetId)?.sourceRecordIds[0] || targetId;

      return {
        id: `${sourceRecordId}_${result.payload.relType}_${targetRecordId}`,
        source: {
          id: sourceRecordId,
          name: sourceRecord?.title || 'Unknown',
          type: sourceRecord?.recordType || 'unknown',
        },
        target: {
          id: targetRecordId,
          name: targetRecord?.title || 'Unknown',
          type: targetRecord?.recordType || 'unknown',
        },
        type: result.payload.relType!,
        confidence: result.payload.confidence,
        weight: Math.round(result.payload.confidence * 10),
        rank: Math.round(result.score * 100), // Use search score as rank
      };
    });

  // Sort by confidence
  relationships.sort((a, b) => b.confidence - a.confidence);
  return relationships.slice(0, limit);
}

async function getEntitiesByIds(
  ids: string[],
  deps: LightRAGDependencies,
  scoreMap?: Map<string, number>,
): Promise<LightRAGEntity[]> {
  const records = await RecordModel.find({ _id: { $in: ids } }).lean();

  // Batch fetch relationship counts for all entities
  const recordIds = records.map((r) => r._id);
  const degreeCounts = await deps.graphStore.getNodeRelationshipCounts(recordIds);

  const entities = records.map<LightRAGEntity>((record) => {
    const degree = degreeCounts.get(record._id) || 0;
    const relevanceScore = scoreMap?.get(record._id.toString()) ?? 0;

    return {
      id: record._id,
      name: record.title,
      type: record.recordType,
      description: record.content.substring(0, 200),
      degree,
      rank: calculateNodeRank(degree),
      source: record.source as import('../../types/index.js').SourceType,
      sourceId: record.sourceId,
      date: record.sourceCreatedAt?.toISOString(),
      relevanceScore,
    };
  });

  return entities;
}

async function getEntityRelationships(
  entityIds: string[],
  graphStore: GraphStore,
): Promise<LightRAGRelationship[]> {
  // Fetch relationships in parallel for all entities
  const relationshipResults = await Promise.all(
    entityIds.map((entityId) => graphStore.getNodeRelationships(entityId)),
  );

  const relationships: LightRAGRelationship[] = [];

  for (let i = 0; i < entityIds.length; i++) {
    // const entityId = entityIds[i];
    const rels = relationshipResults[i];

    for (const rel of rels) {
      relationships.push({
        id: `${rel.relationship.sourceId}_${rel.relationship.type}_${rel.relationship.targetId}`,
        source: {
          id: rel.relationship.sourceId,
          name: '',
          type: '',
        },
        target: {
          id: rel.relatedNode.id,
          name: rel.relatedNode.title,
          type: rel.relatedNode.type,
        },
        type: rel.relationship.type,
        confidence: rel.relationship.confidence,
        weight: Math.round(rel.relationship.confidence * 10),
        rank: 50, // Use fixed rank to avoid expensive calculations
      });
    }
  }

  return deduplicateRelationships(relationships);
}

async function getRecordsForEntities(
  entities: LightRAGEntity[],
  limit: number,
): Promise<LightRAGRecord[]> {
  const records = await RecordModel.find({
    _id: { $in: entities.map((e) => e.id) },
  }).lean();

  const lightRAGRecords: LightRAGRecord[] = records
    .sort((a, b) => {
      const aScore = entities.find((e) => e.id === a._id)?.relevanceScore || 0;
      const bScore = entities.find((e) => e.id === b._id)?.relevanceScore || 0;
      return bScore - aScore;
    })
    .map((record) => ({
      id: record._id,
      document_id: record._id,
      title: record.title,
      source: record.source as import('../../types/index.js').SourceType,
      source_id: record.sourceId,
      snippet: record.content.substring(0, 500),
      score: entities.find((e) => e.id === record._id)?.relevanceScore ?? 0,
      type: record.recordType,
      people: record.people || [],
      record,
    }));

  return lightRAGRecords.slice(0, limit);
}

async function resultsToChunks(
  results: Array<{ id: string; score: number; payload: any }>,
  recordStore: RecordStore,
): Promise<LightRAGRecord[]> {
  // Extract MongoDB IDs from payload
  const recordIds = results.map((r) => r.payload.recordId);
  const records = await recordStore.findByIds(recordIds);
  const recordMap = new Map(records.map((r) => [r._id, r]));

  const chunks: LightRAGRecord[] = [];

  for (const result of results) {
    const record = recordMap.get(result.payload.recordId);
    if (!record) continue;

    chunks.push({
      id: record._id,
      document_id: record._id,
      title: record.title,
      source: record.source as import('../../types/index.js').SourceType,
      source_id: record.sourceId,
      snippet: record.content.substring(0, 500),
      score: result.score,
      type: record.recordType,
      people: record.people || [],
    });
  }

  return chunks;
}

async function rerankChunks(query: string, chunks: LightRAGRecord[]): Promise<LightRAGRecord[]> {
  const docs = chunks.map((c) => ({
    id: c.id,
    text: `${c.title}\n${c.snippet}`,
  }));

  const reranked = await rerank(query, docs, {
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
  chunks: LightRAGRecord[],
  recordStore: RecordStore,
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

/**
 * Build a score map for entities based on their relationships
 * Uses the maximum score when an entity appears in multiple relationships
 */
function buildEntityScoreMap(
  relationships: LightRAGRelationship[],
  initialScores?: Map<string, number>,
): Map<string, number> {
  const scoreMap = new Map<string, number>(initialScores);

  relationships.forEach((rel) => {
    const sourceId = rel.source.id.toString();
    const targetId = rel.target.id.toString();
    const relationshipScore = rel.confidence;

    // Use max score if entity appears in multiple relationships
    if (!scoreMap.has(sourceId) || scoreMap.get(sourceId)! < relationshipScore) {
      scoreMap.set(sourceId, relationshipScore);
    }
    if (!scoreMap.has(targetId) || scoreMap.get(targetId)! < relationshipScore) {
      scoreMap.set(targetId, relationshipScore);
    }
  });

  return scoreMap;
}

function calculateNodeRank(degree: number): number {
  return Math.min(Math.round((degree / 10) * 100), 100);
}

// async function calculateEdgeRank(
//   sourceId: string,
//   targetId: string,
//   graphStore: GraphStore
// ): Promise<number> {
//   const [sourceRels, targetRels] = await Promise.all([
//     graphStore.getNodeRelationships(sourceId),
//     graphStore.getNodeRelationships(targetId),
//   ]);

//   return calculateNodeRank(sourceRels.length + targetRels.length);
// }

function deduplicateRelationships(relationships: LightRAGRelationship[]): LightRAGRelationship[] {
  const seen = new Set<string>();
  return relationships.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

function deduplicateChunks(chunks: LightRAGRecord[]): LightRAGRecord[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

function countUniqueDocuments(chunks: LightRAGRecord[]): number {
  return new Set(chunks.map((c) => c.document_id)).size;
}

function applyDefaults(query: LightRAGQueryInput): LightRAGQueryInput {
  return {
    ...query,
    mode: query.mode || 'mix',
    response_format: query.response_format || 'compact',
    top_k: query.top_k ?? 60,
    chunk_top_k: query.chunk_top_k ?? 20,
    disable_rerank: query.disable_rerank ?? false,
    // Leave score_threshold undefined if not provided - will use env defaults per stage
    score_threshold: query.score_threshold,
  };
}
