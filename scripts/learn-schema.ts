#!/usr/bin/env node

/**
 * Enhanced Schema Learning Script
 *
 * Scans synced entities in MongoDB and uses both pattern-based and AI-powered
 * methods to automatically discover and update the graph schema.
 *
 * Modes:
 * 1. Pattern-Based (default): Fast extraction from structured data
 * 2. AI-Powered (--ai): Deep extraction from free-form text
 * 3. Persona-Driven (--ai --persona): User-customized extraction
 *
 * Usage:
 *   npx tsx scripts/learn-schema.ts [--limit 100] [--source notion] [--ai] [--persona "text or path"]
 */

import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { connectMongoose } from "../src/connections/mongoose.js";
import { RecordStore } from "../src/stores/record.store.js";
import { GraphSchemaStore } from "../src/stores/graph-schema.store.js";
import { SchemaLearningService } from "../src/services/schema/schema-learning.service.js";
import { LLMService } from "../src/services/llm/llm.service.js";
import { SourceType } from "../src/types/index.js";
import { IndexRequest } from "../src/types/indexing.types.js";
import OpenAI from "openai";
import { env } from "../src/env.js";
import { EntityType } from "../src/models/graph-schema.model.js";

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const sourceArg = args.find((arg) => arg.startsWith("--source="));
const aiFlag = args.includes("--ai");
const personaArg = args.find((arg) => arg.startsWith("--persona="));

const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 100;
const SOURCE = (sourceArg?.split("=")[1] as SourceType) || null;
const AI_MODE = aiFlag;
const PERSONA_INPUT = personaArg?.split("=")[1];

// Load persona
let PERSONA: string | undefined;
if (PERSONA_INPUT) {
  if (existsSync(PERSONA_INPUT)) {
    PERSONA = readFileSync(PERSONA_INPUT, "utf-8");
    console.log(`📖 Loaded persona from: ${PERSONA_INPUT}`);
  } else {
    PERSONA = PERSONA_INPUT;
    console.log(`📝 Using inline persona`);
  }
}

