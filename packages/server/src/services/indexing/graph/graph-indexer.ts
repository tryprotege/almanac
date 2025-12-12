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
  generateGlobalEntityId,
  GraphNode,
  GraphRelationship,
} from "./graph-converter.js";
import { normalizeEntityName } from "./schema/entity-deduplication.js";
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
import { validateRelationshipType } from "../../../utils/cypher-escape.js";

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
  limit?: number;
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
    record.lastGraphIndexAt &&
    record.sourceUpdatedAt &&
    record.sourceUpdatedAt <= record.lastGraphIndexAt
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

  // Skip if no content (similar to embedding indexer behavior)
  if (!record.content || record.content.trim().length === 0) {
    logger.debug({
      msg: "⏭️  Skipping record with no content",
      recordId: record._id,
      recordTitle: record.title,
    });

    return {
      entities: [],
      relationships: [],
      adapterRelationships: [],
      recordId: record._id,
      recordChecksum: record.checksum,
    };
  }

  // Clean up old entity and relationship mentions before re-extraction if:
  // 1. This is a re-index (lastGraphIndexAt exists), OR
  // 2. Force mode is enabled (always clean)
  // NOTE: Orphaned entity/relationship cleanup is now done in batch after all records
  // are processed to improve performance and reduce transaction conflicts.
  if (options.graphStore && (record.lastGraphIndexAt || options.force)) {
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
 * High-value entity types that should be preserved even without relationships
 * These entities are considered important enough to exist standalone
 */
const HIGH_VALUE_ENTITY_TYPES = new Set([
  "PERSON",
  "ORGANIZATION",
  "COMPANY",
  "LOCATION",
  "PRODUCT",
  "PROJECT",
]);

/**
 * Minimum description length for standalone entities
 * Entities with substantial descriptions may be valuable even without relationships
 */
const MIN_DESCRIPTION_LENGTH = 50;

/**
 * Check if an entity should be created even without relationships
 */
const shouldPreserveEntity = (entity: Entity): boolean => {
  // Preserve high-value entity types
  if (HIGH_VALUE_ENTITY_TYPES.has(entity.type.toUpperCase())) {
    return true;
  }

  // Preserve entities with substantial descriptions
  if (
    entity.description &&
    entity.description.length >= MIN_DESCRIPTION_LENGTH
  ) {
    return true;
  }

  return false;
};

/**
 * Process batch of extraction results to graph format
 * Pure function - no side effects
 * Returns entity mappings for consistent ID generation
 * Now includes orphan prevention logic
 */
export const processRecordsToGraph = (
  recordsData: ExtractionResult[]
): {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  entityNameToId: Map<string, string>;
  entityIdToType: Map<string, string>;
} => {
  // Flatten all relationships
  const allRelationships = recordsData.flatMap((data) => data.relationships);

  // Merge relationships
  const mergedRelationships = mergeRelationships(allRelationships);

  // Build a set of entity names that have at least one valid relationship
  const entitiesWithRelationships = new Set<string>();
  for (const rel of mergedRelationships) {
    const normalizedSource = normalizeEntityName(rel.source);
    const normalizedTarget = normalizeEntityName(rel.target);
    entitiesWithRelationships.add(normalizedSource);
    entitiesWithRelationships.add(normalizedTarget);
  }

  // Convert to graph format
  // We need to map entity names to node IDs across all records
  const entityNameToId = new Map<string, string>();
  const entityIdToType = new Map<string, string>();
  const nodes: GraphNode[] = [];

  // Track orphan prevention stats
  let preventedOrphanCount = 0;
  const preventedEntities: Array<{
    name: string;
    type: string;
    reason: string;
  }> = [];

  // First pass: collect all unique entities (now global, not per-record)
  // Filter out entities that would become orphans
  for (const data of recordsData) {
    const allEntities = data.entities;

    // Filter entities: only include if they have relationships OR are high-value
    const connectedEntities = allEntities.filter((entity) => {
      const normalizedName = normalizeEntityName(entity.name);
      const hasRelationships = entitiesWithRelationships.has(normalizedName);
      const shouldPreserve = shouldPreserveEntity(entity);

      if (!hasRelationships && !shouldPreserve) {
        preventedOrphanCount++;
        preventedEntities.push({
          name: entity.name,
          type: entity.type,
          reason: "No valid relationships and not a high-value entity type",
        });
        return false;
      }

      return true;
    });

    const { nodes: recordNodes, entityNameToId: recordMapping } =
      entitiesToGraphNodes(connectedEntities);

    // Merge mappings and nodes (deduplication happens naturally with global IDs)
    for (const [name, id] of recordMapping.entries()) {
      if (!entityNameToId.has(name)) {
        entityNameToId.set(name, id);
        const node = recordNodes.find((n) => n.id === id)!;
        nodes.push(node);
        entityIdToType.set(id, node.type);
      }
    }
  }

  // Log orphan prevention results
  if (preventedOrphanCount > 0) {
    logger.info({
      msg: `🛡️  Prevented creation of ${preventedOrphanCount} entities that would become orphans`,
      preventedCount: preventedOrphanCount,
    });

    if (logger.level === "debug" || logger.level === "trace") {
      logger.debug({
        msg: "📋 Prevented orphan entities (sample)",
        entities: preventedEntities.slice(0, 20),
        totalPrevented: preventedOrphanCount,
      });
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

  // Validate relationship types and log warnings for special characters
  const uniqueRelTypes = new Set(allGraphRels.map((r) => r.type));
  for (const relType of uniqueRelTypes) {
    const validation = validateRelationshipType(relType);
    if (validation.warnings.length > 0) {
      logger.warn({
        msg: "⚠️  Relationship type contains special characters",
        relationshipType: relType,
        warnings: validation.warnings,
        needsEscaping: validation.needsEscaping,
      });
    }
  }

  return {
    nodes,
    relationships: allGraphRels,
    entityNameToId,
    entityIdToType,
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
    batchSize = 32,
    concurrency = 32,
    enableToxicFilter = true,
    maxEntitiesPerDoc = undefined,
    force = false,
    limit: recordLimit = undefined,
  } = options;

  logger.info({
    msg: `🔄 Starting graph indexing`,
    source,
    batchSize,
    concurrency,
    toxicFilter: enableToxicFilter,
    rationInfo: env.ENTITY_CHARS_PER_ENTITY,
    capInfo: maxEntitiesPerDoc,
    forceReIndex: force,
    limit: recordLimit || "none",
  });

  // Ensure schema exists before indexing
  let currentSchema = await getSchema();
  if (!currentSchema) {
    currentSchema = await createSchema();
    logger.debug({
      msg: `✅ Schema created with version ${currentSchema.version}`,
      source,
    });
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

  // Get total record count for progress tracking
  const totalRecords = await recordStore.countBySourceAndType(
    source,
    recordType,
    {
      includeDeleted: false,
    }
  );

  logger.info({
    msg: `📊 Total records to process: ${totalRecords}`,
    source,
    recordType: recordType || "all",
  });

  // Create concurrency limiter
  const limit = pLimit(concurrency);

  let skip = 0;
  let hasMore = true;
  let batchNumber = 0;

  while (hasMore) {
    // Check if we've reached the record limit
    if (recordLimit && stats.processedRecords >= recordLimit) {
      logger.info({
        msg: `⚠️  Reached limit of ${recordLimit} records, stopping indexing`,
        processedRecords: stats.processedRecords,
      });
      hasMore = false;
      break;
    }

    const records = await recordStore.findBySourceAndType(source, recordType, {
      limit: batchSize,
      skip,
      includeDeleted: false,
    });

    if (records.length === 0) {
      hasMore = false;
      break;
    }

    // Increment batch number
    batchNumber++;

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
      logger.debug({
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
      const { nodes, relationships, entityNameToId, entityIdToType } =
        processRecordsToGraph(validResults);

      // DEBUG: Log what processRecordsToGraph returned
      logger.info({
        msg: "🔍 DEBUG: processRecordsToGraph results",
        nodesCount: nodes.length,
        relationshipsCount: relationships.length,
        entityMappings: entityNameToId.size,
        sampleNodes: nodes
          .slice(0, 3)
          .map((n) => ({ id: n.id, type: n.type, title: n.title })),
        sampleRels: relationships.slice(0, 3).map((r) => ({
          source: r.sourceId,
          target: r.targetId,
          type: r.type,
        })),
      });

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
        logger.info({
          msg: "🔍 DEBUG: About to save nodes to Memgraph",
          nodesCount: nodes.length,
        });

        // 1. Create/update ALL entity nodes in one batch
        try {
          await graphStore.upsertEntityNodes(
            nodes.map((node) => ({
              id: node.id,
              type: node.type,
              title: node.title,
              description: node.description,
            }))
          );
          logger.info({
            msg: "✅ DEBUG: Successfully saved nodes to Memgraph",
            nodesCount: nodes.length,
          });
        } catch (err) {
          logger.error({
            msg: "❌ DEBUG: Failed to save nodes to Memgraph",
            err,
            nodesCount: nodes.length,
          });
          throw err;
        }

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
                          // Use the entityNameToId map for consistent ID lookup
                          const normalizedName = normalizeEntityName(e.name);
                          const mappedId = entityNameToId.get(normalizedName);
                          return mappedId === node.id;
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
            confidence: rel.confidence,
          }))
        );

        logger.info({
          msg: "✅ DEBUG: Successfully saved relationships to Memgraph",
          relationshipsCount: relationships.length,
        });

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
            // Use entityNameToId map for consistent ID lookup
            const sourceNorm = normalizeEntityName(origRel.source);
            const targetNorm = normalizeEntityName(origRel.target);
            const sourceId = entityNameToId.get(sourceNorm);
            const targetId = entityNameToId.get(targetNorm);

            // Only add to map if both entities were found
            if (sourceId && targetId) {
              const relId = `${sourceId}_${origRel.type}_${targetId}`;
              if (origRel.description) {
                relDescriptionMap.set(relId, origRel.description);
              }
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
            lastGraphIndexAt: new Date(),
          })
        )
      );

      // Update successful count
      stats.successfulRecords += validResults.length;

      // Track batch end time and calculate metrics
      const batchEndTime = Date.now();
      const batchTimeMs = batchEndTime - batchStartTime;
      batchTimes.push(batchTimeMs);

      // Calculate progress metrics
      const percentComplete =
        totalRecords > 0
          ? ((stats.processedRecords / totalRecords) * 100).toFixed(1)
          : "0.0";

      const estimatedTotalBatches =
        totalRecords > 0 ? Math.ceil(totalRecords / batchSize) : 0;

      // Calculate estimated time remaining
      const elapsedTimeMs = batchEndTime - startTime;
      const avgBatchTimeSoFar =
        batchTimes.length > 0
          ? batchTimes.reduce((sum, time) => sum + time, 0) / batchTimes.length
          : 0;
      const remainingRecords = totalRecords - stats.processedRecords;
      const remainingBatches = Math.ceil(remainingRecords / batchSize);
      const estimatedRemainingMs = remainingBatches * avgBatchTimeSoFar;

      // Format time helper
      const formatTime = (ms: number): string => {
        if (ms < 1000) return `${ms.toFixed(0)}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(0);
        return `${minutes}m ${seconds}s`;
      };

      // Enhanced batch progress logging
      logger.info({
        msg: `📊 Batch ${batchNumber}/${estimatedTotalBatches} (${percentComplete}% complete)`,
        batch: {
          number: batchNumber,
          total: estimatedTotalBatches,
          percentComplete: `${percentComplete}%`,
        },
        timing: {
          batchTime: formatTime(batchTimeMs),
          avgBatchTime: formatTime(avgBatchTimeSoFar),
          elapsedTime: formatTime(elapsedTimeMs),
          estimatedRemaining: formatTime(estimatedRemainingMs),
        },
        records: {
          processed: `${stats.processedRecords}/${totalRecords}`,
          thisSuccess: validResults.length,
          thisFailed: failedExtractions.length,
          totalSuccessful: stats.successfulRecords,
          totalFailed: stats.failedRecords,
          totalToxic: stats.skippedToxic,
        },
        created: {
          nodes: stats.nodes,
          relationships: stats.relationships,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error processing batch");
      stats.errors++;

      // Track batch end time even on error
      const batchEndTime = Date.now();
      batchTimes.push(batchEndTime - batchStartTime);
    }

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

  logger.info({
    msg: `✅ Graph indexing complete`,
    source,
    processedRecords: stats.processedRecords,
    failedRecods: stats.failedRecords,
    emptyExtraction: stats.emptyExtractions,
    skippedToxic: stats.skippedToxic,
    nodesCreated: stats.nodes,
    relationshipCreated: stats.relationships,
    performance: {
      totalRuntime: formatTime(stats.totalRuntimeMs),
      avgTimePerDocMs: `${stats.avgTimePerDocMs.toFixed(0)}ms`,
      avgBatchTime: `${formatTime(stats.avgBatchTimeMs)}`,
      throughput: `${stats.throughputDocsPerSec.toFixed(2)} docs/sec`,
    },
  });

  if (stats.failedRecords > 0) {
    logger.warn({
      msg: "⚠️  Some records failed to index",
      failedRecords: stats.failedRecords,
    });
  }

  // Batch cleanup: Delete orphaned entities and relationships after all indexing is complete
  // This is more efficient than cleaning up after each record and reduces transaction conflicts
  logger.info({
    msg: `🧹 Cleaning up orphaned entities and relationships`,
    source,
  });
  try {
    const deletedEntities = await graphStore.deleteOrphanedEntities();
    const deletedRelationships = await graphStore.deleteOrphanedRelationships();

    if (deletedEntities > 0 || deletedRelationships > 0) {
      logger.info({
        msg: `✅ Cleaned up ${deletedEntities} orphaned entities and ${deletedRelationships} orphaned relationships`,
      });
    } else {
      logger.info({ msg: `✅ No orphaned entities or relationships found` });
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
    currentSchema = await createSchema();
    logger.debug({
      msg: `✅ Schema created with version ${currentSchema.version}`,
    });
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
      type: node.type, // Use actual entity type from GraphNode
      title: node.title, // Use actual title from GraphNode
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
    lastGraphIndexAt: new Date(),
  });

  return {
    nodeId: record._id,
    relationships: relationships.length,
  };
};
