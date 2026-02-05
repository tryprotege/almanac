#!/usr/bin/env node
import express, { NextFunction, Request, Response } from 'express';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { router } from './api/index.js';
import { mcpClientManager } from './mcp/client.js';
import { initializeServices, mcpServer, shutdownServices } from './mcp/initialization.js';
import { DataSourceModel } from './models/data-source.model.js';
import { syncMcpServerQueue, syncMcpServerWorker } from './services/queue/sync.queue.js';
import { presetLoader } from './services/presets/preset-loader.service.js';
import { syncScheduler } from './services/scheduler/sync-scheduler.service.js';
import logger from './utils/logger.js';
import { env } from './env.js';
import { indexVectorWorker } from './services/queue/index-vector.queue.js';
import { indexGraphWorker } from './services/queue/index-graph.queue.js';

// Start server
const runServer = async () => {
  // Load presets from data-sources-config directory FIRST
  // This must happen before initializeServices() so tool classifications are available
  logger.info('Loading data source presets...');
  try {
    await presetLoader.loadPresetsAtStartup();
    logger.info(
      { count: presetLoader.getPresetCount() },
      'Data source presets loaded successfully',
    );
  } catch (error) {
    logger.error({ error }, 'Failed to load presets, continuing anyway');
  }

  // In setup mode, only initialize MongoDB for storing config
  // In normal mode, initialize all services
  if (!env.isSetupMode) {
    await initializeServices();
  } else {
    // Only connect to MongoDB in setup mode
    const { connectMongoose } = await import('./connections/mongoose.js');
    await connectMongoose();
    logger.warn('⚠️  Running in SETUP MODE - LLM features disabled until configured');
  }

  // Initialize sync scheduler
  if (!env.isSetupMode) {
    logger.info('Initializing sync scheduler...');
    try {
      await syncScheduler.initialize();
      logger.info('Sync scheduler initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize sync scheduler');
    }
  }

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const HOST = process.env.HOST || '0.0.0.0';

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-protocol-version');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    next();
  });

  // Setup mode middleware - block certain routes if in setup mode
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (env.isSetupMode) {
      // Allow only these routes in setup mode
      const allowedPaths = [
        '/health',
        '/api/config', // Config management
      ];

      const isAllowed = allowedPaths.some((p) => req.path.startsWith(p));

      if (!isAllowed) {
        res.status(503).json({
          success: false,
          error: 'Server is in setup mode. Please complete configuration first.',
          setupRequired: true,
          setupUrl: '/api/config/env',
        });
        return;
      }
    }
    next();
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: '0.1.0',
      setupMode: env.isSetupMode,
    });
  });

  // API endpoints (includes data-sources routes)
  app.use('/api', router);

  // MCP JSON-RPC endpoint
  app.post('/mcp', async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // 404 for other routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.listen(PORT, HOST, () => {
    logger.info({
      msg: '🚀 Almanac MCP server running',
      host: HOST,
      port: PORT,
      endpoints: {
        mcp: `http://${HOST}:${PORT}/mcp`,
        health: `http://${HOST}:${PORT}/health`,
      },
    });
  });
};

let shuttingDown = false;

// Handle graceful shutdown
process.on('SIGINT', async () => {
  // this can be called multiple times
  if (shuttingDown) return;
  shuttingDown = true;

  // Use console.log for shutdown messages since pino-pretty runs in a worker thread
  // and won't flush before process.exit()
  console.log('\n🛑 SIGINT received - Shutting down MCP server...');

  try {
    // Cancel any in-progress sync jobs
    console.log('Cancelling in-progress sync/indexing jobs...');
    // Close workers to stop processing new jobs and cancel active ones
    await Promise.allSettled([
      syncMcpServerWorker.close(),
      indexVectorWorker.close(),
      indexGraphWorker.close(),
    ]);

    console.log('✅ All workers closed and jobs cancelled');

    // Shutdown other services
    await syncScheduler.shutdown();
    await mcpClientManager.disconnectAll();
    await shutdownServices();

    console.log('👋 Server shutdown complete\n');
  } catch (err) {
    console.error('Error during shutdown:', err);
  }

  process.exit(0);
});

runServer().catch((error) => {
  logger.error({ err: error }, 'Fatal error in MCP server');
  process.exit(1);
});
