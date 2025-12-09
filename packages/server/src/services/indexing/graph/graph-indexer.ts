/**
 * Functional Graph Indexer
 * LightRAG-inspired graph extraction with parallelization
 */

import OpenAI from "openai";
import pLimit from "p-limit";
import { Record } from "../../../models/record.model.js";
import { RecordStore } from "../../../stores/record.store.js";
import { GraphStore } from "../../../stores/graph.store.js";
import { SourceType, EntityRelationship } from "../../../types/index.js";
import { BaseRecordAdapter } from "../../sync/adapters/base-adapter.js";
import { extractGraphFromContent } from "./schema/schema-extraction.js";
import {
  Entity,
  Relationship,
  mergeRelationships,
  filterLowValueRelationships,
} from "./schema/entity-deduplication.js";
import {
  isToxicChunk,
  truncateEntities,
} from "../../../utils/toxic-chunk-detector.js";
import {
  entitiesToGraphNodes,
  relationshipsToGraphRelationships,
  GraphNode,
  GraphRelationship,
} from "./graph-converter.js";
import {
  discoverNewTypes,
  updateSchemaWithDiscovery,
  getCurrentSchemaTypes,
} from "./schema-auto-discovery.js";
import { getSchema } from "../../../stores/graph-schema.store.js";
import logger from "../../../utils/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
  adapterRelationships: GraphRelationship[];
  recordId: string;
  recordChecksum: string;
}

export interface IndexingOptions {
  recordType?: string;
  batchSize?: number;
  concurrency?: number;
  enableToxicFilter?: boolean;
  maxEntitiesPerDoc?: number;
  force?: boolean;
}

export interface IndexingStats {
  nodes: number;
  relationships: number;
  errors: number;
  skippedToxic: number;
  processedRecords: number;
  failedRecords: number;
  successfulRecords: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract graph from a single record
 * Combines adapter relationships with LLM-extracted entities/relationships
 */
export const extractGraphFromRecord = async (
  record: Record,
  adapter: BaseRecordAdapter | undefined,
  openaiClient: OpenAI,
  existingEntityTypes: string[],
  existingRelTypes: string[],
  options: {
    enableToxicFilter?: boolean;
    maxEntitiesPerDoc?: number;
    graphStore?: GraphStore;
    force?: boolean;
  } = {}
): Promise<ExtractionResult> => {
  // Check if record needs re-indexing (skip check if force=true)
  if (
    !options.force &&
    record.lastGraphIndexDate &&
    record.updatedAt &&
    record.updatedAt <= record.lastGraphIndexDate
  ) {
    // Record is up-to-date, skip extraction
    return {
      entities: [],
      relationships: [],
      adapterRelationships: [],
      recordId: record._id,
      recordChecksum: record.checksum,
    };
  }

  // Clean up old entity and relationship mentions before re-extraction if:
  // 1. This is a re-index (lastGraphIndexDate exists), OR
  // 2. Force mode is enabled (always clean)
  if (options.graphStore && (record.lastGraphIndexDate || options.force)) {
    // // 1. Unlink entities from document
    // const unlinkedEntityIds =
    //   await options.graphStore.unlinkAllEntitiesFromDocument(record._id);

    // // 2. Unlink relationships from document
    // const unlinkedRelCount =
    //   await options.graphStore.unlinkRelationshipsFromDocument(record._id);

    // 3. Delete orphaned entities
    const deletedEntities = await options.graphStore.deleteOrphanedEntities();

    // 4. Delete orphaned relationships
    const deletedRelationships =
      await options.graphStore.deleteOrphanedRelationships();

    if (deletedEntities > 0 || deletedRelationships > 0) {
      logger.info({
        msg: "🧹 Cleaned up entities and relationships",
        deletedEntities,
        deletedRelationships,
        recordId: record._id,
        reason: options.force ? "force re-index" : "updated record",
      });
    }
  }

  // Extract explicit relationships using adapter
  let adapterRelationships: EntityRelationship[] = [];
  if (adapter && record.rawData) {
    try {
      adapterRelationships = await adapter.extractRelationships(record.rawData);
    } catch (err) {
      logger.error(
        { err, recordId: record._id },
        `Error extracting adapter relationships for ${record._id}`
      );
    }
  }

  // Extract entities + relationships from FULL document (no chunking!)
  const { entities, relationships } = await extractGraphFromContent(
    openaiClient,
    record.content,
    existingEntityTypes,
    existingRelTypes
  );

  // Filter out low-value relationships
  const filteredRelationships = filterLowValueRelationships(relationships);

  if (relationships.length !== filteredRelationships.length) {
    logger.info({
      msg: "Filtered low-value relationships",
      before: relationships.length,
      after: filteredRelationships.length,
      filtered: relationships.length - filteredRelationships.length,
    });
  }

  // Log empty extractions (0 entities AND 0 relationships)
  if (entities.length === 0 && filteredRelationships.length === 0) {
    const logData: any = {
      msg: "⚠️  Empty extraction for record",
      recordId: record._id,
      contentLength: record.content.length,
      title: record.title,
    };

    if (record.rawData && typeof record.rawData === "object") {
      const rawData = record.rawData as any;
      if (rawData.url) {
        logData.url = rawData.url;
      }
    }

    logger.warn(logData);
  }

  // Apply toxic filtering if enabled
  if (options.enableToxicFilter && isToxicChunk(entities, relationships)) {
    const avgNameLength =
      entities.length > 0
        ? entities.reduce((sum, e) => sum + e.name.length, 0) / entities.length
        : 0;

    logger.warn({
      msg: "⚠️  Skipping toxic chunk",
      recordId: record._id,
      entities: entities.length,
      relationships: relationships.length,
      avgNameLength: parseFloat(avgNameLength.toFixed(1)),
      sampleEntities: entities.slice(0, 5).map((e) => e.name),
    });

    return {
      entities: [],
      relationships: [],
      adapterRelationships: [],
      recordId: record._id,
      recordChecksum: record.checksum,
    };
  }

  // Truncate if exceeds max entities
  const truncatedEntities = truncateEntities(
    entities,
    options.maxEntitiesPerDoc
  );

  // Convert adapter relationships to graph format
  const graphAdapterRels: GraphRelationship[] = adapterRelationships.map(
    (rel) => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type,
      confidence: rel.confidence,
    })
  );

  return {
    entities: truncatedEntities,
    relationships: filteredRelationships,
    adapterRelationships: graphAdapterRels,
    recordId: record._id,
    recordChecksum: record.checksum,
  };
};

