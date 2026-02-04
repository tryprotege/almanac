#!/usr/bin/env tsx
/**
 * Debug Data Check Script
 *
 * Queries Memgraph and Qdrant with hardcoded query "memgraph"
 * to verify data exists in both databases.
 */

import { connectQdrant } from '../src/connections/qdrant.js';
import { connectMemgraph } from '../src/connections/memgraph.js';
import { VectorStore } from '../src/stores/vector.store.js';
import { GraphStore } from '../src/stores/graph.store.js';
import { embed } from '../src/utils/embedding.js';
import logger from '../src/utils/logger.js';

const HARDCODED_QUERY = 'memgraph';
const SCORE_THRESHOLD = 0.3;

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 DEBUG DATA CHECK - Hardcoded Query: "memgraph"');
  console.log('='.repeat(80) + '\n');

  let qdrant;
  let memgraph;

  try {
    // Connect to databases
    console.log('📡 Connecting to databases...\n');
    qdrant = await connectQdrant();
    memgraph = await connectMemgraph();

    const vectorStore = new VectorStore(qdrant);
    const graphStore = new GraphStore(memgraph);

    // Ensure collection exists
    await vectorStore.ensureCollection();

    // Generate embedding for query
    console.log(`🧮 Generating embedding for query: "${HARDCODED_QUERY}"\n`);
    const [queryEmbedding] = await embed([HARDCODED_QUERY]);

    // ========================================
    // QDRANT CHECKS
    // ========================================
    console.log('='.repeat(80));
    console.log('📊 QDRANT VECTOR SEARCH RESULTS');
    console.log('='.repeat(80) + '\n');

    // Search for entities
    console.log(`🔎 Searching for ENTITIES (scoreThreshold: ${SCORE_THRESHOLD})...\n`);
    const entityResults = await vectorStore.searchEntities(queryEmbedding, {
      limit: 10,
      scoreThreshold: SCORE_THRESHOLD,
    });

    if (entityResults.length === 0) {
      console.log('❌ NO ENTITY RESULTS FOUND\n');
    } else {
      console.log(`✅ Found ${entityResults.length} entity results:\n`);
      entityResults.forEach((result, idx) => {
        console.log(`  ${idx + 1}. Score: ${result.score.toFixed(4)}`);
        console.log(`     ID: ${result.id}`);
        console.log(`     Entity ID: ${result.payload.entityId}`);
        console.log(`     Entity Type: ${result.payload.entityType}`);
        console.log(`     Entity Name: ${result.payload.entityName}`);
        console.log(`     Source: ${result.payload.source}`);
        console.log(`     Record ID: ${result.payload.recordId}`);
        console.log('');
      });
    }

    // Search for relationships
    console.log(`🔎 Searching for RELATIONSHIPS (scoreThreshold: ${SCORE_THRESHOLD})...\n`);
    const relationshipResults = await vectorStore.searchRelationships(queryEmbedding, {
      limit: 10,
      scoreThreshold: SCORE_THRESHOLD,
    });

    if (relationshipResults.length === 0) {
      console.log('❌ NO RELATIONSHIP RESULTS FOUND\n');
    } else {
      console.log(`✅ Found ${relationshipResults.length} relationship results:\n`);
      relationshipResults.forEach((result, idx) => {
        console.log(`  ${idx + 1}. Score: ${result.score.toFixed(4)}`);
        console.log(`     ID: ${result.id}`);
        console.log(`     Relationship Type: ${result.payload.relType}`);
        console.log(`     Source Entity: ${result.payload.sourceEntityId}`);
        console.log(`     Target Entity: ${result.payload.targetEntityId}`);
        console.log(`     Record ID: ${result.payload.recordId}`);
        console.log('');
      });
    }

    // ========================================
    // MEMGRAPH CHECKS
    // ========================================
    console.log('='.repeat(80));
    console.log('🕸️  MEMGRAPH GRAPH DATA');
    console.log('='.repeat(80) + '\n');

    // Get all graph data (first 20 nodes)
    console.log('🔎 Fetching graph nodes and relationships...\n');
    const graphData = await graphStore.getAllGraphData({
      limit: 20,
      offset: 0,
    });

    console.log(`📊 Total Nodes in Graph: ${graphData.totalNodes}`);
    console.log(`📊 Total Relationships in Graph: ${graphData.totalRelationships}\n`);

    if (graphData.nodes.length === 0) {
      console.log('❌ NO NODES FOUND IN GRAPH\n');
    } else {
      console.log(`✅ Sample of ${graphData.nodes.length} nodes:\n`);

      // Group nodes by type
      const nodesByType = new Map<string, typeof graphData.nodes>();
      graphData.nodes.forEach((node) => {
        const existing = nodesByType.get(node.type) || [];
        existing.push(node);
        nodesByType.set(node.type, existing);
      });

      // Display grouped by type
      for (const [type, nodes] of nodesByType.entries()) {
        console.log(`  📁 Type: ${type} (${nodes.length} nodes)`);
        nodes.slice(0, 3).forEach((node) => {
          console.log(`     - ${node.title} (ID: ${node.id})`);
        });
        if (nodes.length > 3) {
          console.log(`     ... and ${nodes.length - 3} more`);
        }
        console.log('');
      }
    }

    if (graphData.relationships.length === 0) {
      console.log('❌ NO RELATIONSHIPS FOUND IN GRAPH\n');
    } else {
      console.log(`✅ Sample of ${graphData.relationships.length} relationships:\n`);

      // Group relationships by type
      const relsByType = new Map<string, typeof graphData.relationships>();
      graphData.relationships.forEach((rel) => {
        const existing = relsByType.get(rel.type) || [];
        existing.push(rel);
        relsByType.set(rel.type, existing);
      });

      // Display grouped by type
      for (const [type, rels] of relsByType.entries()) {
        console.log(`  🔗 Type: ${type} (${rels.length} relationships)`);
        rels.slice(0, 3).forEach((rel) => {
          console.log(`     - ${rel.sourceId} → ${rel.targetId} (confidence: ${rel.confidence})`);
        });
        if (rels.length > 3) {
          console.log(`     ... and ${rels.length - 3} more`);
        }
        console.log('');
      }
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80) + '\n');

    console.log(`Query: "${HARDCODED_QUERY}"`);
    console.log(`Score Threshold: ${SCORE_THRESHOLD}\n`);

    console.log('Qdrant Results:');
    console.log(`  - Entities: ${entityResults.length} results`);
    console.log(`  - Relationships: ${relationshipResults.length} results\n`);

    console.log('Memgraph Data:');
    console.log(`  - Total Nodes: ${graphData.totalNodes}`);
    console.log(`  - Total Relationships: ${graphData.totalRelationships}`);
    console.log(`  - Sample Nodes: ${graphData.nodes.length}`);
    console.log(`  - Sample Relationships: ${graphData.relationships.length}\n`);

    // Diagnosis
    console.log('🔍 Diagnosis:');
    if (entityResults.length === 0 && relationshipResults.length === 0) {
      console.log('  ⚠️  No vector search results found in Qdrant');
      console.log('  → Check if embeddings have been indexed');
      console.log('  → Try lowering score threshold further');
    } else {
      console.log('  ✅ Vector search is returning results');
    }

    if (graphData.totalNodes === 0) {
      console.log('  ⚠️  No nodes found in Memgraph');
      console.log('  → Check if graph extraction has run');
    } else {
      console.log('  ✅ Graph data exists in Memgraph');
    }

    console.log('\n' + '='.repeat(80) + '\n');
  } catch (err) {
    logger.error({ err }, 'Error during debug data check');
    console.error('\n❌ Error:', err);
    process.exit(1);
  } finally {
    // Cleanup
    if (qdrant) {
      await qdrant.close();
    }
    if (memgraph) {
      await memgraph.close();
    }
  }
}

main();
