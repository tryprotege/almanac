import { Request, Response, Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { DataSourceModel } from '../../models/data-source.model.js';
import { mcpClientManager } from '../../mcp/client.js';
import { syncMcpServerQueue } from '../../services/queue/sync.queue.js';
import logger from '../../utils/logger.js';

export const syncRouter: ExpressRouter = Router();

/**
 * POST /api/sync
 * Trigger a sync job for a data source
 */
syncRouter.post('/', async (req: Request, res: Response) => {
  try {
    const configId = req.body.configId;
    const config = await DataSourceModel.findById(configId);

    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Data source config not found',
      });
      return;
    }

    // Auto-connect if not already connected
    if (!mcpClientManager.isConnected(config.name)) {
      logger.info(
        { serverName: config.name },
        'MCP server not connected, attempting connection before sync',
      );

      try {
        await mcpClientManager.connect(config);
        logger.info({ serverName: config.name }, 'MCP server connected successfully');
      } catch (connectError) {
        logger.error(
          { err: connectError, serverName: config.name },
          'Failed to connect to MCP server',
        );
        res.status(500).json({
          success: false,
          error: 'Failed to connect to MCP server',
          message: connectError instanceof Error ? connectError.message : 'Unknown error',
        });
        return;
      }
    }

    // Queue sync job
    const job = await syncMcpServerQueue.add(config._id.toString(), {
      mcpConfig: config as any,
    });

    // Return jobId for progress tracking
    res.status(200).json({
      success: true,
      data: { jobId: job.id },
    });
  } catch (err) {
    logger.error({ err }, 'Error queueing sync job');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