/**
 * Process batch of extraction results to graph format
 * Pure function - no side effects
 */
export const processRecordsToGraph = (
  recordsData: ExtractionResult[]
): {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
} => {
  // // Flatten all entities across records
  // const allEntities = recordsData.flatMap((data) => data.entities);

  // // Deduplicate entities
  // const dedupedEntities = deduplicateEntities(allEntities);

  // Flatten all relationships
  const allRelationships = recordsData.flatMap((data) => data.relationships);

  // Merge relationships
  const mergedRelationships = mergeRelationships(allRelationships);

  // Convert to graph format
  // We need to map entity names to node IDs across all records
  const entityNameToId = new Map<string, string>();
  const nodes: GraphNode[] = [];

  // First pass: collect all unique entities (now global, not per-record)
  for (const data of recordsData) {
    const { nodes: recordNodes, entityNameToId: recordMapping } =
      entitiesToGraphNodes(data.entities);

    // Merge mappings and nodes (deduplication happens naturally with global IDs)
    for (const [name, id] of recordMapping.entries()) {
      if (!entityNameToId.has(name)) {
        entityNameToId.set(name, id);
        nodes.push(recordNodes.find((n) => n.id === id)!);
      }
    }
  }

  // Convert LLM relationships to graph relationships
  const llmGraphRels = relationshipsToGraphRelationships(
    mergedRelationships,
    entityNameToId
  );

  // Merge adapter relationships with LLM relationships
  const allAdapterRels = recordsData.flatMap(
    (data) => data.adapterRelationships
  );
  const allGraphRels = [...llmGraphRels, ...allAdapterRels];

  return {
    nodes,
    relationships: allGraphRels,
  };
};

/**
 * Main indexer - processes all records with parallelization
 */
