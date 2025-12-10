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
import { getSchema, createSchema } from "../../../stores/graph-schema.store.js";
import { GraphEmbeddingMetadata } from "../../../models/graph-embedding-metadata.model.js";
import logger from "../../../utils/logger.js";
import { env } from "../../../env.js";
import { calculateEmbeddingChecksum } from "../../../utils/checksum.js";

// ============================================================================
// Types
// ============================================================================

export interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
  adapterRelationships: GraphRelationship[];
  recordId: string;
  recordChecksum: string;
  wasFilteredAsToxic?: boolean;
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
  emptyExtractions: number;
  processedRecords: number;
  failedRecords: number;
  successfulRecords: number;
  totalRuntimeMs: number;
  avgTimePerDocMs: number;
  avgBatchTimeMs: number;
  throughputDocsPerSec: number;
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
  // NOTE: Orphaned entity/relationship cleanup is now done in batch after all records
  // are processed to improve performance and reduce transaction conflicts.
  if (options.graphStore && (record.lastGraphIndexDate || options.force)) {
    // Cleanup is handled in batch after indexing completes
    // See indexAllRecords() for the cleanup logic
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
    existingRelTypes,
    undefined, // persona
    3, // maxRetries
    {
      recordId: record._id,
      recordTitle: record.title,
    }
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
      wasFilteredAsToxic: true,
    };
  }

  // Truncate if exceeds max entities
  const truncatedEntities = truncateEntities({
    entities,
    contentLength: record.content.length,
    charsPerEntity: env.ENTITY_CHARS_PER_ENTITY,
    maxEntities: env.MAX_ENTITIES_PER_DOCUMENT,
  });

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
    maxEntitiesPerDoc = undefined,
    force = false,
  } = options;

  logger.info(`🔄 Starting graph indexing for source: ${source}`);
  logger.info(`   Configuration:`);
  logger.info(`   - Batch size: ${batchSize}`);
  logger.info(`   - Concurrency: ${concurrency}`);
  logger.info(
    `   - Toxic filter: ${enableToxicFilter ? "enabled" : "disabled"}`
  );

  // Entity limit configuration (log once here to avoid per-record spam)
  if (!env.ENTITY_CHARS_PER_ENTITY && !maxEntitiesPerDoc) {
    logger.info(`   - Entity limits: ✅ No limits (keeping all entities)`);
  } else {
    const ratioInfo = env.ENTITY_CHARS_PER_ENTITY
      ? `1 entity per ${env.ENTITY_CHARS_PER_ENTITY} chars`
      : "no ratio limit";
    const capInfo = maxEntitiesPerDoc ? `, capped at ${maxEntitiesPerDoc}` : "";
    logger.info(`   - Entity limits: ${ratioInfo}${capInfo}`);
  }

  logger.info(`   - Force re-index: ${force ? "enabled" : "disabled"}`);

  // Ensure schema exists before indexing
  let currentSchema = await getSchema();
  if (!currentSchema) {
    logger.info(`📝 No schema found, creating default schema...`);
    currentSchema = await createSchema();
    logger.info(`✅ Schema created with version ${currentSchema.version}`);
  }

  // Track start time for performance metrics
  const startTime = Date.now();
  const batchTimes: number[] = [];

  const stats: IndexingStats = {
    nodes: 0,
    relationships: 0,
    errors: 0,
    skippedToxic: 0,
    emptyExtractions: 0,
    processedRecords: 0,
    failedRecords: 0,
    successfulRecords: 0,
    totalRuntimeMs: 0,
    avgTimePerDocMs: 0,
    avgBatchTimeMs: 0,
    throughputDocsPerSec: 0,
  };

  // Get adapter for this source
  const adapter = adapters.get(source);

  // Get schema types (schema already ensured to exist above)
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

    // Track batch start time
    const batchStartTime = Date.now();

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

      // Separate toxic-filtered from empty extractions
      const toxicFiltered = extractionResults.filter(
        (r) => r.wasFilteredAsToxic === true
      );
      const emptyExtractions = extractionResults.filter(
        (r) =>
          r.entities.length === 0 &&
          r.relationships.length === 0 &&
          !r.wasFilteredAsToxic
      );

      stats.skippedToxic += toxicFiltered.length;
      stats.emptyExtractions += emptyExtractions.length;

      // Filter out empty results
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

        // 4. Create MongoDB metadata for all entities (for embedding tracking)
        const entityMetadataOps = nodes.map((node) => {
          // Calculate content checksum for this entity
          const contentChecksum = calculateEmbeddingChecksum({
            entityType: node.type,
            description: node.description,
            text: node.title,
          });

          return {
            updateOne: {
              filter: { _id: node.id },
              update: {
                $set: {
                  itemType: "entity",
                  entityId: node.id,
                  entityType: node.type,
                  entityDescription: node.description, // Store LLM-extracted description
                  source: source,
                  contentChecksum: contentChecksum,
                  lastUpdatedBy: source,
                },
                $addToSet: {
                  sources: source,
                  sourceDocumentIds: {
                    $each: validResults
                      .filter((r) =>
                        r.entities.some((e) => {
                          const entityId = `${e.type.toLowerCase()}_${e.name
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "_")}`;
                          return entityId === node.id;
                        })
                      )
                      .map((r) => r.recordId),
                  },
                },
              },
              upsert: true,
            },
          };
        });

        if (entityMetadataOps.length > 0) {
          await GraphEmbeddingMetadata.bulkWrite(entityMetadataOps);
        }

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

        // 4. Create MongoDB metadata for all relationships (for embedding tracking)
        // Build a map of relationship descriptions from original extraction results
        const relDescriptionMap = new Map<string, string>();
        for (const result of validResults) {
          for (const origRel of result.relationships) {
            // Create relationship ID using entity names (need to normalize)
            const sourceId = `entity_${origRel.source
              .toLowerCase()
              .replace(/\s+/g, "_")}`;
            const targetId = `entity_${origRel.target
              .toLowerCase()
              .replace(/\s+/g, "_")}`;
            const relId = `${sourceId}_${origRel.type}_${targetId}`;
            if (origRel.description) {
              relDescriptionMap.set(relId, origRel.description);
            }
          }
        }

        const relMetadataOps = relationships.map((rel) => {
          const relId = `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`;

          // Look up description from original extraction
          const lookupKey = `${rel.sourceId}_${rel.type}_${rel.targetId}`;
          const description = relDescriptionMap.get(lookupKey);

          // Calculate content checksum for this relationship
          const contentChecksum = calculateEmbeddingChecksum({
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            relType: rel.type,
          });

          return {
            updateOne: {
              filter: { _id: relId },
              update: {
                $set: {
                  itemType: "relationship",
                  sourceId: rel.sourceId,
                  targetId: rel.targetId,
                  relType: rel.type,
                  relationshipDescription: description, // Store LLM-extracted description
                  source: source,
                  contentChecksum: contentChecksum,
                  lastUpdatedBy: source,
                },
                $addToSet: {
                  sources: source,
                  sourceDocumentIds: source,
                },
              },
              upsert: true,
            },
          };
        });

        if (relMetadataOps.length > 0) {
          await GraphEmbeddingMetadata.bulkWrite(relMetadataOps);
        }

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

    // Track batch end time
    const batchEndTime = Date.now();
    batchTimes.push(batchEndTime - batchStartTime);

    skip += records.length;
  }

  // Calculate performance metrics
  const endTime = Date.now();
  stats.totalRuntimeMs = endTime - startTime;
  stats.avgTimePerDocMs =
    stats.processedRecords > 0
      ? stats.totalRuntimeMs / stats.processedRecords
      : 0;
  stats.avgBatchTimeMs =
    batchTimes.length > 0
      ? batchTimes.reduce((sum, time) => sum + time, 0) / batchTimes.length
      : 0;
  stats.throughputDocsPerSec =
    stats.totalRuntimeMs > 0
      ? (stats.processedRecords / stats.totalRuntimeMs) * 1000
      : 0;

  // Format time helper
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  };

  logger.info(`✅ Graph indexing complete for ${source}`);
  logger.info(`   Records processed: ${stats.processedRecords}`);
  logger.info(`   Successful: ${stats.successfulRecords}`);
  logger.info(`   Failed: ${stats.failedRecords}`);
  logger.info(`   Empty extractions (no content): ${stats.emptyExtractions}`);
  if (stats.skippedToxic > 0) {
    logger.info(`   Filtered as toxic: ${stats.skippedToxic}`);
  }
  logger.info(`   Nodes created: ${stats.nodes}`);
  logger.info(`   Relationships created: ${stats.relationships}`);
  logger.info(``);
  logger.info(`   ⏱️  Performance:`);
  logger.info(`   - Total runtime: ${formatTime(stats.totalRuntimeMs)}`);
  logger.info(
    `   - Avg time per document: ${stats.avgTimePerDocMs.toFixed(0)}ms`
  );
  logger.info(`   - Avg batch time: ${formatTime(stats.avgBatchTimeMs)}`);
  logger.info(
    `   - Throughput: ${stats.throughputDocsPerSec.toFixed(2)} docs/sec`
  );

  if (stats.failedRecords > 0) {
    logger.warn({
      msg: "⚠️  Some records failed to index",
      failedRecords: stats.failedRecords,
    });
  }

  // Batch cleanup: Delete orphaned entities and relationships after all indexing is complete
  // This is more efficient than cleaning up after each record and reduces transaction conflicts
  logger.info(
    `\n🧹 Cleaning up orphaned entities and relationships for ${source}...`
  );
  try {
    const deletedEntities = await graphStore.deleteOrphanedEntities();
    const deletedRelationships = await graphStore.deleteOrphanedRelationships();

    if (deletedEntities > 0 || deletedRelationships > 0) {
      logger.info(
        `   ✅ Cleaned up ${deletedEntities} orphaned entities and ${deletedRelationships} orphaned relationships`
      );
    } else {
      logger.info(`   ✅ No orphaned entities or relationships found`);
    }
  } catch (err) {
    logger.error({ err }, `⚠️  Error during cleanup phase for ${source}`);
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
  // Ensure schema exists before indexing
  let currentSchema = await getSchema();
  if (!currentSchema) {
    logger.info(`📝 No schema found, creating default schema...`);
    currentSchema = await createSchema();
    logger.info(`✅ Schema created with version ${currentSchema.version}`);
  }
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
