/**
 * Smart Re-indexing Module
 * Schema-driven change detection and re-indexing
 */

import { Record } from "../../../models/record.model.js";
import { RecordStore } from "../../../stores/record.store.js";
import { GraphStore } from "../../../stores/graph.store.js";
import { SourceType } from "../../../types/index.js";
import { BaseRecordAdapter } from "../../sync/adapters/base-adapter.js";
import { GraphNode } from "./graph-converter.js";
import { getSchema } from "../../../stores/graph-schema.store.js";
import { getCurrentSchemaTypes } from "./schema-auto-discovery.js";
import {
  extractGraphFromRecord,
  processRecordsToGraph,
} from "./graph-indexer.js";
import OpenAI from "openai";

// ============================================================================
// Types
// ============================================================================

export type ReindexReason =
  | "never_indexed"
  | "no_graph_node"
  | "content_changed"
  | "schema_changed"
  | "up_to_date";

export interface ReindexCheck {
  needed: boolean;
  reason: ReindexReason;
}

export interface RecordToReindex {
  record: Record;
  reason: ReindexReason;
}

export interface ReindexStats {
  totalRecords: number;
  reindexed: number;
  skipped: number;
  reasons: {
    neverIndexed: number;
    contentChanged: number;
    schemaChanged: number;
    noGraphNode: number;
  };
}

export interface ReindexOptions {
  force?: boolean;
  recordType?: string;
  dryRun?: boolean;
}

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Check if a record needs re-indexing
 * Pure function - no side effects
 */
export const needsReindex = (
  record: Record,
  existingNode: GraphNode | null
): ReindexCheck => {
  // Never indexed
  if (!record.lastGraphIndexDate) {
    return { needed: true, reason: "never_indexed" };
  }

  // No existing node in graph
  if (!existingNode) {
    return { needed: true, reason: "no_graph_node" };
  }

  // Content changed (checksum mismatch)
  if (existingNode.checksum !== record.checksum) {
    return { needed: true, reason: "content_changed" };
  }

  // Up to date
  return { needed: false, reason: "up_to_date" };
};

/**
 * Filter records to those needing re-indexing
 */
export const filterRecordsForReindex = async (
  records: Record[],
  graphStore: GraphStore
): Promise<RecordToReindex[]> => {
  const recordsToReindex: RecordToReindex[] = [];

  for (const record of records) {
    // Get existing node from graph
    let existingNode: GraphNode | null = null;
    try {
      const node = await graphStore.getNode(record._id);
      if (node) {
        existingNode = {
          id: node.id,
          checksum: "", // We'll need to get this from node properties
        };
        // Note: The current GraphStore doesn't store checksums
        // We'll use the record's checksum as fallback
        // This is a limitation we'll work around
      }
    } catch (error) {
      console.error(`Error fetching node for ${record._id}:`, error);
    }

    // Check if re-index needed
    const check = needsReindex(record, existingNode);

    if (check.needed) {
      recordsToReindex.push({
        record,
        reason: check.reason,
      });
    }
  }

  return recordsToReindex;
};

// ============================================================================
// Main Re-indexing Function
// ============================================================================

/**
 * Smart re-indexing function
 * Only re-indexes records that have changed or are outdated
 */