export const indexAllRecords = async (
  source: SourceType,
  recordStore: RecordStore,
  graphStore: GraphStore,
  adapters: Map<SourceType, BaseRecordAdapter>,
  openaiClient: OpenAI,
  options: IndexingOptions = {}
): Promise<IndexingStats> => {
  const {
    recordType = "",
    batchSize = 50,
    concurrency = 32,
    enableToxicFilter = true,
    maxEntitiesPerDoc = 200,
    force = false,
  } = options;

  logger.info({
    msg: "🔄 Starting graph indexing",
    source,
    config: {
      batchSize,
      concurrency,
      toxicFilter: enableToxicFilter,
      maxEntitiesPerDoc,
      forceReindex: force,
    },
  });

  const stats: IndexingStats = {
    nodes: 0,
    relationships: 0,
    errors: 0,
    skippedToxic: 0,
    processedRecords: 0,
    failedRecords: 0,
    successfulRecords: 0,
  };

  // Get adapter for this source
  const adapter = adapters.get(source);

  // Get current schema and types
  const currentSchema = await getSchema();
  const {
    entityTypes: existingEntityTypes,
    relationshipTypes: existingRelTypes,
  } = getCurrentSchemaTypes(currentSchema);

  // Create concurrency limiter
  const limit = pLimit(concurrency);

  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const records = await recordStore.findBySourceAndType(source, recordType, {
      limit: batchSize,
      skip,
      includeDeleted: false,
    });

    if (records.length === 0) {
      hasMore = false;
      break;
    }

    try {
      // Extract in PARALLEL using p-limit with error resilience
      const extractionPromises = records.map((record) =>
        limit(() =>
          extractGraphFromRecord(
            record,
            adapter,
            openaiClient,
            existingEntityTypes,
            existingRelTypes,
            { enableToxicFilter, maxEntitiesPerDoc, graphStore, force }
          ).catch((err) => {
            // Wrap errors with record info for better logging
            return {
              error: err,
              recordId: record._id,
              recordTitle: record.title,
              entities: [],
              relationships: [],
              adapterRelationships: [],
              recordChecksum: record.checksum,
            };
          })
        )
      );

      const settledResults = await Promise.allSettled(extractionPromises);

      // Separate successful from failed extractions
      const extractionResults: ExtractionResult[] = [];
      const failedExtractions: Array<{
        recordId: string;
        recordTitle: string;
        error: Error;
      }> = [];

      settledResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const value = result.value;

          // Check if it's an error wrapper
          if ("error" in value && value.error) {
            failedExtractions.push({
              recordId: value.recordId as string,
              recordTitle: value.recordTitle as string,
              error: value.error as Error,
            });
          } else {
            // Successful extraction
            extractionResults.push(value as ExtractionResult);
          }
        } else {
          // Promise was rejected (shouldn't happen with catch above, but handle it)
          const record = records[index];
          failedExtractions.push({
            recordId: record._id,
            recordTitle: record.title,
            error: new Error(result.reason || "Unknown error"),
          });
        }
      });

      // Log failed extractions
      if (failedExtractions.length > 0) {
        failedExtractions.forEach(({ recordId, recordTitle, error }) => {
          logger.error({
            msg: "❌ Failed to extract record",
            err: error,
            recordId,
            recordTitle,
          });
        });

        stats.errors += failedExtractions.length;
        stats.failedRecords += failedExtractions.length;
      }

      // Update processed count
      stats.processedRecords += records.length;

      // Log batch summary
      logger.info({
        msg: "✅ Batch complete",
        successful: extractionResults.length,
        failed: failedExtractions.length,
        total: records.length,
      });

      // Count skipped toxic chunks
      const toxicCount = extractionResults.filter(
        (r) => r.entities.length === 0 && r.relationships.length === 0
      ).length;
      stats.skippedToxic += toxicCount;

      // Filter out toxic results
      const validResults = extractionResults.filter(
        (r) => r.entities.length > 0 || r.relationships.length > 0
      );

      if (validResults.length === 0) {
        skip += records.length;
        continue;
      }

      // Process to graph format (pure function)
      const { nodes, relationships } = processRecordsToGraph(validResults);

      // Auto-discover new types from extraction results
      if (currentSchema) {
        const allEntities = validResults.flatMap((r) => r.entities);
        const allRelationships = validResults.flatMap((r) => r.relationships);

        const { newEntityTypes, newRelationshipTypes } = discoverNewTypes(
          allEntities,
          allRelationships,
          currentSchema
        );

        if (newEntityTypes.length > 0 || newRelationshipTypes.length > 0) {
          await updateSchemaWithDiscovery(
            newEntityTypes,
            newRelationshipTypes,
            validResults.length
          );
        }
      }

      // Store nodes using batch operations (FAST - no write conflicts)
      if (nodes.length > 0) {
        // 1. Create/update ALL entity nodes in one batch
        await graphStore.upsertEntityNodes(
          nodes.map((node) => ({
            id: node.id,
            type: node.type,
            title: node.title,
            description: node.description,
          }))
        );

        // 2. Collect all entity-to-document links
        const entityLinks: Array<{
          entityId: string;
          documentId: string;
        }> = [];
        for (const result of validResults) {
          const { nodes: recordNodes } = entitiesToGraphNodes(result.entities);
          for (const node of recordNodes) {
            entityLinks.push({
              entityId: node.id,
              documentId: result.recordId,
            });
          }
        }

        // 3. Link ALL entities to documents in one batch
        await graphStore.linkEntitiesToDocuments(entityLinks);

        stats.nodes += nodes.length;
      }

      if (relationships.length > 0) {
        // 1. Create ALL semantic relationships in one batch
        await graphStore.upsertRelationshipsBatch(
          relationships.map((rel) => ({
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
          }))
        );

        // 2. Collect all document-to-relationship links
        const relLinks: Array<{
          documentId: string;
          relationshipType: string;
          sourceEntityId: string;
          targetEntityId: string;
          confidence: number;
        }> = [];
        for (const result of validResults) {
          const { relationships: recordRels } = processRecordsToGraph([result]);
          for (const rel of recordRels) {
            relLinks.push({
              documentId: result.recordId,
              relationshipType: rel.type,
              sourceEntityId: rel.sourceId,
              targetEntityId: rel.targetId,
              confidence: rel.confidence,
            });
          }
        }

        // 3. Link ALL documents to relationships in one batch
        await graphStore.linkDocumentsToRelationshipsBatch(relLinks);

        stats.relationships += relationships.length;
      }

      // Update ALL record metadata in parallel (MongoDB handles concurrency)
      await Promise.all(
        validResults.map((result) =>
          recordStore.upsert({
            _id: result.recordId,
            lastGraphIndexDate: new Date(),
          })
        )
      );

      // Update successful count
      stats.successfulRecords += validResults.length;

      logger.info({
        msg: "📊 Progress update",
        progress: {
          successful: stats.successfulRecords,
          processed: stats.processedRecords,
          failed: stats.failedRecords,
          toxic: stats.skippedToxic,
        },
        created: {
          nodes: stats.nodes,
          relationships: stats.relationships,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error processing batch");
      stats.errors++;
    }

    skip += records.length;
  }

  logger.info({
    msg: "✅ Graph indexing complete",
    source,
    stats: {
      processed: stats.processedRecords,
      successful: stats.successfulRecords,
      failed: stats.failedRecords,
      skippedToxic: stats.skippedToxic,
      nodesCreated: stats.nodes,
      relationshipsCreated: stats.relationships,
    },
  });

  if (stats.failedRecords > 0) {
    logger.warn({
      msg: "⚠️  Some records failed to index",
      failedRecords: stats.failedRecords,
    });
  }

  return stats;
};