async function main() {
  console.log("🧠 Enhanced Schema Learning Script");
  console.log("=".repeat(60));
  console.log(
    `Mode: ${
      AI_MODE ? (PERSONA ? "Persona-Driven AI" : "AI-Powered") : "Pattern-Based"
    }`
  );
  console.log(`Learning from first ${LIMIT} entities`);
  if (SOURCE) {
    console.log(`Source filter: ${SOURCE}`);
  }
  if (PERSONA) {
    console.log(`Persona: ${PERSONA.substring(0, 100)}...`);
  }
  console.log();

  // Connect to MongoDB
  console.log("📦 Connecting to MongoDB...");
  const mongoConnection = await connectMongoose();
  console.log("✅ MongoDB connected\n");

  try {
    // Initialize services
    const entityStore = new RecordStore();
    const schemaStore = new GraphSchemaStore();
    const schemaLearner = new SchemaLearningService();

    let llmService: LLMService | undefined;
    if (AI_MODE) {
      const openai = new OpenAI({
        apiKey: env.LLM_API_KEY,
        baseURL: env.LLM_BASE_URL,
      });
      llmService = new LLMService(openai);
      console.log("🤖 AI mode enabled\n");
    }

    // Get current schema
    console.log("=".repeat(60));
    console.log("📋 CURRENT SCHEMA");
    console.log("=".repeat(60));

    const currentSchema = await schemaStore.getOrCreateSchema();
    console.log(`\nEntity Types (${currentSchema.entityTypes.length}):`);
    currentSchema.entityTypes.forEach((et) => {
      const props = et.properties?.length
        ? ` [${et.properties.slice(0, 3).join(", ")}${
            et.properties.length > 3 ? "..." : ""
          }]`
        : "";
      console.log(`  - ${et.name}${props}`);
    });

    console.log(
      `\nRelationship Types (${currentSchema.relationshipTypes.length}):`
    );
    currentSchema.relationshipTypes.forEach((rt) => {
      console.log(
        `  - ${rt.name}: ${rt.sourceTypes.join("|")} → ${rt.targetTypes.join(
          "|"
        )}`
      );
    });

    // Fetch entities
    console.log("\n" + "=".repeat(60));
    console.log("📚 FETCHING ENTITIES");
    console.log("=".repeat(60));

    let entities;
    if (SOURCE) {
      entities = await entityStore.findBySourceAndType(SOURCE, "", {
        limit: LIMIT,
        includeDeleted: false,
      });
    } else {
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

      entities = [];
      for (const source of allSources) {
        const sourceEntities = await entityStore.findBySourceAndType(
          source,
          "",
          { limit: LIMIT, includeDeleted: false }
        );
        entities.push(...sourceEntities);
        if (entities.length >= LIMIT) break;
      }
      entities = entities.slice(0, LIMIT);
    }

    console.log(`\n✅ Fetched ${entities.length} entities`);

    if (entities.length === 0) {
      console.log("\n⚠️  No entities found. Please sync data first.");
      console.log("Run: npx tsx scripts/notion-sync-example.ts");
      return;
    }

    // Show entity type breakdown
    const entityTypeBreakdown: Record<string, number> = {};
    entities.forEach((entity) => {
      entityTypeBreakdown[entity.entityType] =
        (entityTypeBreakdown[entity.entityType] || 0) + 1;
    });

    console.log("\nEntity Type Breakdown:");
    Object.entries(entityTypeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });

    // Learn schema
    console.log("\n" + "=".repeat(60));
    console.log("🔍 LEARNING SCHEMA");
    console.log("=".repeat(60));

    const allLearnedEntityTypes = new Map<string, EntityType>();
    const allLearnedRelationshipTypes = new Map<string>();

    const aiEntityTypes = new Map<string, any>();
    const aiRelationshipTypes = new Map<string, any>();

    // Phase 1: Pattern-Based Learning (always runs)
    console.log("\n📊 Phase 1: Pattern-Based Learning");
    let processed = 0;
    for (const entity of entities) {
      const request: IndexRequest = {
        source: {
          type: entity.source,
          serverId: entity.source,
        },
        toolCall: {
          name: "schema_learning",
          arguments: {},
        },
        toolResult: {
          content: [
            {
              type: "text",
              text: JSON.stringify(entity.rawData),
            },
          ],
        },
      };

      // Extract entity types
      const learnedEntityTypes = schemaLearner.extractEntityTypes(request);
      learnedEntityTypes.forEach((et) => {
        if (!allLearnedEntityTypes.has(et.name)) {
          allLearnedEntityTypes.set(et.name, et);
        } else {
          const existing = allLearnedEntityTypes.get(et.name)!;
          const mergedProps = [
            ...new Set([
              ...(existing.properties || []),
              ...(et.properties || []),
            ]),
          ];
          allLearnedEntityTypes.set(et.name, {
            ...existing,
            properties: mergedProps,
          });
        }
      });

      // Extract relationship types
      const learnedRelTypes = schemaLearner.extractRelationshipTypes(request);
      learnedRelTypes.forEach((rt) => {
        if (!allLearnedRelationshipTypes.has(rt.name)) {
          allLearnedRelationshipTypes.set(rt.name, rt);
        } else {
          const existing = allLearnedRelationshipTypes.get(rt.name)!;
          const mergedSourceTypes = [
            ...new Set([...existing.sourceTypes, ...rt.sourceTypes]),
          ];
          const mergedTargetTypes = [
            ...new Set([...existing.targetTypes, ...rt.targetTypes]),
          ];
          allLearnedRelationshipTypes.set(rt.name, {
            ...existing,
            sourceTypes: mergedSourceTypes,
            targetTypes: mergedTargetTypes,
          });
        }
      });

      processed++;
      if (processed % 10 === 0) {
        process.stdout.write(`\r  Processed: ${processed}/${entities.length}`);
      }
    }
    console.log(`\n✅ Pattern-based learning complete`);

    // Phase 2: AI-Powered Learning (if enabled)
    if (AI_MODE && llmService) {
      console.log("\n🤖 Phase 2: AI-Powered Learning");

      // Filter entities with sufficient content
      const contentEntities = entities.filter(
        (e) => e.content && e.content.length > 100
      );

      // Sample for AI analysis (limit to avoid high costs)
      const aiSampleSize = Math.min(20, contentEntities.length);
      const aiSample = contentEntities.slice(0, aiSampleSize);

      console.log(
        `  Analyzing ${aiSample.length} entities with rich content...`
      );

      const existingTypeNames = Array.from(allLearnedEntityTypes.keys());
      const existingRelationships = Array.from(
        allLearnedRelationshipTypes.values()
      );

      let aiProcessed = 0;
      for (const entity of aiSample) {
        try {
          // Extract entities from content
          const extractedEntities = await llmService.extractEntitiesFromContent(
            entity.content,
            existingTypeNames,
            PERSONA
          );

          extractedEntities.forEach((aiEntity) => {
            if (!aiEntityTypes.has(aiEntity.name)) {
              aiEntityTypes.set(aiEntity.name, {
                name: aiEntity.name,
                description: aiEntity.description,
                mcpSource: `${entity.source}_ai`,
                properties: [],
                confidence: aiEntity.confidence,
                method: PERSONA ? "persona" : "ai",
              });
            }
          });

          // Extract relationships from content
          if (extractedEntities.length > 0) {
            const extractedRels =
              await llmService.extractRelationshipsFromContent(
                entity.content,
                extractedEntities,
                existingRelationships,
                PERSONA
              );

            extractedRels.forEach((aiRel) => {
              if (!aiRelationshipTypes.has(aiRel.name)) {
                aiRelationshipTypes.set(aiRel.name, {
                  name: aiRel.name,
                  description: aiRel.description,
                  sourceTypes: aiRel.sourceTypes,
                  targetTypes: aiRel.targetTypes,
                  bidirectional: aiRel.bidirectional,
                  mcpSource: `${entity.source}_ai`,
                  confidence: aiRel.confidence,
                  method: PERSONA ? "persona" : "ai",
                });
              }
            });
          }

          aiProcessed++;
          process.stdout.write(
            `\r  AI Processed: ${aiProcessed}/${aiSample.length}`
          );

          // Rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(
            `\n  ⚠️  AI extraction failed for ${entity._id}:`,
            (error as Error).message
          );
        }
      }

      console.log(`\n✅ AI-powered learning complete`);

      // Merge AI results with pattern-based results
      aiEntityTypes.forEach((aiType, name) => {
        if (!allLearnedEntityTypes.has(name)) {
          allLearnedEntityTypes.set(name, aiType);
        }
      });

      aiRelationshipTypes.forEach((aiRel, name) => {
        if (!allLearnedRelationshipTypes.has(name)) {
          allLearnedRelationshipTypes.set(name, aiRel);
        }
      });
    }

    // Display learned schema
    console.log("\n" + "=".repeat(60));
    console.log("📊 LEARNED SCHEMA");
    console.log("=".repeat(60));

    const learnedEntityTypes = Array.from(allLearnedEntityTypes.values());
    const learnedRelationshipTypes = Array.from(
      allLearnedRelationshipTypes.values()
    );

    console.log(`\nDiscovered Entity Types (${learnedEntityTypes.length}):`);
    learnedEntityTypes.forEach((et: any) => {
      const props = et.properties?.length
        ? ` [${et.properties.slice(0, 5).join(", ")}${
            et.properties.length > 5 ? "..." : ""
          }]`
        : "";
      const method = et.method ? ` (${et.method})` : "";
      const confidence = et.confidence
        ? ` [conf: ${et.confidence.toFixed(2)}]`
        : "";
      console.log(`  ✨ ${et.name}${props}${method}${confidence}`);
      console.log(`     ${et.description}`);
    });

    console.log(
      `\nDiscovered Relationship Types (${learnedRelationshipTypes.length}):`
    );
    learnedRelationshipTypes.forEach((rt: any) => {
      const method = rt.method ? ` (${rt.method})` : "";
      const confidence = rt.confidence
        ? ` [conf: ${rt.confidence.toFixed(2)}]`
        : "";
      console.log(
        `  ✨ ${rt.name}: ${rt.sourceTypes.join("|")} → ${rt.targetTypes.join(
          "|"
        )}${method}${confidence}`
      );
      console.log(`     ${rt.description}`);
    });

    // Update schema
    console.log("\n" + "=".repeat(60));
    console.log("💾 UPDATING SCHEMA");
    console.log("=".repeat(60));

    const newEntityTypes = learnedEntityTypes.filter(
      (et) =>
        !currentSchema.entityTypes.some((existing) => existing.name === et.name)
    );

    const newRelationshipTypes = learnedRelationshipTypes.filter(
      (rt) =>
        !currentSchema.relationshipTypes.some(
          (existing) => existing.name === rt.name
        )
    );

    console.log(`\nNew Entity Types: ${newEntityTypes.length}`);
    newEntityTypes.forEach((et) => console.log(`  + ${et.name}`));

    console.log(`\nNew Relationship Types: ${newRelationshipTypes.length}`);
    newRelationshipTypes.forEach((rt) => console.log(`  + ${rt.name}`));

    if (newEntityTypes.length === 0 && newRelationshipTypes.length === 0) {
      console.log("\n✅ No new types discovered. Schema is up to date!");
    } else {
      if (newEntityTypes.length > 0) {
        await schemaStore.updateEntityTypes(newEntityTypes);
        console.log(`\n✅ Added ${newEntityTypes.length} entity types`);
      }

      if (newRelationshipTypes.length > 0) {
        await schemaStore.updateRelationshipTypes(newRelationshipTypes);
        console.log(
          `✅ Added ${newRelationshipTypes.length} relationship types`
        );
      }
    }

    // Display final schema
    console.log("\n" + "=".repeat(60));
    console.log("📋 FINAL SCHEMA");
    console.log("=".repeat(60));

    const finalSchema = await schemaStore.getSchema();
    if (finalSchema) {
      console.log(`\nTotal Entity Types: ${finalSchema.entityTypes.length}`);
      finalSchema.entityTypes.forEach((et) => {
        const isNew = newEntityTypes.some((n) => n.name === et.name);
        const marker = isNew ? "✨" : "  ";
        console.log(`  ${marker} ${et.name}`);
      });

      console.log(
        `\nTotal Relationship Types: ${finalSchema.relationshipTypes.length}`
      );
      finalSchema.relationshipTypes.forEach((rt) => {
        const isNew = newRelationshipTypes.some((n) => n.name === rt.name);
        const marker = isNew ? "✨" : "  ";
        console.log(
          `  ${marker} ${rt.name}: ${rt.sourceTypes.join(
            "|"
          )} → ${rt.targetTypes.join("|")}`
        );
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Schema learning complete!");
    console.log("=".repeat(60));
    console.log("\nNext steps:");
    console.log("  1. Review the learned schema above");
    console.log("  2. Run graph indexing to use the new schema:");
    console.log("     npx tsx scripts/complete-sync-flow.ts");
    if (!AI_MODE) {
      console.log("  3. Try AI mode for deeper extraction:");
      console.log("     npx tsx scripts/learn-schema.ts --ai --limit=50");
    }
    console.log();
  } catch (error) {
    console.error("\n❌ Error during schema learning:", error);
    throw error;
  } finally {
    await mongoConnection.close();
    console.log("🔌 MongoDB connection closed");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
