import { Request, Response, Router } from 'express';
import { getSchema } from '../../stores/index.js';
import logger from '../../utils/logger.js';

const schemaRouter: Router = Router();

// GET /api/schema - Get full schema with entity and relationship types
schemaRouter.get('/schema', async (_req: Request, res: Response) => {
  try {
    const schema = await getSchema();

    if (!schema) {
      res.status(404).json({
        success: false,
        error: 'Schema not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        version: schema.version,
        entityTypes: schema.entityTypes,
        relationshipTypes: schema.relationshipTypes,
        lastLearnedAt: schema.lastLearnedAt,
        learnedFromSampleSize: schema.learnedFromSampleSize,
        persona: schema.persona,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching schema');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export { schemaRouter };