/**
 * Index a single record
 * Useful for incremental updates
 */
export const indexSingleRecord = async (
  record: Record,
  adapter: BaseRecordAdapter | undefined,
  graphStore: GraphStore,
  recordStore: RecordStore,
  openaiClient: OpenAI,
  options: {
    enableToxicFilter?: boolean;
    maxEntitiesPerDoc?: number;
  } = {}
): Promise<{
  nodeId: string;
  relationships: number;
}> => {
  // Get current schema
  const currentSchema = await getSchema();
  const {
    entityTypes: existingEntityTypes,
    relationshipTypes: existingRelTypes,
  } = getCurrentSchemaTypes(currentSchema);

  // Extract from single record
  const extractionResult = await extractGraphFromRecord(
    record,
    adapter,
    openaiClient,
    existingEntityTypes,
    existingRelTypes,
    { ...options, graphStore }
  );

  // Process to graph
  const { nodes, relationships } = processRecordsToGraph([extractionResult]);

  // Store in graph
  if (nodes.length > 0) {
    const memgraphNodes = nodes.map((node) => ({
      label: "Entity",
      id: node.id,
      type: "entity",
      title: node.id.split("_").pop() || node.id,
    }));
    await graphStore.createNodes(memgraphNodes);
  }

  if (relationships.length > 0) {
    const memgraphRels = relationships.map((rel) => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type,
      confidence: rel.confidence,
      extractedBy: "llm" as const,
    }));
    await graphStore.createRelationships(memgraphRels);
  }

  // Auto-discover new types
  if (currentSchema) {
    const { newEntityTypes, newRelationshipTypes } = discoverNewTypes(
      extractionResult.entities,
      extractionResult.relationships,
      currentSchema
    );

    if (newEntityTypes.length > 0 || newRelationshipTypes.length > 0) {
      await updateSchemaWithDiscovery(newEntityTypes, newRelationshipTypes, 1);
    }
  }

  // Update record metadata
  await recordStore.upsert({
    _id: record._id,
    lastGraphIndexDate: new Date(),
  });

  return {
    nodeId: record._id,
    relationships: relationships.length,
  };
};