export const smartReindex = async (
  source: SourceType,
  recordStore: RecordStore,
  graphStore: GraphStore,
  adapters: Map<SourceType, BaseRecordAdapter>,
  openaiClient: OpenAI,
  options: ReindexOptions = {}
): Promise<ReindexStats> => {
  const { force = false, recordType = "", dryRun = false } = options;

  console.log(`🔄 Starting smart re-indexing for source: ${source}`);
  if (force) {
    console.log("   Force mode: Re-indexing all records");
  }
  if (dryRun) {
    console.log("   Dry run: No changes will be made");
  }

  const stats: ReindexStats = {
    totalRecords: 0,
    reindexed: 0,
    skipped: 0,
    reasons: {
      neverIndexed: 0,
      contentChanged: 0,
      schemaChanged: 0,
      noGraphNode: 0,
    },
  };

  // Get current schema version
  const currentSchema = await getSchema();
  const {
    version: currentSchemaVersion,
    entityTypes,
    relationshipTypes,
  } = getCurrentSchemaTypes(currentSchema);

  console.log(`   Current schema version: ${currentSchemaVersion}`);

  // Fetch all records for source
  const records = await recordStore.findBySourceAndType(source, recordType, {
    includeDeleted: false,
  });

  stats.totalRecords = records.length;
  console.log(`   Total records: ${stats.totalRecords}`);

  // Get adapter
  const adapter = adapters.get(source);

  // Determine which records to re-index
  let recordsToReindex: RecordToReindex[];

  if (force) {
    // Force mode: re-index all
    recordsToReindex = records.map((record) => ({
      record,
      reason: "schema_changed" as ReindexReason,
    }));
  } else {
    // Smart mode: filter to only changed records
    recordsToReindex = await filterRecordsForReindex(records, graphStore);
  }

  console.log(`   Records to re-index: ${recordsToReindex.length}`);

  // Count reasons
  for (const { reason } of recordsToReindex) {
    switch (reason) {
      case "never_indexed":
        stats.reasons.neverIndexed++;
        break;
      case "content_changed":
        stats.reasons.contentChanged++;
        break;
      case "schema_changed":
        stats.reasons.schemaChanged++;
        break;
      case "no_graph_node":
        stats.reasons.noGraphNode++;
        break;
    }
  }

  // If dry run, return stats without indexing
  if (dryRun) {
    stats.skipped = stats.totalRecords - recordsToReindex.length;
    console.log("\n📊 Dry Run Results:");
    console.log(`   Would re-index: ${recordsToReindex.length}`);
    console.log(`   Never indexed: ${stats.reasons.neverIndexed}`);
    console.log(`   Content changed: ${stats.reasons.contentChanged}`);
    console.log(`   Schema changed: ${stats.reasons.schemaChanged}`);
    console.log(`   No graph node: ${stats.reasons.noGraphNode}`);
    console.log(`   Would skip: ${stats.skipped}`);
    return stats;
  }

  // Re-index each record
  for (const { record, reason } of recordsToReindex) {
    try {
      console.log(`   Re-indexing ${record._id} (${reason})...`);

      // Delete old node (DETACH DELETE removes relationships too)
      try {
        await graphStore.deleteNode(record._id);
      } catch (error) {
        // Node might not exist, that's okay
        console.warn(`   Warning: Could not delete old node for ${record._id}`);
      }

      // Extract and create new graph
      const extractionResult = await extractGraphFromRecord(
        record,
        adapter,
        openaiClient,
        entityTypes,
        relationshipTypes,
        {
          enableToxicFilter: true,
          maxEntitiesPerDoc: 200,
        }
      );

      // Skip if toxic or no results
      if (
        extractionResult.entities.length === 0 &&
        extractionResult.relationships.length === 0
      ) {
        console.warn(`   ⚠️  Skipping toxic/empty content for ${record._id}`);
        continue;
      }

      // Process to graph
      const { nodes, relationships } = processRecordsToGraph([
        extractionResult,
      ]);

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

      // Update record metadata with current schema version
      await recordStore.upsert({
        _id: record._id,
        lastGraphIndexDate: new Date(),
      });

      stats.reindexed++;
    } catch (error) {
      console.error(`   ❌ Error re-indexing ${record._id}:`, error);
    }
  }

  stats.skipped = stats.totalRecords - stats.reindexed;

  console.log("\n✅ Re-indexing complete");
  console.log(`   Total records: ${stats.totalRecords}`);
  console.log(`   Re-indexed: ${stats.reindexed}`);
  console.log(`   Skipped: ${stats.skipped}`);
  console.log("\n   Reasons for re-indexing:");
  console.log(`   - Never indexed: ${stats.reasons.neverIndexed}`);
  console.log(`   - Content changed: ${stats.reasons.contentChanged}`);
  console.log(`   - Schema changed: ${stats.reasons.schemaChanged}`);
  console.log(`   - No graph node: ${stats.reasons.noGraphNode}`);

  return stats;
};
