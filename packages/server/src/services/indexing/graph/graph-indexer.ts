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
import { env } from "../../../env.js";

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
    existingRelTypes
  );

  // Filter out low-value relationships
  const filteredRelationships = filterLowValueRelationships(relationships);

  if (relationships.length !== filteredRelationships.length) {
    logger.info(`   - Relationships before filter: ${relationships.length}`);
    logger.info(
      `   - Relationships after filter: ${filteredRelationships.length}`
    );
  }

  // Log empty extractions (0 entities AND 0 relationships)
  if (entities.length === 0 && filteredRelationships.length === 0) {
    logger.warn(`⚠️  Empty extraction for record ${record._id}:`);
    logger.warn(`   - Content length: ${record.content.length} chars`);
    logger.warn(`   - Title: ${record.title}`);
    logger.warn(`   - MongoDB ID: ${record._id}`);
    if (record.rawData && typeof record.rawData === "object") {
      const rawData = record.rawData as any;
      if (rawData.url) {
        logger.warn(`   - URL: ${rawData.url}`);
      }
    }
  }

  // Apply toxic filtering if enabled
  if (options.enableToxicFilter && isToxicChunk(entities, relationships)) {
    const avgNameLength =
      entities.length > 0
        ? entities.reduce((sum, e) => sum + e.name.length, 0) / entities.length
        : 0;

    logger.warn(`⚠️  Skipping toxic chunk for record ${record._id}:`);
    logger.warn(`   - Entities: ${entities.length}`);
    logger.warn(`   - Relationships: ${relationships.length}`);
    logger.warn(`   - Avg name length: ${avgNameLength.toFixed(1)} chars`);
    logger.warn(
      `   - Sample entities: ${entities
        .slice(0, 5)
        .map((e) => e.name)
        .join(", ")}`
    );

    return {
      entities: [],
      relationships: [],
      adapterRelationships: [],
      recordId: record._id,
      recordChecksum: record.checksum,
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
    maxEntitiesPerDoc = 200,
    force = false,
  } = options;

  logger.info(`🔄 Starting graph indexing for source: ${source}`);
  logger.info(`   Configuration:`);
  logger.info(`   - Batch size: ${batchSize}`);
  logger.info(`   - Concurrency: ${concurrency}`);
  logger.info(
    `   - Toxic filter: ${enableToxicFilter ? "enabled" : "disabled"}`
  );
  logger.info(`   - Max entities per doc: ${maxEntitiesPerDoc}`);
  logger.info(`   - Force re-index: ${force ? "enabled" : "disabled"}`);

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
        logger.error(
          `❌ ${failedExtractions.length} record(s) failed extraction in this batch:`
        );
        failedExtractions.forEach(({ recordId, recordTitle, error }) => {
          logger.error(
            {
              err: error,
              recordId,
              recordTitle,
            },
            `Failed to extract: ${recordTitle}`
          );
        });

        stats.errors += failedExtractions.length;
        stats.failedRecords += failedExtractions.length;
      }

      // Update processed count
      stats.processedRecords += records.length;

      // Log batch summary
      logger.info(
        `✅ Batch complete: ${extractionResults.length} successful, ${failedExtractions.length} failed`
      );

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

      logger.info(
        `📊 Progress: ${stats.successfulRecords}/${stats.processedRecords} records, ` +
          `${stats.nodes} nodes, ${stats.relationships} relationships, ` +
          `${stats.failedRecords} failed, ${stats.skippedToxic} toxic`
      );
    } catch (err) {
      logger.error({ err }, "Error processing batch");
      stats.errors++;
    }

    skip += records.length;
  }

  logger.info(`✅ Graph indexing complete for ${source}`);
  logger.info(`   Records processed: ${stats.processedRecords}`);
  logger.info(`   Successful: ${stats.successfulRecords}`);
  logger.info(`   Failed: ${stats.failedRecords}`);
  logger.info(`   Skipped (toxic): ${stats.skippedToxic}`);
  logger.info(`   Nodes created: ${stats.nodes}`);
  logger.info(`   Relationships created: ${stats.relationships}`);

  if (stats.failedRecords > 0) {
    logger.warn(
      `⚠️  ${stats.failedRecords} records failed to index. Check logs above for details.`
    );
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
