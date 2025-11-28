import {
  GraphEntityType,
  GraphRelationshipType,
} from "../../models/graph-schema.model.js";
import { SourceType } from "../../types/index.js";
import { RecordStore } from "../../stores/record.store.js";
import * as schemaStore from "../../stores/graph-schema.store.js";
import OpenAI from "openai";
import {
  extractEntitiesFromContent,
  extractRelationshipsFromContent,
} from "./schema-extraction.js";
import pLimit from "p-limit";
import { env } from "../../env.js";

// ============================================================================
// Types
// ============================================================================

export interface SchemaLearningOptions {
  limit?: number;
  source?: SourceType | null;
  persona?: string;
  aiSampleSize?: number;
  minContentLength?: number;
  concurrency?: number;
  maxBatchChars?: number;
}

export interface SchemaLearningResult {
  learnedEntityTypes: GraphEntityType[];
  learnedRelationshipTypes: GraphRelationshipType[];
  newEntityTypes: GraphEntityType[];
  newRelationshipTypes: GraphRelationshipType[];
  stats: {
    totalRecords: number;
    recordsProcessed: number;
    recordsWithContent: number;
  };
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Learn schema by analyzing sample records using AI
 * Pure function that orchestrates the schema learning process
 */
export async function learnSchema(
  openaiClient: OpenAI,
  recordStore: RecordStore,
  options: SchemaLearningOptions = {}
): Promise<SchemaLearningResult> {
  const {
    limit = 100,
    source = null,
    persona,
    aiSampleSize = 20,
    minContentLength = 100,
  } = options;

  // Fetch records
  const records = await fetchRecords(recordStore, source, limit);

  if (records.length === 0) {
    return createEmptyResult();
  }

  // Filter records with sufficient content
  const contentRecords = records.filter(
    (e) => e.content && e.content.length >= minContentLength
  );

  // Limit AI processing for cost control
  const recordsToProcess = contentRecords.slice(0, aiSampleSize);

  // Get current schema
  let currentSchema = await schemaStore.getSchema();
  if (!currentSchema) {
    currentSchema = await schemaStore.createSchema();
  }

  // Learn entity types
  const learnedEntityTypes = await extractEntityTypesFromRecords(
    openaiClient,
    recordsToProcess,
    currentSchema.entityTypes.map((et: GraphEntityType) => et.name),
    persona
  );

  // Learn relationship types
  const learnedRelationshipTypes = await extractRelationshipTypesFromRecords(
    openaiClient,
    recordsToProcess,
    learnedEntityTypes,
    currentSchema.relationshipTypes,
    persona
  );

  // Determine what's new
  const newEntityTypes = learnedEntityTypes.filter(
    (et: GraphEntityType) =>
      !currentSchema!.entityTypes.some(
        (existing: GraphEntityType) => existing.name === et.name
      )
  );

  const newRelationshipTypes = learnedRelationshipTypes.filter(
    (rt: GraphRelationshipType) =>
      !currentSchema!.relationshipTypes.some(
        (existing: GraphRelationshipType) => existing.name === rt.name
      )
  );

  return {
    learnedEntityTypes,
    learnedRelationshipTypes,
    newEntityTypes,
    newRelationshipTypes,
    stats: {
      totalRecords: records.length,
      recordsProcessed: recordsToProcess.length,
      recordsWithContent: contentRecords.length,
    },
  };
}

// ============================================================================
// Record Fetching
// ============================================================================

/**
 * Fetch records from the database
 * Pure function with I/O side effects
 */
export async function fetchRecords(
  recordStore: RecordStore,
  source: SourceType | null,
  limit: number
): Promise<any[]> {
  if (source) {
    return await recordStore.findBySourceAndType(source, "", {
      limit,
      includeDeleted: false,
    });
  }

  // Fetch from all sources
  const allSources: SourceType[] = [
    "notion",
    "slack",
    "calendar",
    "fathom",
    "whatsapp",
    "codebase",
    "asana",
    "jira",
    "google_drive",
  ];

  const records = [];
  for (const src of allSources) {
    const sourceRecords = await recordStore.findBySourceAndType(src, "", {
      limit,
      includeDeleted: false,
    });
    records.push(...sourceRecords);
    if (records.length >= limit) break;
  }

  return records.slice(0, limit);
}

// ============================================================================
// Batching Functions
// ============================================================================

/**
 * Create dynamic batches based on total character count
 * Ensures each batch stays under maxBatchChars limit
 */
function createDynamicBatches(
  records: any[],
  maxBatchChars: number = env.SCHEMA_LEARNING_MAX_BATCH_CHARS
): any[][] {
  const batches: any[][] = [];
  let currentBatch: any[] = [];
  let currentBatchSize = 0;

  for (const record of records) {
    const recordSize = record.content.length;

    // If adding this record exceeds limit, start new batch
    if (
      currentBatchSize + recordSize > maxBatchChars &&
      currentBatch.length > 0
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchSize = 0;
    }

    currentBatch.push(record);
    currentBatchSize += recordSize;
  }

  // Add final batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

// ============================================================================
// AI Extraction Functions
// ============================================================================

/**
 * Extract entity types from records using AI with parallel processing
 */
export async function extractEntityTypesFromRecords(
  openaiClient: OpenAI,
  records: any[],
  existingTypeNames: string[],
  persona?: string,
  options: { concurrency?: number; maxBatchChars?: number } = {}
): Promise<GraphEntityType[]> {
  const allEntityTypes = new Map<string, GraphEntityType>();
  const concurrency = options.concurrency || env.SCHEMA_LEARNING_CONCURRENCY;
  const maxBatchChars =
    options.maxBatchChars || env.SCHEMA_LEARNING_MAX_BATCH_CHARS;

  // Create dynamic batches
  const batches = createDynamicBatches(records, maxBatchChars);

  console.log(
    `\n🔄 Processing ${records.length} records in ${batches.length} batches with ${concurrency} concurrent requests...\n`
  );

  // Create concurrency limiter
  const limit = pLimit(concurrency);
  let completed = 0;

  // Process batches in parallel
  const promises = batches.map((batch, batchIndex) =>
    limit(async () => {
      const batchResults = new Map<string, GraphEntityType>();

      // Process all records in batch in parallel
      const recordPromises = batch.map(async (record) => {
        try {
          const extractedEntities = await extractEntitiesFromContent(
            openaiClient,
            record.content,
            existingTypeNames,
            persona
          );

          return {
            success: true,
            entities: extractedEntities,
            source: record.source,
          };
        } catch (error) {
          console.error(
            `  ⚠️  AI entity extraction failed for ${record._id}:`,
            (error as Error).message
          );
          return { success: false };
        }
      });

      const results = await Promise.all(recordPromises);

      // Merge results
      results.forEach((result) => {
        if (result.success && result.entities) {
          result.entities.forEach((aiEntity: GraphEntityType) => {
            if (!batchResults.has(aiEntity.name)) {
              batchResults.set(aiEntity.name, {
                name: aiEntity.name,
                description: aiEntity.description,
                mcpSource: `${result.source}_ai`,
                properties: [],
              });
            }
          });
        }
      });

      completed++;
      const progress = ((completed / batches.length) * 100).toFixed(1);
      const batchSize = batch.reduce((sum, r) => sum + r.content.length, 0);
      console.log(
        `  ✓ Batch ${completed}/${batches.length} (${progress}%) - ${
          batch.length
        } docs, ${(batchSize / 1000).toFixed(1)}KB`
      );

      return batchResults;
    })
  );

  const results = await Promise.all(promises);

  // Merge all results
  results.forEach((batchResults) => {
    batchResults.forEach((entityType, name) => {
      if (!allEntityTypes.has(name)) {
        allEntityTypes.set(name, entityType);
      }
    });
  });

  console.log(`\n✅ Completed all ${batches.length} batches!\n`);

  return Array.from(allEntityTypes.values());
}

/**
 * Extract relationship types from records using AI with parallel processing
 */
export async function extractRelationshipTypesFromRecords(
  openaiClient: OpenAI,
  records: any[],
  learnedEntityTypes: GraphEntityType[],
  existingRelationships: GraphRelationshipType[],
  persona?: string,
  options: { concurrency?: number; maxBatchChars?: number } = {}
): Promise<GraphRelationshipType[]> {
  const allRelationshipTypes = new Map<string, GraphRelationshipType>();
  const concurrency = options.concurrency || env.SCHEMA_LEARNING_CONCURRENCY;
  const maxBatchChars =
    options.maxBatchChars || env.SCHEMA_LEARNING_MAX_BATCH_CHARS;

  // Convert learned entity types to format expected by LLM
  const entityInstances = learnedEntityTypes.map((et) => ({
    name: et.name,
    instances: [], // We don't track instances at this stage
  }));

  if (entityInstances.length === 0) {
    return [];
  }

  // Create dynamic batches
  const batches = createDynamicBatches(records, maxBatchChars);

  console.log(
    `\n🔄 Processing ${records.length} records in ${batches.length} batches for relationships...\n`
  );

  // Create concurrency limiter
  const limit = pLimit(concurrency);
  let completed = 0;

  // Process batches in parallel
  const promises = batches.map((batch) =>
    limit(async () => {
      const batchResults = new Map<string, GraphRelationshipType>();

      // Process all records in batch in parallel
      const recordPromises = batch.map(async (record) => {
        try {
          const extractedRels = await extractRelationshipsFromContent(
            openaiClient,
            record.content,
            entityInstances,
            existingRelationships,
            persona
          );

          return {
            success: true,
            relationships: extractedRels,
            source: record.source,
          };
        } catch (error) {
          console.error(
            `  ⚠️  AI relationship extraction failed for ${record._id}:`,
            (error as Error).message
          );
          return { success: false };
        }
      });

      const results = await Promise.all(recordPromises);

      // Merge results
      results.forEach((result) => {
        if (result.success && result.relationships) {
          result.relationships.forEach((aiRel: GraphRelationshipType) => {
            if (!batchResults.has(aiRel.name)) {
              batchResults.set(aiRel.name, {
                name: aiRel.name,
                description: aiRel.description,
                sourceTypes: aiRel.sourceTypes,
                targetTypes: aiRel.targetTypes,
                bidirectional: aiRel.bidirectional,
                mcpSource: `${result.source}_ai`,
              });
            }
          });
        }
      });

      completed++;
      const progress = ((completed / batches.length) * 100).toFixed(1);
      const batchSize = batch.reduce((sum, r) => sum + r.content.length, 0);
      console.log(
        `  ✓ Batch ${completed}/${batches.length} (${progress}%) - ${
          batch.length
        } docs, ${(batchSize / 1000).toFixed(1)}KB`
      );

      return batchResults;
    })
  );

  const results = await Promise.all(promises);

  // Merge all results
  results.forEach((batchResults) => {
    batchResults.forEach((relType, name) => {
      if (!allRelationshipTypes.has(name)) {
        allRelationshipTypes.set(name, relType);
      }
    });
  });

  console.log(`\n✅ Completed all ${batches.length} batches!\n`);

  return Array.from(allRelationshipTypes.values());
}

// ============================================================================
// Merge Functions
// ============================================================================

/**
 * Merge learned entity types with existing schema
 * Pure function
 */
export function mergeEntityTypes(
  existing: GraphEntityType[],
  learned: GraphEntityType[]
): GraphEntityType[] {
  const merged = new Map<string, GraphEntityType>();

  // Add existing types
  for (const type of existing) {
    merged.set(type.name, type);
  }

  // Merge learned types
  for (const type of learned) {
    if (!merged.has(type.name)) {
      merged.set(type.name, type);
    } else {
      // Merge properties
      const existingType = merged.get(type.name)!;
      const newProps = type.properties || [];
      const existingProps = existingType.properties || [];
      const allProps = [...new Set([...existingProps, ...newProps])];

      merged.set(type.name, {
        ...existingType,
        properties: allProps,
      });
    }
  }

  return Array.from(merged.values());
}

/**
 * Merge learned relationship types with existing schema
 * Pure function
 */
export function mergeRelationshipTypes(
  existing: GraphRelationshipType[],
  learned: GraphRelationshipType[]
): GraphRelationshipType[] {
  const merged = new Map<string, GraphRelationshipType>();

  // Add existing types
  for (const type of existing) {
    merged.set(type.name, type);
  }

  // Merge learned types
  for (const type of learned) {
    if (!merged.has(type.name)) {
      merged.set(type.name, type);
    } else {
      // Merge source/target types
      const existingType = merged.get(type.name)!;
      const allSourceTypes = [
        ...new Set([...existingType.sourceTypes, ...type.sourceTypes]),
      ];
      const allTargetTypes = [
        ...new Set([...existingType.targetTypes, ...type.targetTypes]),
      ];

      merged.set(type.name, {
        ...existingType,
        sourceTypes: allSourceTypes,
        targetTypes: allTargetTypes,
      });
    }
  }

  return Array.from(merged.values());
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an empty schema learning result
 * Pure function
 */
export function createEmptyResult(): SchemaLearningResult {
  return {
    learnedEntityTypes: [],
    learnedRelationshipTypes: [],
    newEntityTypes: [],
    newRelationshipTypes: [],
    stats: {
      totalRecords: 0,
      recordsProcessed: 0,
      recordsWithContent: 0,
    },
  };
}

/**
 * Sleep for the specified duration (for rate limiting)
 * Pure function with side effect
 * NOTE: Currently unused - rate limiting removed for faster processing
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// High-Level Schema Learning Runner (with display logic)
// ============================================================================

export interface RunSchemaLearningResult {
  result: SchemaLearningResult;
  currentSchema: any;
  finalSchema: any;
}

/**
 * Run complete schema learning flow with console output
 * Combines learning, updating, and displaying results
 */
export async function runSchemaLearning(
  openaiClient: OpenAI,
  recordStore: RecordStore,
  options: SchemaLearningOptions & { verbose?: boolean } = {}
): Promise<RunSchemaLearningResult> {
  const { verbose = true, ...learningOptions } = options;

  // Get saved persona
  const savedPersona = await schemaStore.getPersona();

  // Get current schema
  let currentSchema = await schemaStore.getSchema();
  if (!currentSchema) {
    currentSchema = await schemaStore.createSchema();
  }

  if (verbose) {
    displayCurrentSchema(currentSchema, savedPersona);
  }

  // Run learning
  if (verbose) {
    console.log("\n" + "=".repeat(60));
    console.log("🔍 LEARNING SCHEMA WITH AI");
    console.log("=".repeat(60));
    console.log();
  }

  const result = await learnSchema(openaiClient, recordStore, {
    ...learningOptions,
    persona: savedPersona || undefined,
  });

  if (verbose) {
    await displayLearningStats(result, recordStore, options.source || null);
    displayLearnedSchema(result);
  }

  // Update schema
  await updateSchemaWithResults(result, verbose);

  // Get final schema
  const finalSchema = await schemaStore.getSchema();

  if (verbose && finalSchema) {
    displayFinalSchema(finalSchema, result);
    displayNextSteps();
  }

  return { result, currentSchema, finalSchema };
}

// ============================================================================
// Display Helper Functions
// ============================================================================

function displayCurrentSchema(schema: any, persona?: string | null): void {
  console.log("=".repeat(60));
  console.log("📋 CURRENT SCHEMA");
  console.log("=".repeat(60));

  if (persona) {
    console.log(`\n📝 Using saved persona: ${persona.substring(0, 100)}...`);
  }

  console.log(`\nSchema Version: ${schema.version}`);
  if (schema.lastLearnedAt) {
    console.log(`Last Learned: ${schema.lastLearnedAt.toISOString()}`);
  }

  console.log(`\nEntity Types (${schema.entityTypes.length}):`);
  schema.entityTypes.forEach((et: any) => {
    const props = et.properties?.length
      ? ` [${et.properties.slice(0, 3).join(", ")}${
          et.properties.length > 3 ? "..." : ""
        }]`
      : "";
    console.log(`  - ${et.name}${props}`);
  });

  console.log(`\nRelationship Types (${schema.relationshipTypes.length}):`);
  schema.relationshipTypes.forEach((rt: any) => {
    console.log(
      `  - ${rt.name}: ${rt.sourceTypes.join("|")} → ${rt.targetTypes.join(
        "|"
      )}`
    );
  });
}

async function displayLearningStats(
  result: SchemaLearningResult,
  recordStore: RecordStore,
  source: SourceType | null
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("📊 LEARNING STATISTICS");
  console.log("=".repeat(60));
  console.log(`\nTotal records fetched: ${result.stats.totalRecords}`);
  console.log(
    `Records with sufficient content: ${result.stats.recordsWithContent}`
  );
  console.log(`Records processed with AI: ${result.stats.recordsProcessed}`);

  // Display record type breakdown if we have records
  if (result.stats.totalRecords > 0) {
    const sampleRecords = await recordStore.findBySourceAndType(
      source || ("notion" as SourceType),
      "",
      { limit: Math.min(50, result.stats.totalRecords), includeDeleted: false }
    );

    const recordTypeBreakdown: Record<string, number> = {};
    sampleRecords.forEach((record: any) => {
      recordTypeBreakdown[record.recordType] =
        (recordTypeBreakdown[record.recordType] || 0) + 1;
    });

    console.log("\nRecord Type Breakdown (sample):");
    Object.entries(recordTypeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
  }
}

function displayLearnedSchema(result: SchemaLearningResult): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 LEARNED SCHEMA");
  console.log("=".repeat(60));

  console.log(
    `\nDiscovered Entity Types (${result.learnedEntityTypes.length}):`
  );
  result.learnedEntityTypes.forEach((et) => {
    console.log(`  ✨ ${et.name}`);
    console.log(`     ${et.description}`);
  });

  console.log(
    `\nDiscovered Relationship Types (${result.learnedRelationshipTypes.length}):`
  );
  result.learnedRelationshipTypes.forEach((rt) => {
    console.log(
      `  ✨ ${rt.name}: ${rt.sourceTypes.join("|")} → ${rt.targetTypes.join(
        "|"
      )}`
    );
    console.log(`     ${rt.description}`);
  });
}

async function updateSchemaWithResults(
  result: SchemaLearningResult,
  verbose: boolean
): Promise<void> {
  if (verbose) {
    console.log("\n" + "=".repeat(60));
    console.log("💾 UPDATING SCHEMA");
    console.log("=".repeat(60));

    console.log(`\nNew Entity Types: ${result.newEntityTypes.length}`);
    result.newEntityTypes.forEach((et) => console.log(`  + ${et.name}`));

    console.log(
      `\nNew Relationship Types: ${result.newRelationshipTypes.length}`
    );
    result.newRelationshipTypes.forEach((rt) => console.log(`  + ${rt.name}`));
  }

  if (
    result.newEntityTypes.length === 0 &&
    result.newRelationshipTypes.length === 0
  ) {
    if (verbose) {
      console.log("\n✅ No new types discovered. Schema is up to date!");
    }
    return;
  }

  if (result.newEntityTypes.length > 0) {
    await schemaStore.updateEntityTypes(
      result.newEntityTypes,
      "manual_learning",
      result.stats.recordsProcessed
    );
    if (verbose) {
      console.log(`\n✅ Added ${result.newEntityTypes.length} entity types`);
    }
  }

  if (result.newRelationshipTypes.length > 0) {
    await schemaStore.updateRelationshipTypes(
      result.newRelationshipTypes,
      "manual_learning",
      result.stats.recordsProcessed
    );
    if (verbose) {
      console.log(
        `✅ Added ${result.newRelationshipTypes.length} relationship types`
      );
    }
  }
}

function displayFinalSchema(
  finalSchema: any,
  result: SchemaLearningResult
): void {
  console.log("\n" + "=".repeat(60));
  console.log("📋 FINAL SCHEMA");
  console.log("=".repeat(60));

  console.log(`\nSchema Version: ${finalSchema.version}`);
  console.log(`Total Entity Types: ${finalSchema.entityTypes.length}`);
  finalSchema.entityTypes.forEach((et: any) => {
    const isNew = result.newEntityTypes.some((n) => n.name === et.name);
    const marker = isNew ? "✨" : "  ";
    console.log(`  ${marker} ${et.name}`);
  });

  console.log(
    `\nTotal Relationship Types: ${finalSchema.relationshipTypes.length}`
  );
  finalSchema.relationshipTypes.forEach((rt: any) => {
    const isNew = result.newRelationshipTypes.some((n) => n.name === rt.name);
    const marker = isNew ? "✨" : "  ";
    console.log(
      `  ${marker} ${rt.name}: ${rt.sourceTypes.join(
        "|"
      )} → ${rt.targetTypes.join("|")}`
    );
  });
}

function displayNextSteps(): void {
  console.log("\n" + "=".repeat(60));
  console.log("✅ Schema learning complete!");
  console.log("=".repeat(60));
  console.log("\nNext steps:");
  console.log("  1. Review the learned schema above");
  console.log("  2. Run graph indexing to use the new schema:");
  console.log("     npx tsx scripts/complete-sync-flow.ts");
  console.log();
}
