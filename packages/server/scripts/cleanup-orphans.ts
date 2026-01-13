import 'dotenv/config';
import { initializeServices } from '../src/mcp/initialization.js';
import { GraphStore } from '../src/stores/graph.store.js';
import { RelationshipMentionStore } from '../src/stores/relationship-mention.store.js';
import { GraphEmbeddingMetadata } from '../src/models/graph-embedding-metadata.model.js';
import logger from '../src/utils/logger.js';

/**
 * Script to cleanup orphaned entities and relationships
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-orphans.ts                    # Full cleanup
 *   pnpm tsx scripts/cleanup-orphans.ts --dry-run          # Preview without deleting
 *   pnpm tsx scripts/cleanup-orphans.ts --entities-only    # Only clean entities
 *   pnpm tsx scripts/cleanup-orphans.ts --relationships-only # Only clean relationships
 */

interface ScriptOptions {
  dryRun: boolean;
  entitiesOnly: boolean;
  relationshipsOnly: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    dryRun: false,
    entitiesOnly: false,
    relationshipsOnly: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--entities-only') {
      options.entitiesOnly = true;
    } else if (arg === '--relationships-only') {
      options.relationshipsOnly = true;
    }
  }

  return options;
}

async function cleanupOrphanedRelationships(
  graphStore: GraphStore,
  dryRun: boolean,
): Promise<{
  foundOrphans: number;
  deletedFromMemgraph: number;
  deletedMetadata: number;
}> {
  logger.info({ msg: '🔍 Finding orphaned relationships...' });

  const relationshipMentionStore = new RelationshipMentionStore();

  // 1. Find orphaned relationships in MongoDB
  const orphanedRels = await relationshipMentionStore.findOrphanedRelationships();

  logger.info({
    msg: `Found ${orphanedRels.length} orphaned relationships`,
    sample: orphanedRels.slice(0, 5).map((r) => ({
      sourceId: r.sourceEntityId,
      targetId: r.targetEntityId,
      type: r.type,
    })),
  });

  let deletedFromMemgraph = 0;
  let deletedMetadata = 0;

  if (!dryRun && orphanedRels.length > 0) {
    logger.info({
      msg: '🗑️  Deleting orphaned relationships from Memgraph...',
    });

    // 2. Delete orphaned relationships from Memgraph
    for (const rel of orphanedRels) {
      try {
        await graphStore.deleteRelationship(rel.sourceEntityId, rel.type, rel.targetEntityId);
        deletedFromMemgraph++;
      } catch (err) {
        logger.error({
          msg: 'Failed to delete orphaned relationship from Memgraph',
          err,
          relationship: rel,
        });
      }
    }

    logger.info({
      msg: `✅ Deleted ${deletedFromMemgraph} relationships from Memgraph`,
    });

    // 3. Delete orphaned relationship metadata from MongoDB
    logger.info({
      msg: '🗑️  Deleting orphaned relationship metadata from MongoDB...',
    });
    deletedMetadata = await relationshipMentionStore.deleteOrphanedRelationships();

    logger.info({
      msg: `✅ Deleted ${deletedMetadata} relationship metadata entries`,
    });
  }

  return {
    foundOrphans: orphanedRels.length,
    deletedFromMemgraph,
    deletedMetadata,
  };
}

