import { Request, Response, Router } from 'express';
import { initializeServices } from '../../mcp/initialization.js';
import { StatsService } from '../../services/stats/index.js';
import { CacheStore } from '../../stores/cache.store.js';
import { GraphStore } from '../../stores/graph.store.js';
import { RecordStore } from '../../stores/record.store.js';
import { VectorStore } from '../../stores/vector.store.js';
import logger from '../../utils/logger.js';

const statsRouter: Router = Router();

// Initialize stores and service
let statsService: StatsService | null = null;

async function getStatsService(): Promise<StatsService> {
  if (!statsService) {
    const services = await initializeServices();
    const recordStore = new RecordStore();
    const vectorStore = new VectorStore(services.qdrant);
    const graphStore = new GraphStore(services.memgraph);
    const cacheStore = new CacheStore(services.redis);

    statsService = new StatsService(recordStore, vectorStore, graphStore, cacheStore);
  }
  return statsService;
}

// GET /api/stats/overview - Get overview statistics
statsRouter.get('/overview', async (_req: Request, res: Response) => {
  try {
    const service = await getStatsService();
    const stats = await service.getOverview();

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching overview stats');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/stats/records - Get detailed record statistics
statsRouter.get('/records', async (_req: Request, res: Response) => {
  try {
    const service = await getStatsService();
    const stats = await service.getRecordStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching record stats');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/stats/vectors - Get vector database statistics
statsRouter.get('/vectors', async (_req: Request, res: Response) => {
  try {
    const service = await getStatsService();
    const stats = await service.getVectorStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching vector stats');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/stats/graph - Get graph database statistics
statsRouter.get('/graph', async (_req: Request, res: Response) => {
  try {
    const service = await getStatsService();
    const stats = await service.getGraphStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching graph stats');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/stats/activity - Get recent sync activity
statsRouter.get('/activity', async (_req: Request, res: Response) => {
  try {
    const service = await getStatsService();
    const activity = await service.getRecentActivity();

    res.json({
      success: true,
      data: activity,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching recent activity');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export { statsRouter };
