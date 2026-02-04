/**
 * Functional Graph Indexer
 * LightRAG-inspired graph extraction with parallelization
 */

import OpenAI from 'openai';
import pLimit from 'p-limit';
import { Record } from '../../../models/record.model.js';
import { RecordStore } from '../../../stores/record.store.js';
import { GraphStore } from '../../../stores/graph.store.js';
import { SourceType } from '../../../types/index.js';
import { extractGraphFromContent } from './extraction/content-extractor.js';
import { processRecordsToGraph } from './processing/graph-builder.js';
import { Entity, Relationship, ExtractionResult, IndexingOptions, IndexingStats } from './types.js';
import { filterLowValueRelationships } from './schema/entity-deduplication.js';
import { isToxicChunk, truncateEntities } from '../../../utils/toxic-chunk-detector.js';
import {
  entitiesToGraphNodes,
  generateGlobalEntityId,
  GraphRelationship,
} from './graph-converter.js';
import { normalizeEntityName } from './schema/entity-deduplication.js';
import {
  discoverNewTypes,
  updateSchemaWithDiscovery,
  getCurrentSchemaTypes,
} from './schema-auto-discovery.js';
import { getSchema, createSchema } from '../../../stores/graph-schema.store.js';
import { GraphEmbeddingMetadata } from '../../../models/graph-embedding-metadata.model.js';
import { RelationshipMentionStore } from '../../../stores/relationship-mention.store.js';
import { cleanupDocumentGraph } from './graph-cleanup.js';
import logger from '../../../utils/logger.js';
import { env } from '../../../env.js';
import { calculateEmbeddingChecksum } from '../../../utils/checksum.js';
import { sanitizeRelationshipType } from '../../../utils/cypher-escape.js';
import { generateRelationshipMemgraphId } from '../../../utils/graph-id.js';

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract graph from a single record
 * Extracts entities/relationships from content via LLM
 * Document relationships come from config-driven extractedRelationships field
 */
