#!/usr/bin/env node
import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { router } from "./api/index.js";
import { mcpClientManager } from "./mcp/client.js";
import {
  initializeServices,
  mcpServer,
  shutdownServices,
} from "./mcp/initialization.js";
import { DataSourceModel } from "./models/data-source.model.js";
import { syncMcpServerQueue } from "./services/queue/sync.queue.js";
import { presetLoader } from "./services/presets/preset-loader.service.js";
import { syncScheduler } from "./services/scheduler/sync-scheduler.service.js";
import logger from "./utils/logger.js";
import { env } from "./env.js";

// Start server
const runServer = async () => {
  // In setup mode, only initialize MongoDB for storing config
  // In normal mode, initialize all services
  if (!env.isSetupMode) {
    await initializeServices();
  } else {
    // Only connect to MongoDB in setup mode
    const { connectMongoose } = await import("./connections/mongoose.js");
    await connectMongoose();
    logger.warn(
      "⚠️  Running in SETUP MODE - LLM features disabled until configured"
    );
  }

  // Load presets from data-sources-config directory
  logger.info("Loading data source presets...");
  try {
    await presetLoader.loadPresetsAtStartup();
    logger.info(
      { count: presetLoader.getPresetCount() },
      "Data source presets loaded successfully"
    );
  } catch (error) {
    logger.error({ error }, "Failed to load presets, continuing anyway");
  }

  // Initialize sync scheduler
  if (!env.isSetupMode) {
    logger.info("Initializing sync scheduler...");
    try {
      await syncScheduler.initialize();
      logger.info("Sync scheduler initialized successfully");
    } catch (error) {
      logger.error({ error }, "Failed to initialize sync scheduler");
    }
  }

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, mcp-protocol-version"
    );

    if (req.method === "OPTIONS") {
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
        "/health",
        "/api/config", // Config management
      ];

      const isAllowed = allowedPaths.some((p) => req.path.startsWith(p));

      if (!isAllowed) {
        res.status(503).json({
          success: false,
          error:
            "Server is in setup mode. Please complete configuration first.",
          setupRequired: true,
          setupUrl: "/api/config/env",
        });
        return;
      }
    }
    next();
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: "0.1.0",
      setupMode: env.isSetupMode,
    });
  });

  // API endpoints (includes data-sources routes)
  app.use("/api", router);

  // MCP JSON-RPC endpoint
  app.post("/mcp", async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.post("/api/sync", async (req: Request, res: Response) => {
    try {
      const configId = req.body.configId;
      const config = await DataSourceModel.findById(configId);

      if (!config) {
        res.status(404).json({
          success: false,
          error: "Data source config not found",
        });
        return;
      }

      // Auto-connect if not already connected
      if (!mcpClientManager.isConnected(config.name)) {
        logger.info(
          { serverName: config.name },
          "MCP server not connected, attempting connection before sync"
        );

        try {
          await mcpClientManager.connect(config);
          logger.info(
            { serverName: config.name },
            "MCP server connected successfully"
          );
        } catch (connectError) {
          logger.error(
            { err: connectError, serverName: config.name },
            "Failed to connect to MCP server"
          );
          res.status(500).json({
            success: false,
            error: "Failed to connect to MCP server",
            message:
              connectError instanceof Error
                ? connectError.message
                : "Unknown error",
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
      logger.error({ err }, "Error queueing sync job");
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 404 for other routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  app.listen(PORT, HOST, () => {
    logger.info({
      msg: "🚀 eBee MCP server running",
      host: HOST,
      port: PORT,
      endpoints: {
        mcp: `http://${HOST}:${PORT}/mcp`,
        health: `http://${HOST}:${PORT}/health`,
      },
    });
  });
};

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down MCP server...");
  await syncScheduler.shutdown();
  await mcpClientManager.disconnectAll();
  await shutdownServices();
  process.exit(0);
});

runServer().catch((error) => {
  logger.error({ err: error }, "Fatal error in MCP server");
  process.exit(1);
});
