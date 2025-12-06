import { embed } from "../../../utils/embedding.js";
import { VectorStore } from "../../../stores/vector.store.js";
import { RecordStore } from "../../../stores/record.store.js";
import { GraphStore } from "../../../stores/graph.store.js";
import {
  SourceType,
  EntityVectorPayload,
  RelationshipVectorPayload,
} from "../../../types/index.js";
import { Record } from "../../../models/record.model.js";

// ============================================
// Entity Embedding Functions
// ============================================

/**
 * Create semantic text representation of an entity for embedding
 */
function createEntityText(record: Record): string {
  const description = record.content.substring(0, 300);
  return `${record.title}\n${record.recordType}\n${description}`;
}

/**
 * Index all entity embeddings for a source
 */
export async function indexEntityEmbeddings(
  source: SourceType,
  deps: {
    vectorStore: VectorStore;
    recordStore: RecordStore;
    graphStore: GraphStore;
  }
): Promise<{ indexed: number; errors: number }> {
  const stats = { indexed: 0, errors: 0 };

  console.log(`🔮 Indexing entity embeddings for source: ${source}`);

  // Fetch all records for source
  const records = await deps.recordStore.findBySourceAndType(source, "", {
    includeDeleted: false,
  });

  if (records.length === 0) {
    console.log(`⚠️  No records found for ${source}`);
    return stats;
  }

  // Batch fetch node degrees
  const nodeIds = records.map((r) => r._id);
  const degreeCounts = await deps.graphStore.getNodeRelationshipCounts(nodeIds);

  // Create entity text for embedding
  const entityTexts = records.map((record) => createEntityText(record));

  // Generate embeddings in batches
  console.log(`   Embedding ${entityTexts.length} entities...`);
  const embeddings = await embed(entityTexts);

  // Create vector points
  const points = records.map((record, index) => ({
    id: `entity_${record._id}`,
    vector: embeddings[index],
    payload: {
      type: "entity" as const,
      mongoId: record._id,
      recordType: record.recordType,
      source: record.source,
      degree: degreeCounts.get(record._id) || 0,
      checksum: record.checksum,
    } as EntityVectorPayload,
  }));

  // Upsert to Qdrant
  await deps.vectorStore.upsertPoints(points);
  stats.indexed = points.length;

  console.log(`✅ Indexed ${stats.indexed} entity embeddings`);
  return stats;
}

// ============================================
// Relationship Embedding Functions
// ============================================

/**
 * Create semantic text representation of a relationship for embedding
 */
function createRelationshipText(
  rel: { sourceId: string; targetId: string; type: string; confidence: number },
  recordMap: Map<string, Record>
): string {
  const source = recordMap.get(rel.sourceId);
  const target = recordMap.get(rel.targetId);

  // Format: "SourceName\tTargetName\nRelationType\nConfidence: X.X"
  return `${source?.title || "Unknown"}\t${target?.title || "Unknown"}\n${
    rel.type
  }\nConfidence: ${rel.confidence.toFixed(2)}`;
}

/**
 * Index all relationship embeddings for a source
 */
export async function indexRelationshipEmbeddings(
  source: SourceType,
  deps: {
    vectorStore: VectorStore;
    graphStore: GraphStore;
    recordStore: RecordStore;
  }
): Promise<{ indexed: number; errors: number }> {
  const stats = { indexed: 0, errors: 0 };

  console.log(`🔮 Indexing relationship embeddings for source: ${source}`);

  // Get all relationships from graph
  const relationships = await deps.graphStore.getAllRelationships({ source });

  if (relationships.length === 0) {
    console.log(`⚠️  No relationships found for ${source}`);
    return stats;
  }

  // Fetch entity details for source/target
  const entityIds = new Set<string>();
  relationships.forEach((rel) => {
    entityIds.add(rel.sourceId);
    entityIds.add(rel.targetId);
  });

  const records = await deps.recordStore.findByIds(Array.from(entityIds));
  const recordMap = new Map(records.map((r) => [r._id, r]));

  // Create relationship text for embedding
  const relTexts = relationships.map((rel) =>
    createRelationshipText(rel, recordMap)
  );

  // Generate embeddings
  console.log(`   Embedding ${relTexts.length} relationships...`);
  const embeddings = await embed(relTexts);

  // Create vector points
  const points = relationships.map((rel, index) => ({
    id: `rel_${rel.sourceId}_${rel.type}_${rel.targetId}`,
    vector: embeddings[index],
    payload: {
      type: "relationship" as const,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      relType: rel.type,
      confidence: rel.confidence,
      extractedBy: rel.extractedBy,
      sourceType: recordMap.get(rel.sourceId)?.recordType || "unknown",
      targetType: recordMap.get(rel.targetId)?.recordType || "unknown",
    } as RelationshipVectorPayload,
  }));

  // Upsert to Qdrant
  await deps.vectorStore.upsertPoints(points);
  stats.indexed = points.length;

  console.log(`✅ Indexed ${stats.indexed} relationship embeddings`);
  return stats;
}