export const extractGraphFromRecord = async (
  record: Record,
  openaiClient: OpenAI,
  existingEntityTypes: string[],
  existingRelTypes: string[],
  options: {
    enableToxicFilter?: boolean;
    maxEntitiesPerDoc?: number;
    graphStore?: GraphStore;
    force?: boolean;
  } = {},
): Promise<ExtractionResult> => {
  // Check if record needs re-indexing (skip check if force=true)
  // Use checksum-based detection: if content hasn't changed, skip extraction
  if (
    !options.force &&
    record.lastGraphIndexAt &&
    record.lastGraphIndexChecksum &&
    record.checksum === record.lastGraphIndexChecksum
  ) {
    // Record content is unchanged, skip extraction
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
      msg: '⏭️  Skipping record with no content',
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

  // Extract document relationships from record's extractedRelationships field
  // These come from the config-driven transformation (e.g., slack threads, github PR links)
  const adapterRelationships: GraphRelationship[] = (
    record.rawData?.extractedRelationships || []
  ).map((rel: any) => ({
    sourceId: rel.sourceId,
    targetId: rel.targetId,
    type: rel.type,
    confidence: rel.confidence || 1.0,
  }));

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
    },
  );

  // Filter out low-value relationships
  const filteredRelationships = filterLowValueRelationships(relationships);

  if (relationships.length !== filteredRelationships.length) {
    logger.info({
      msg: 'Filtered low-value relationships',
      before: relationships.length,
      after: filteredRelationships.length,
      filtered: relationships.length - filteredRelationships.length,
    });
  }

  // Log empty extractions (0 entities AND 0 relationships)
  if (entities.length === 0 && filteredRelationships.length === 0) {
    const logData: any = {
      msg: '⚠️  Empty extraction for record',
      recordId: record._id,
      contentLength: record.content.length,
      title: record.title,
    };

    if (record.rawData && typeof record.rawData === 'object') {
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
      msg: '⚠️  Skipping toxic chunk',
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

  return {
    entities: truncatedEntities,
    relationships: filteredRelationships,
    adapterRelationships: adapterRelationships,
    recordId: record._id,
    recordChecksum: record.checksum,
  };
};

/**
 * Main indexer - processes all records with parallelization
 * Relationships now come from config-driven extractedRelationships field
 */
export const indexAllRecords = async (
  source: SourceType,
  recordStore: RecordStore,
  graphStore: GraphStore,
  openaiClient: OpenAI,
  options: IndexingOptions = {},
): Promise<IndexingStats> => {
  const {
    recordType = '',
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
    limit: recordLimit || 'none',
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

  // Get schema types (schema already ensured to exist above)
  const { entityTypes: existingEntityTypes, relationshipTypes: existingRelTypes } =
    getCurrentSchemaTypes(currentSchema);

  // Get count of records needing indexing (unless force=true, then get all records)
  const totalRecords = force
    ? await recordStore.countBySourceAndType(source, recordType, {
        includeDeleted: false,
      })
    : await recordStore.countNeedingGraphIndex(source, recordType, {
        includeDeleted: false,
      });

  logger.info({
    msg: `📊 Records needing indexing: ${totalRecords}`,
    source,
    recordType: recordType || 'all',
    mode: force ? 'force (all records)' : 'incremental (updated only)',
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

    // Fetch only records that need indexing (unless force=true, then fetch all)
    const records = force
      ? await recordStore.findBySourceAndType(source, recordType, {
          limit: batchSize,
          skip,
          includeDeleted: false,
        })
      : await recordStore.findNeedingGraphIndex(source, recordType, {
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
          extractGraphFromRecord(record, openaiClient, existingEntityTypes, existingRelTypes, {
            enableToxicFilter,
            maxEntitiesPerDoc,
            graphStore,
            force,
          })
            .then(async (result) => {
              // Log extraction details immediately after each document finishes
              if (result.entities.length > 0 && result.relationships.length > 0) {
                // Get entity IDs from result
                const entityIds = result.entities.map((e) =>
                  generateGlobalEntityId(e.name, e.type),
                );

                // Query graph store to check which entities already exist
                const existingEntityIds = await graphStore.getExistingEntityIds(entityIds);

                // Separate entities into NEW vs EXISTING
                const newEntities: Entity[] = [];
                const existingEntities: Entity[] = [];

                for (const entity of result.entities) {
                  const entityId = generateGlobalEntityId(entity.name, entity.type);
                  if (existingEntityIds.has(entityId)) {
                    existingEntities.push(entity);
                  } else {
                    newEntities.push(entity);
                  }
                }

                // Build entity name to type map for relationship lookups
                const entityNameToType = new Map<string, string>();
                for (const entity of result.entities) {
                  entityNameToType.set(normalizeEntityName(entity.name), entity.type);
                }

                // Build relationship keys for checking existence
                const relKeys = result.relationships.map((r) => {
                  const sourceType =
                    entityNameToType.get(normalizeEntityName(r.source)) || 'Entity';
                  const targetType =
                    entityNameToType.get(normalizeEntityName(r.target)) || 'Entity';
                  return {
                    sourceId: generateGlobalEntityId(r.source, sourceType),
                    targetId: generateGlobalEntityId(r.target, targetType),
                    type: r.type,
                  };
                });

                // Query graph store to check which relationships already exist
                const existingRelKeys = await graphStore.getExistingRelationshipKeys(relKeys);

                // Separate relationships into NEW vs EXISTING
                const newRelationships: Relationship[] = [];
                const existingRelationships: Relationship[] = [];

                for (const rel of result.relationships) {
                  const sourceType =
                    entityNameToType.get(normalizeEntityName(rel.source)) || 'Entity';
                  const targetType =
                    entityNameToType.get(normalizeEntityName(rel.target)) || 'Entity';
                  const sourceId = generateGlobalEntityId(rel.source, sourceType);
                  const targetId = generateGlobalEntityId(rel.target, targetType);
                  const key = `${sourceId}|${rel.type}|${targetId}`;

                  if (existingRelKeys.has(key)) {
                    existingRelationships.push(rel);
                  } else {
                    newRelationships.push(rel);
                  }
                }

                // Log simplified extraction summary with new entities only
                logger.info({
                  msg: '📊 Document extraction',
                  docId: result.recordId,
                  entities: {
                    total: result.entities.length,
                    new: newEntities.length,
                  },
                  relationships: {
                    total: result.relationships.length,
                    new: newRelationships.length,
                  },
                  newEntities: newEntities.map((e) => `${e.name} (${e.type})`),
                });
              }

              return result;
            })
            .catch((err) => {
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
            }),
        ),
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
        if (result.status === 'fulfilled') {
          const value = result.value;

          // Check if it's an error wrapper
          if ('error' in value && value.error) {
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
            error: new Error(result.reason || 'Unknown error'),
          });
        }
      });

      // Log failed extractions
      if (failedExtractions.length > 0) {
        failedExtractions.forEach(({ recordId, recordTitle, error }) => {
          logger.error({
            msg: '❌ Failed to extract record',
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
        msg: '✅ Batch complete',
        successful: extractionResults.length,
        failed: failedExtractions.length,
        total: records.length,
      });

      // Separate toxic-filtered from empty extractions
      const toxicFiltered = extractionResults.filter((r) => r.wasFilteredAsToxic === true);
      const emptyExtractions = extractionResults.filter(
        (r) => r.entities.length === 0 && r.relationships.length === 0 && !r.wasFilteredAsToxic,
      );

      stats.skippedToxic += toxicFiltered.length;
      stats.emptyExtractions += emptyExtractions.length;

      // Filter out empty results
      const validResults = extractionResults.filter(
        (r) => r.entities.length > 0 || r.relationships.length > 0,
      );

      if (validResults.length === 0) {
        skip += records.length;
        continue;
      }

      // Clean up old graph data for records that are being re-indexed
      // This removes old relationship mentions and orphaned relationships
      let cleanupCount = 0;
      for (const result of validResults) {
        const record = records.find((r) => r._id === result.recordId);

        // If record was previously indexed, clean up old graph data
        if (record?.lastGraphIndexAt) {
          try {
            await cleanupDocumentGraph(result.recordId, graphStore);
            cleanupCount++;
          } catch (err) {
            logger.error({
              msg: 'Failed to cleanup document graph',
              err,
              recordId: result.recordId,
            });
          }
        }
      }

      if (cleanupCount > 0) {
        logger.info({
          msg: 'Cleaned up old graph data for re-indexed records',
          cleanupCount,
        });
      }

      // Build mapping of entities and relationships to their source documents BEFORE processing
      // This prevents re-running orphan detection and simplifies MongoDB metadata creation
      const relToDocuments = new Map<string, string[]>();
      const entityToDocuments = new Map<string, string[]>();

      for (const result of validResults) {
        // Map relationships to documents
        for (const rel of result.relationships) {
          const normalizedSource = normalizeEntityName(rel.source);
          const normalizedTarget = normalizeEntityName(rel.target);
          const key = `${normalizedSource}|${rel.type}|${normalizedTarget}`;
          const docs = relToDocuments.get(key) || [];
          docs.push(result.recordId);
          relToDocuments.set(key, docs);
        }

        // Map entities to documents
        for (const entity of result.entities) {
          const normalizedName = normalizeEntityName(entity.name);
          const docs = entityToDocuments.get(normalizedName) || [];
          docs.push(result.recordId);
          entityToDocuments.set(normalizedName, docs);
        }
      }

      // Process to graph format (pure function)
      const { nodes, relationships, documentRelationships, entityNameToId } =
        processRecordsToGraph(validResults);

      // DEBUG: Log what processRecordsToGraph returned
      logger.info({
        msg: '🔍 DEBUG: processRecordsToGraph results',
        nodesCount: nodes.length,
        relationshipsCount: relationships.length,
        documentRelationshipsCount: documentRelationships.length,
        entityMappings: entityNameToId.size,
        sampleNodes: nodes.slice(0, 3).map((n) => ({ id: n.id, type: n.type, title: n.title })),
        sampleRels: relationships.slice(0, 3).map((r) => ({
          source: r.sourceId,
          target: r.targetId,
          type: r.type,
        })),
        sampleDocRels: documentRelationships.slice(0, 3).map((r) => ({
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
          currentSchema,
        );

        if (newEntityTypes.length > 0 || newRelationshipTypes.length > 0) {
          await updateSchemaWithDiscovery(
            newEntityTypes,
            newRelationshipTypes,
            validResults.length,
          );
        }
      }

      // Store nodes using batch operations (FAST - no write conflicts)
      if (nodes.length > 0) {
        logger.info({
          msg: '🔍 DEBUG: About to save nodes to Memgraph',
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
            })),
          );
          logger.info({
            msg: '✅ DEBUG: Successfully saved nodes to Memgraph',
            nodesCount: nodes.length,
          });
        } catch (err) {
          logger.error({
            msg: '❌ DEBUG: Failed to save nodes to Memgraph',
            err,
            nodesCount: nodes.length,
          });
          throw err;
        }

        // 1.5. Create/update ALL document nodes in one batch
        // CRITICAL: Must exist before linking entities/relationships to documents
        const documentNodes = validResults.map((result) => {
          // Find the original record to get title
          const record = records.find((r) => r._id === result.recordId);
          return {
            id: result.recordId,
            title: record?.title || result.recordId,
            source: source,
          };
        });

        try {
          await graphStore.upsertDocumentNodes(documentNodes);
          logger.info({
            msg: '✅ DEBUG: Successfully saved document nodes to Memgraph',
            documentCount: documentNodes.length,
          });
        } catch (err) {
          logger.error({
            msg: '❌ DEBUG: Failed to save document nodes to Memgraph',
            err,
            documentCount: documentNodes.length,
          });
          throw err;
        }

        // 2. Collect all entity-to-document links
        const entityLinks: Array<{
          entityId: string;
          recordId: string;
        }> = [];
        for (const result of validResults) {
          const { nodes: recordNodes } = entitiesToGraphNodes(result.entities);
          for (const node of recordNodes) {
            entityLinks.push({
              entityId: node.id,
              recordId: result.recordId,
            });
          }
        }

        // 3. Link ALL entities to documents in one batch
        logger.info({
          msg: '🔗 Linking entities to documents (MENTIONED_IN)',
          totalCount: entityLinks.length,
        });

        await graphStore.linkEntitiesToDocuments(entityLinks);

        // 4. Create MongoDB metadata for all entities (for embedding tracking)
        // Build entity ID to normalized name map for reverse lookup
        const entityIdToNormalizedName = new Map<string, string>();
        for (const [normalizedName, id] of entityNameToId.entries()) {
          entityIdToNormalizedName.set(id, normalizedName);
        }

        const entityMetadataOps = nodes.map<
          Parameters<typeof GraphEmbeddingMetadata.bulkWrite>[0][0]
        >((node) => {
          // Calculate content checksum for this entity
          const contentChecksum = calculateEmbeddingChecksum({
            entityType: node.type,
            description: node.description,
            text: node.title,
          });

          // Lookup source documents directly from pre-computed map
          const normalizedName = entityIdToNormalizedName.get(node.id);
          const recordIds = normalizedName ? entityToDocuments.get(normalizedName) || [] : [];

          return {
            updateOne: {
              filter: { memgraphId: node.id },
              update: {
                $set: {
                  itemType: 'entity',
                  memgraphId: node.id,
                  entityType: node.type,
                  entityDescription: node.description, // Store LLM-extracted description
                  contentChecksum: contentChecksum,
                  lastUpdatedBy: recordIds[recordIds.length - 1],
                },
                $addToSet: {
                  sources: source,
                  sourceRecordIds: {
                    $each: recordIds, // Direct lookup - no filtering needed!
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

      // Store document relationships (document-to-document links from adapters)
      if (documentRelationships.length > 0) {
        logger.info({
          msg: '🔗 Creating document-to-document relationships',
          count: documentRelationships.length,
        });

        await graphStore.createDocumentRelationships(documentRelationships);

        logger.info({
          msg: '✅ Successfully created document relationships',
          count: documentRelationships.length,
        });
      }

      if (relationships.length > 0) {
        // Sanitize relationship types before logging and saving
        const sanitizationResults = relationships.map((rel) => ({
          original: rel,
          sanitizedType: sanitizeRelationshipType(rel.type),
          rawType: rel.type,
        }));

        // Separate valid from invalid relationships
        const validRelationships = sanitizationResults
          .filter((r) => r.sanitizedType !== null)
          .map((r) => ({
            ...r.original,
            type: r.sanitizedType!, // Use sanitized type
          }));

        const invalidRelationships = sanitizationResults.filter((r) => r.sanitizedType === null);

        // Log invalid relationships for debugging
        if (invalidRelationships.length > 0) {
          logger.warn({
            msg: '⚠️  Found invalid relationship types (will be skipped)',
            count: invalidRelationships.length,
            invalidRelationships: invalidRelationships.map((r) => ({
              sourceId: r.original.sourceId,
              targetId: r.original.targetId,
              rawType: r.rawType,
              confidence: r.original.confidence,
            })),
          });
        }

        // Group VALID relationships by type for summary
        const relsByType = new Map<string, number>();
        for (const rel of validRelationships) {
          relsByType.set(rel.type, (relsByType.get(rel.type) || 0) + 1);
        }

        logger.info({
          msg: '� Saving relationships to Memgraph',
          totalCount: validRelationships.length,
          invalidSkipped: invalidRelationships.length,
          summary: Object.fromEntries(relsByType),
          uniqueTypes: relsByType.size,
        });

        // 1. Create ALL semantic relationships in one batch (using VALID relationships only)
        await graphStore.upsertRelationshipsBatch(
          validRelationships.map((rel) => ({
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
            confidence: rel.confidence,
          })),
        );

        logger.info({
          msg: '✅ DEBUG: Successfully saved relationships to Memgraph',
          relationshipsCount: validRelationships.length,
        });

        // 2. Collect all document-to-relationship links
        // Use the pre-computed mapping to avoid re-running processRecordsToGraph per record
        const relLinks: Array<{
          recordId: string;
          relationshipType: string;
          sourceEntityId: string;
          targetEntityId: string;
          confidence: number;
        }> = [];

        // First, process LLM-extracted relationships (using VALID relationships only)
        for (const rel of validRelationships) {
          // Skip adapter relationships (they'll be processed separately)
          const isAdapterRel = validResults.some((result) =>
            result.adapterRelationships.some(
              (adapterRel) =>
                adapterRel.sourceId === rel.sourceId &&
                adapterRel.targetId === rel.targetId &&
                adapterRel.type === rel.type,
            ),
          );

          if (isAdapterRel) {
            // Will process this in the adapter relationships section below
            continue;
          }

          // Reconstruct the key to lookup source documents
          // We need to reverse-lookup entity names from IDs
          let sourceEntityName = '';
          let targetEntityName = '';

          // Find entity names by looking through the entityNameToId map
          for (const [name, id] of entityNameToId.entries()) {
            if (id === rel.sourceId) sourceEntityName = name;
            if (id === rel.targetId) targetEntityName = name;
            if (sourceEntityName && targetEntityName) break;
          }

          if (!sourceEntityName || !targetEntityName) {
            logger.warn({
              msg: '⚠️  Could not find entity names for relationship',
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              relType: rel.type,
            });
            continue;
          }

          const lookupKey = `${sourceEntityName}|${rel.type}|${targetEntityName}`;
          const recordIds = relToDocuments.get(lookupKey) || [];

          if (recordIds.length === 0) {
            logger.warn({
              msg: '⚠️  No source documents found for relationship',
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              relType: rel.type,
              lookupKey,
            });
            continue;
          }

          // Link this relationship to all documents that mentioned it
          for (const docId of recordIds) {
            relLinks.push({
              recordId: docId,
              relationshipType: rel.type,
              sourceEntityId: rel.sourceId,
              targetEntityId: rel.targetId,
              confidence: rel.confidence,
            });
          }
        }

        // Second, process adapter relationships (these use direct record IDs)
        let adapterLinksAdded = 0;

        // Re-enabled adapter relationships for document-to-document links
        for (const result of validResults) {
          for (const adapterRel of result.adapterRelationships) {
            relLinks.push({
              recordId: result.recordId,
              relationshipType: adapterRel.type,
              sourceEntityId: adapterRel.sourceId,
              targetEntityId: adapterRel.targetId,
              confidence: adapterRel.confidence,
            });
            adapterLinksAdded++;
          }
        }

        // Log document-to-relationship links summary
        logger.info({
          msg: '🔗 Tracking relationship mentions in MongoDB',
          totalMentions: relLinks.length,
          llmLinks: relLinks.length - adapterLinksAdded,
          adapterLinks: adapterLinksAdded,
        });

        // 3. Track relationship mentions in MongoDB (NEW approach - replaces MENTIONS_REL)
        const relationshipMentionStore = new RelationshipMentionStore();

        // Group mentions by document for efficient batch processing
        const mentionsByDocument = new Map<
          string,
          Array<{
            sourceEntityId: string;
            targetEntityId: string;
            type: string;
            confidence: number;
          }>
        >();

        for (const link of relLinks) {
          const existing = mentionsByDocument.get(link.recordId) || [];
          existing.push({
            sourceEntityId: link.sourceEntityId,
            targetEntityId: link.targetEntityId,
            type: link.relationshipType,
            confidence: link.confidence,
          });
          mentionsByDocument.set(link.recordId, existing);
        }

        // Add mentions for each document in parallel
        await Promise.all(
          Array.from(mentionsByDocument.entries()).map(([recordId, mentions]) =>
            relationshipMentionStore.addDocumentMentionsBatch(recordId, mentions),
          ),
        );

        logger.info({
          msg: '✅ Tracked relationship mentions in MongoDB',
          totalMentions: relLinks.length,
          documentsWithMentions: mentionsByDocument.size,
        });

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

        const relMetadataOps = validRelationships.map((rel) => {
          const relId = generateRelationshipMemgraphId(rel.sourceId, rel.type, rel.targetId);

          // Look up description from original extraction
          const lookupKey = `${rel.sourceId}_${rel.type}_${rel.targetId}`;
          const description = relDescriptionMap.get(lookupKey);

          // Calculate content checksum for this relationship
          const contentChecksum = calculateEmbeddingChecksum({
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            relType: rel.type,
          });

          // Find all documents that mention this relationship
          // Use the entity names to lookup in relToDocuments map
          let sourceEntityName = '';
          let targetEntityName = '';
          for (const [name, id] of entityNameToId.entries()) {
            if (id === rel.sourceId) sourceEntityName = name;
            if (id === rel.targetId) targetEntityName = name;
            if (sourceEntityName && targetEntityName) break;
          }

          const lookupKey2 = `${sourceEntityName}|${rel.type}|${targetEntityName}`;
          const recordIds = relToDocuments.get(lookupKey2) || [];

          return {
            updateOne: {
              filter: { memgraphId: relId },
              update: {
                $set: {
                  itemType: 'relationship',
                  memgraphId: relId,
                  sourceId: rel.sourceId,
                  targetId: rel.targetId,
                  relType: rel.type,
                  relationshipDescription: description, // Store LLM-extracted description
                  contentChecksum: contentChecksum,
                  lastUpdatedBy: recordIds[recordIds.length - 1],
                },
                $addToSet: {
                  sources: source,
                  sourceRecordIds: {
                    $each: recordIds, // Array of actual document IDs
                  },
                },
              },
              upsert: true,
            },
          };
        });

        if (relMetadataOps.length > 0) {
          await GraphEmbeddingMetadata.bulkWrite(relMetadataOps);
        }

        stats.relationships += validRelationships.length;
      }

      // Update ALL record metadata in parallel (MongoDB handles concurrency)
      await Promise.all(
        validResults.map((result) => {
          // Find the original record to get its checksum
          const record = records.find((r) => r._id === result.recordId);
          return recordStore.upsert({
            _id: result.recordId,
            lastGraphIndexAt: new Date(),
            lastGraphIndexChecksum: record?.checksum, // Store checksum at time of indexing
          });
        }),
      );

      // Update successful count
      stats.successfulRecords += validResults.length;

      // Track batch end time and calculate metrics
      const batchEndTime = Date.now();
      const batchTimeMs = batchEndTime - batchStartTime;
      batchTimes.push(batchTimeMs);

      // Calculate progress metrics
      const percentComplete =
        totalRecords > 0 ? ((stats.processedRecords / totalRecords) * 100).toFixed(1) : '0.0';

      const estimatedTotalBatches = totalRecords > 0 ? Math.ceil(totalRecords / batchSize) : 0;

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
      logger.error({ err }, 'Error processing batch');
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
    stats.processedRecords > 0 ? stats.totalRuntimeMs / stats.processedRecords : 0;
  stats.avgBatchTimeMs =
    batchTimes.length > 0 ? batchTimes.reduce((sum, time) => sum + time, 0) / batchTimes.length : 0;
  stats.throughputDocsPerSec =
    stats.totalRuntimeMs > 0 ? (stats.processedRecords / stats.totalRuntimeMs) * 1000 : 0;

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
      msg: '⚠️  Some records failed to index',
      failedRecords: stats.failedRecords,
    });
  }

  return stats;
};

/**
 * Index a single record
 * Useful for incremental updates
 * TODO: this is unused
 */
export const indexSingleRecord = async (
  record: Record,
  graphStore: GraphStore,
  recordStore: RecordStore,
  openaiClient: OpenAI,
  options: {
    enableToxicFilter?: boolean;
    maxEntitiesPerDoc?: number;
  } = {},
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
  const { entityTypes: existingEntityTypes, relationshipTypes: existingRelTypes } =
    getCurrentSchemaTypes(currentSchema);

  // Extract from single record
  const extractionResult = await extractGraphFromRecord(
    record,
    openaiClient,
    existingEntityTypes,
    existingRelTypes,
    { ...options, graphStore },
  );

  // Process to graph
  const { nodes, relationships } = processRecordsToGraph([extractionResult]);

  // Store in graph
  if (nodes.length > 0) {
    const memgraphNodes = nodes.map((node) => ({
      label: 'Entity',
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
      extractedBy: 'llm' as const,
    }));
    await graphStore.createRelationships(memgraphRels);
  }

  // Auto-discover new types
  if (currentSchema) {
    const { newEntityTypes, newRelationshipTypes } = discoverNewTypes(
      extractionResult.entities,
      extractionResult.relationships,
      currentSchema,
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
