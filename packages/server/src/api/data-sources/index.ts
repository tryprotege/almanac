import { Request, Response, Router } from 'express';
import { DataSourceModel, IDataSourceModel } from '../../models/data-source.model.js';
import { IndexingConfigModel } from '../../models/indexing-config.model.js';
import { MCPSyncStateModel } from '../../models/mcp-sync-state.model.js';
import { mcpClientManager } from '../../mcp/client.js';
import { presetLoader } from '../../services/presets/preset-loader.service.js';
import logger from '../../utils/logger.js';

const dataSourcesRouter: Router = Router();

// GET /api/data-sources - List all data sources
dataSourcesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const dataSources = await DataSourceModel.find({});

    // Add connection status to each data source
    const dataSourcesWithStatus = dataSources.map((ds) => ({
      _id: ds._id,
      name: ds.name,
      type: ds.type,
      presetId: ds.presetId,
      command: ds.command,
      args: ds.args,
      env: ds.env ? Object.fromEntries(ds.env) : undefined,
      url: ds.url,
      headers: ds.headers ? Object.fromEntries(ds.headers) : undefined,
      authType: ds.authType,
      oauth: ds.oauth,
      isDisabled: ds.isDisabled,
      createdAt: ds.createdAt,
      updatedAt: ds.updatedAt,
      connected: mcpClientManager.isConnected(ds.name),
    }));

    res.json({
      success: true,
      data: dataSourcesWithStatus,
    });
  } catch (err) {
    logger.error({ err }, 'Error listing data sources');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/data-sources/:name - Get a specific data source
dataSourcesRouter.get('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const dataSource = await DataSourceModel.findOne({ name });

    if (!dataSource) {
      res.status(404).json({
        success: false,
        error: `Data source '${name}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        _id: dataSource._id,
        name: dataSource.name,
        type: dataSource.type,
        presetId: dataSource.presetId,
        command: dataSource.command,
        args: dataSource.args,
        env: dataSource.env ? Object.fromEntries(dataSource.env) : undefined,
        url: dataSource.url,
        headers: dataSource.headers ? Object.fromEntries(dataSource.headers) : undefined,
        authType: dataSource.authType,
        oauth: dataSource.oauth,
        isDisabled: dataSource.isDisabled,
        createdAt: dataSource.createdAt,
        updatedAt: dataSource.updatedAt,
        connected: mcpClientManager.isConnected(dataSource.name),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error getting data source');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Helper function to validate preset-specific requirements
function validatePresetRequirements(
  presetId: string,
  env: Record<string, string> | undefined,
): string | null {
  // Special validation for Slack - require at least one token type
  if (presetId === 'slack') {
    if (!env) {
      return 'Slack requires at least one token (xoxb, xoxp, or xoxc+xoxd)';
    }

    const hasXoxb = env.SLACK_MCP_XOXB_TOKEN?.trim();
    const hasXoxp = env.SLACK_MCP_XOXP_TOKEN?.trim();
    const hasXoxc = env.SLACK_MCP_XOXC_TOKEN?.trim();
    const hasXoxd = env.SLACK_MCP_XOXD_TOKEN?.trim();

    // Check if at least one token type is provided
    if (!hasXoxb && !hasXoxp && !hasXoxc && !hasXoxd) {
      return 'Slack requires at least one token. Please provide: Bot Token (xoxb), User Token (xoxp), or Browser Tokens (xoxc + xoxd)';
    }

    // If xoxc or xoxd is provided, both must be provided
    if ((hasXoxc && !hasXoxd) || (!hasXoxc && hasXoxd)) {
      return 'Browser authentication requires both SLACK_MCP_XOXC_TOKEN and SLACK_MCP_XOXD_TOKEN';
    }
  }

  return null;
}

// POST /api/data-sources - Create a new data source
dataSourcesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const config = req.body;

    // Validate required fields
    if (!config.name) {
      res.status(400).json({
        success: false,
        error: 'Server name is required',
      });
      return;
    }

    if (!config.type || !['stdio', 'sse', 'streamable-http'].includes(config.type)) {
      res.status(400).json({
        success: false,
        error: "Server type must be 'stdio', 'sse', or 'streamable-http'",
      });
      return;
    }

    // Validate preset-specific requirements
    if (config.presetId) {
      const validationError = validatePresetRequirements(config.presetId, config.env);
      if (validationError) {
        res.status(400).json({
          success: false,
          error: validationError,
        });
        return;
      }
    }

    // Check if data source already exists
    let dataSource = await DataSourceModel.findOne({ name: config.name });
    if (!dataSource) {
      // Convert env and headers to Map if provided
      const dataSourceData: IDataSourceModel = {
        ...config,
        env: config.env ? new Map(Object.entries(config.env)) : undefined,
        headers: config.headers ? new Map(Object.entries(config.headers)) : undefined,
      };

      // Create new data source
      dataSource = new DataSourceModel(dataSourceData);
      await dataSource.save();

      logger.info({ name: config.name }, 'Data source created');

      // Auto-create indexing config from preset if presetId is provided
      if (config.presetId) {
        try {
          const preset = presetLoader.getPreset(config.presetId);
          if (preset?.indexingConfig) {
            const indexingConfig = new IndexingConfigModel({
              serverName: config.name,
              displayName: preset.displayName,
              status: 'active',
              configVersion: 1,
              config: preset.indexingConfig,
            });
            await indexingConfig.save();
            logger.info(
              { name: config.name, presetId: config.presetId },
              'Auto-created indexing config from preset',
            );
          }
        } catch (presetErr) {
          logger.warn(
            { err: presetErr, name: config.name, presetId: config.presetId },
            'Failed to auto-create indexing config from preset',
          );
        }
      }
    }

    res.status(201).json({
      success: true,
      data: {
        _id: dataSource._id,
        name: dataSource.name,
        type: dataSource.type,
        presetId: dataSource.presetId,
        command: dataSource.command,
        args: dataSource.args,
        env: dataSource.env ? Object.fromEntries(dataSource.env) : undefined,
        url: dataSource.url,
        headers: dataSource.headers ? Object.fromEntries(dataSource.headers) : undefined,
        authType: dataSource.authType,
        oauth: dataSource.oauth,
        isDisabled: dataSource.isDisabled,
        createdAt: dataSource.createdAt,
        updatedAt: dataSource.updatedAt,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error creating data source');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// PUT /api/data-sources/:name - Update a data source
dataSourcesRouter.put('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const updates = req.body;

    const dataSource = await DataSourceModel.findOne({ name });

    if (!dataSource) {
      res.status(404).json({
        success: false,
        error: `Data source '${name}' not found`,
      });
      return;
    }

    // Update fields
    if (updates.type !== undefined) dataSource.type = updates.type;
    if (updates.presetId !== undefined) dataSource.presetId = updates.presetId;
    if (updates.command !== undefined) dataSource.command = updates.command;
    if (updates.args !== undefined) dataSource.args = updates.args;
    if (updates.env !== undefined) {
      dataSource.env = new Map(Object.entries(updates.env));
    }
    if (updates.url !== undefined) dataSource.url = updates.url;
    if (updates.headers !== undefined) {
      dataSource.headers = new Map(Object.entries(updates.headers));
    }
    if (updates.authType !== undefined) dataSource.authType = updates.authType;
    if (updates.oauth !== undefined) dataSource.oauth = updates.oauth;
    if (updates.isDisabled !== undefined) {
      dataSource.isDisabled = updates.isDisabled;
    }

    await dataSource.save();

    // If server was connected, disconnect and reconnect with new config
    if (mcpClientManager.isConnected(name)) {
      logger.info({ name }, 'Data source updated while connected, reconnecting...');
      await mcpClientManager.disconnect(name);

      if (!dataSource.isDisabled) {
        try {
          await mcpClientManager.connect(dataSource);
        } catch (connErr) {
          logger.warn({ err: connErr, name }, 'Failed to reconnect after update');
        }
      }
    }

    logger.info({ name }, 'Data source updated');

    res.json({
      success: true,
      data: {
        _id: dataSource._id,
        name: dataSource.name,
        type: dataSource.type,
        presetId: dataSource.presetId,
        command: dataSource.command,
        args: dataSource.args,
        env: dataSource.env ? Object.fromEntries(dataSource.env) : undefined,
        url: dataSource.url,
        headers: dataSource.headers ? Object.fromEntries(dataSource.headers) : undefined,
        authType: dataSource.authType,
        oauth: dataSource.oauth,
        isDisabled: dataSource.isDisabled,
        createdAt: dataSource.createdAt,
        updatedAt: dataSource.updatedAt,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error updating data source');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// DELETE /api/data-sources/:name - Delete a data source
dataSourcesRouter.delete('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    const dataSource = await DataSourceModel.findOne({ name });

    if (!dataSource) {
      res.status(404).json({
        success: false,
        error: `Data source '${name}' not found`,
      });
      return;
    }

    // Disconnect if connected
    if (mcpClientManager.isConnected(name)) {
      await mcpClientManager.disconnect(name);
    }

    // Cascade delete: Remove associated indexing config and sync state
    const indexingConfigResult = await IndexingConfigModel.deleteOne({
      serverName: name,
    });
    const syncStateResult = await MCPSyncStateModel.deleteOne({
      serverName: name,
    });

    await DataSourceModel.deleteOne({ name });

    logger.info(
      {
        name,
        indexingConfigDeleted: indexingConfigResult.deletedCount > 0,
        syncStateDeleted: syncStateResult.deletedCount > 0,
      },
      'Data source and associated resources deleted',
    );

    res.json({
      success: true,
      message: `Data source '${name}' deleted successfully`,
    });
  } catch (err) {
    logger.error({ err }, 'Error deleting data source');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/data-sources/:name/connect - Connect to a data source
dataSourcesRouter.post('/:name/connect', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    const dataSource = await DataSourceModel.findOne({ name });

    if (!dataSource) {
      res.status(404).json({
        success: false,
        error: `Data source '${name}' not found`,
      });
      return;
    }

    // Validate config before connecting
    const validationError = dataSource.validateMCPConfig();
    if (validationError) {
      res.status(400).json({
        success: false,
        error: validationError,
      });
      return;
    }

    // Check if already connected - if so, disconnect first to ensure fresh connection
    if (mcpClientManager.isConnected(name)) {
      logger.info({ name }, 'Data source already connected, reconnecting...');
      try {
        await mcpClientManager.disconnect(name);
      } catch (disconnectErr) {
        logger.warn(
          { err: disconnectErr, name },
          'Failed to disconnect before reconnecting, continuing anyway',
        );
      }
    }

    // Connect (or reconnect)
    await mcpClientManager.connect(dataSource);

    logger.info({ name }, 'Data source connected');

    res.json({
      success: true,
      message: `Connected to '${name}'`,
    });
  } catch (err) {
    logger.error({ err, name: req.params.name }, 'Error connecting to data source');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/data-sources/:name/disconnect - Disconnect from a data source
dataSourcesRouter.post('/:name/disconnect', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    if (!mcpClientManager.isConnected(name)) {
      res.json({
        success: true,
        message: `'${name}' is not connected`,
      });
      return;
    }

    await mcpClientManager.disconnect(name);

    logger.info({ name }, 'Data source disconnected');

    res.json({
      success: true,
      message: `Disconnected from '${name}'`,
    });
  } catch (err) {
    logger.error({ err }, 'Error disconnecting from data source');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/data-sources/:name/status - Get connection status
dataSourcesRouter.get('/:name/status', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    const dataSource = await DataSourceModel.findOne({ name });

    if (!dataSource) {
      res.status(404).json({
        success: false,
        error: `Data source '${name}' not found`,
      });
      return;
    }

    const connected = mcpClientManager.isConnected(name);
    const tools = connected ? mcpClientManager.getServerTools(name) : [];

    res.json({
      success: true,
      data: {
        name,
        connected,
        toolCount: tools.length,
        isDisabled: dataSource.isDisabled,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error getting data source status');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default dataSourcesRouter;