async function cleanupOrphanedEntities(
  graphStore: GraphStore,
  dryRun: boolean,
): Promise<{
  foundOrphans: number;
  deletedFromMemgraph: number;
  deletedMetadata: number;
}> {
  logger.info({ msg: '🔍 Finding orphaned entities...' });

  // Query for orphaned entities (entities with no relationships)
  const orphanedEntitiesQuery = `
    MATCH (entity:Entity)
    WHERE NOT (entity)-[]-()
    RETURN entity.id AS id, entity.type AS type, entity.title AS title
  `;

  const orphanedEntities = await graphStore['memgraph'].executeQuery<{
    id: string;
    type: string;
    title: string;
  }>(orphanedEntitiesQuery, {});

  logger.info({
    msg: `Found ${orphanedEntities.length} orphaned entities`,
    sample: orphanedEntities.slice(0, 5).map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
    })),
  });

  // Group by type for summary
  const entitiesByType = new Map<string, number>();
  for (const entity of orphanedEntities) {
    entitiesByType.set(entity.type, (entitiesByType.get(entity.type) || 0) + 1);
  }

  logger.info({
    msg: '📊 Orphaned entities by type',
    summary: Object.fromEntries(entitiesByType),
  });

  let deletedFromMemgraph = 0;
  let deletedMetadata = 0;

  if (!dryRun && orphanedEntities.length > 0) {
    logger.info({ msg: '🗑️  Deleting orphaned entities from Memgraph...' });

    // Delete from Memgraph
    for (const entity of orphanedEntities) {
      try {
        await graphStore.deleteNode(entity.id);
        deletedFromMemgraph++;
      } catch (err) {
        logger.error({
          msg: 'Failed to delete orphaned entity from Memgraph',
          err,
          entity,
        });
      }
    }

    logger.info({
      msg: `✅ Deleted ${deletedFromMemgraph} entities from Memgraph`,
    });

    // Delete metadata from MongoDB
    logger.info({
      msg: '🗑️  Deleting orphaned entity metadata from MongoDB...',
    });

    const entityIds = orphanedEntities.map((e) => e.id);
    const result = await GraphEmbeddingMetadata.deleteMany({
      _id: { $in: entityIds },
      itemType: 'entity',
    });

    deletedMetadata = result.deletedCount || 0;

    logger.info({
      msg: `✅ Deleted ${deletedMetadata} entity metadata entries`,
    });
  }

  return {
    foundOrphans: orphanedEntities.length,
    deletedFromMemgraph,
    deletedMetadata,
  };
}

async function cleanupOrphans() {
  const options = parseArgs();

  logger.info({
    msg: '🧹 Orphan Cleanup Script',
    dryRun: options.dryRun,
    entitiesOnly: options.entitiesOnly,
    relationshipsOnly: options.relationshipsOnly,
  });

  if (options.dryRun) {
    logger.warn({
      msg: '⚠️  DRY RUN MODE - No deletions will be performed',
    });
  }

  const { memgraph } = await initializeServices();
  const graphStore = new GraphStore(memgraph);

  const stats = {
    relationships: {
      foundOrphans: 0,
      deletedFromMemgraph: 0,
      deletedMetadata: 0,
    },
    entities: {
      foundOrphans: 0,
      deletedFromMemgraph: 0,
      deletedMetadata: 0,
    },
  };

  // Cleanup relationships (unless entities-only)
  if (!options.entitiesOnly) {
    logger.info({ msg: '🔧 Cleaning up orphaned relationships...' });
    stats.relationships = await cleanupOrphanedRelationships(graphStore, options.dryRun);
  }

  // Cleanup entities (unless relationships-only)
  if (!options.relationshipsOnly) {
    logger.info({ msg: '🔧 Cleaning up orphaned entities...' });
    stats.entities = await cleanupOrphanedEntities(graphStore, options.dryRun);
  }

  // Final summary
  logger.info({
    msg: '✨ Cleanup complete',
    summary: {
      relationships: {
        found: stats.relationships.foundOrphans,
        deletedFromMemgraph: stats.relationships.deletedFromMemgraph,
        deletedMetadata: stats.relationships.deletedMetadata,
      },
      entities: {
        found: stats.entities.foundOrphans,
        deletedFromMemgraph: stats.entities.deletedFromMemgraph,
        deletedMetadata: stats.entities.deletedMetadata,
      },
      totalOrphansFound: stats.relationships.foundOrphans + stats.entities.foundOrphans,
      totalDeleted: stats.relationships.deletedFromMemgraph + stats.entities.deletedFromMemgraph,
    },
  });

  if (options.dryRun) {
    logger.warn({
      msg: '⚠️  DRY RUN - Run without --dry-run to actually delete orphans',
    });
  }
}

const run = async () => {
  await cleanupOrphans();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Script error');
    process.exit(1);
  });
