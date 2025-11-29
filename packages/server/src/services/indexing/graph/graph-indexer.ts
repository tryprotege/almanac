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
  deduplicateEntities,
  mergeRelationships,
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
}

export interface IndexingStats {
  nodes: number;
  relationships: number;
  errors: number;
  skippedToxic: number;
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
  } = {}
): Promise<ExtractionResult> => {
  // Extract explicit relationships using adapter
  let adapterRelationships: EntityRelationship[] = [];
  if (adapter && record.rawData) {
    try {
      adapterRelationships = await adapter.extractRelationships(record.rawData);
    } catch (error) {
      console.error(
        `Error extracting adapter relationships for ${record._id}:`,
        error instanceof Error ? error.message : error
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

  // Apply toxic filtering if enabled
  if (options.enableToxicFilter && isToxicChunk(entities, relationships)) {
    console.warn(`⚠️  Skipping toxic chunk for record ${record._id}`);
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
    relationships,
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
  // Flatten all entities across records
  const allEntities = recordsData.flatMap((data) => data.entities);

  // Deduplicate entities
  const dedupedEntities = deduplicateEntities(allEntities);

  // Flatten all relationships
  const allRelationships = recordsData.flatMap((data) => data.relationships);

  // Merge relationships
  const mergedRelationships = mergeRelationships(allRelationships);

  // Convert to graph format
  // We need to map entity names to node IDs across all records
  const entityNameToId = new Map<string, string>();
  const nodes: GraphNode[] = [];

  // First pass: collect all unique entities with their checksums
  for (const data of recordsData) {
    const { nodes: recordNodes, entityNameToId: recordMapping } =
      entitiesToGraphNodes(data.entities, data.recordId, data.recordChecksum);

    // Merge mappings and nodes
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
    batchSize = 100,
    concurrency = 32,
    enableToxicFilter = true,
    maxEntitiesPerDoc = 200,
  } = options;

  const stats: IndexingStats = {
    nodes: 0,
    relationships: 0,
    errors: 0,
    skippedToxic: 0,
  };

  console.log(`🔄 Starting graph indexing for source: ${source}`);

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
      // Extract in PARALLEL using p-limit
      const extractionPromises = records.map((record) =>
        limit(() =>
          extractGraphFromRecord(
            record,
            adapter,
            openaiClient,
            existingEntityTypes,
            existingRelTypes,
            { enableToxicFilter, maxEntitiesPerDoc }
          )
        )
      );

      const extractionResults = await Promise.all(extractionPromises);

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

      // Store nodes + relationships SERIALLY (avoid Memgraph conflicts)
      if (nodes.length > 0) {
        // Convert minimal nodes to Memgraph format
        const memgraphNodes = nodes.map((node) => ({
          label: "Entity", // Generic label for auto-discovered entities
          id: node.id,
          type: "entity",
          title: node.id.split("_").pop() || node.id,
        }));

        await graphStore.createNodes(memgraphNodes);
        stats.nodes += nodes.length;
      }

      if (relationships.length > 0) {
        // Convert to Memgraph format
        const memgraphRels = relationships.map((rel) => ({
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          type: rel.type,
          confidence: rel.confidence,
          extractedBy: "llm" as const,
        }));

        await graphStore.createRelationships(memgraphRels);
        stats.relationships += relationships.length;
      }

      // Update record metadata with schema version (serial to avoid conflicts)
      for (const result of validResults) {
        await recordStore.upsert({
          _id: result.recordId,
          lastGraphIndexDate: new Date(),
        });
      }

      console.log(
        `📊 Progress: ${stats.nodes} nodes, ${stats.relationships} relationships, ${stats.skippedToxic} toxic`
      );
    } catch (error) {
      console.error(`❌ Error processing batch:`, error);
      stats.errors++;
    }

    skip += records.length;
  }

  console.log(`✅ Graph indexing complete for ${source}`);
  console.log(`   Nodes: ${stats.nodes}`);
  console.log(`   Relationships: ${stats.relationships}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Skipped (toxic): ${stats.skippedToxic}`);

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
    options
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
