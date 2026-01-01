#!/usr/bin/env node
import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { router } from "./api/index.js";
import { mcpClientManager, MCPServerConfig } from "./mcp/client.js";
import { validateConfig } from "./mcp/config-loader.js";
import {
  initializeServices,
  mcpServer,
  shutdownServices,
} from "./mcp/initialization.js";
import { DataSourceModel } from "./models/data-source.model.js";
import { syncMcpServerQueue } from "./services/queue/sync.queue.js";
import logger from "./utils/logger.js";

/**
 * Convert MongoDB document to MCPServerConfig
 * Handles Map to Record conversion and ensures all required fields
 */
function toMCPServerConfig(doc: any): MCPServerConfig {
  const json = doc.toJSON();
  return {
    _id: doc._id?.toString(),
    name: json.name,
    type: json.type,
    command: json.command,
    args: json.args || undefined,
    env: json.env ? Object.fromEntries(json.env) : undefined,
    url: json.url,
    headers: json.headers ? Object.fromEntries(json.headers) : undefined,
    authType: json.authType || "none",
    oauth: json.oauth,
    isDisabled: json.isDisabled || false,
  };
}

// Start server
const runServer = async () => {
  await initializeServices();

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

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", version: "0.1.0" });
  });

  // Data Source REST API endpoints
  // GET /api/data-sources - List all data source configs
  app.get("/api/data-sources", async (_req: Request, res: Response) => {
    try {
      const configs = await DataSourceModel.find().sort({
        createdAt: -1,
      });
      res.json({ success: true, data: configs });
    } catch (err) {
      logger.error({ err }, "Error fetching data source configs");
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // POST /api/data-sources - Create a new data source config
  app.post("/api/data-sources", async (req: Request, res: Response) => {
    try {
      const configData: MCPServerConfig = req.body;

      // Validate the config
      const validationError = validateConfig(configData);
      if (validationError) {
        res.status(400).json({ success: false, error: validationError });
        return;
      }

      // Create and save the config
      const config = new DataSourceModel(configData);
      await config.save();

      // Optionally connect to the server immediately
      // Skip for OAuth servers - they need OAuth flow first
      if (configData.name && configData.authType !== "oauth") {
        try {
          await mcpClientManager.connect(toMCPServerConfig(config));
        } catch (connectError) {
          logger.error(
            { err: connectError, serverName: configData.name },
            `Failed to auto-connect to ${configData.name}`
          );
        }
      } else if (configData.authType === "oauth") {
        logger.info(
          { serverName: configData.name },
          "Skipping auto-connect for OAuth server - OAuth flow required first"
        );
      }

      res.status(201).json({ success: true, data: config });
    } catch (err) {
      logger.error({ err }, "Error creating data source config");
      const statusCode = (err as any).code === 11000 ? 409 : 500;
      res.status(statusCode).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/data-sources/:name - Get a specific data source config
  app.get("/api/data-sources/:name", async (req: Request, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const config = await DataSourceModel.findOne({ name });

      if (!config) {
        res.status(404).json({
          success: false,
          error: "Data source config not found",
        });
        return;
      }

      res.json({ success: true, data: config });
    } catch (err) {
      logger.error(
        { err, serverName: req.params.name },
        "Error fetching data source config"
      );
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PUT /api/data-sources/:name - Update a data source config
  app.put("/api/data-sources/:name", async (req: Request, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const updateData: Partial<MCPServerConfig> = req.body;

      // Don't allow changing the name
      delete (updateData as any).name;

      // Validate if type is being changed
      if (updateData.type) {
        const tempConfig = { ...updateData, name } as MCPServerConfig;
        const validationError = validateConfig(tempConfig);
        if (validationError) {
          res.status(400).json({ success: false, error: validationError });
          return;
        }
      }

      const config = await DataSourceModel.findOneAndUpdate(
        { name },
        updateData,
        { new: true, runValidators: true }
      );

      if (!config) {
        res.status(404).json({
          success: false,
          error: "Data source config not found",
        });
        return;
      }

      // Reconnect if the server is currently connected
      if (mcpClientManager.isConnected(name)) {
        try {
          await mcpClientManager.disconnect(name);
          await mcpClientManager.connect(toMCPServerConfig(config));
          logger.info(
            { serverName: name },
            `Reconnected to updated MCP server: ${name}`
          );
        } catch (reconnectError) {
          logger.error(
            { err: reconnectError, serverName: name },
            `Failed to reconnect to ${name}`
          );
        }
      }

      res.json({ success: true, data: config });
    } catch (err) {
      logger.error(
        { err, serverName: req.params.name },
        "Error updating data source config"
      );
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // DELETE /api/data-sources/:name - Delete a data source config
  app.delete("/api/data-sources/:name", async (req: Request, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);

      // Disconnect if currently connected
      if (mcpClientManager.isConnected(name)) {
        await mcpClientManager.disconnect(name);
      }

      const config = await DataSourceModel.findOneAndDelete({ name });

      if (!config) {
        res.status(404).json({
          success: false,
          error: "Data source config not found",
        });
        return;
      }

      res.json({
        success: true,
        message: "Data source config deleted",
      });
    } catch (err) {
      logger.error(
        { err, serverName: req.params.name },
        "Error deleting data source config"
      );
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // POST /api/data-sources/:name/connect - Connect to a data source
  app.post(
    "/api/data-sources/:name/connect",
    async (req: Request, res: Response) => {
      try {
        const name = decodeURIComponent(req.params.name);
        const config = await DataSourceModel.findOne({ name });

        if (!config) {
          res.status(404).json({
            success: false,
            error: "Data source config not found",
          });
          return;
        }

        if (mcpClientManager.isConnected(name)) {
          res.status(400).json({
            success: false,
            error: "Server already connected",
          });
          return;
        }

        // For OAuth servers, check if OAuth is completed before connecting
        const configJson = config.toJSON() as any;
        if (configJson.authType === "oauth") {
          // Import oauthFlowManager here to check status
          const { oauthFlowManager } = await import("./oauth/oauth-flow.js");
          const oauthStatus = await oauthFlowManager.getStatus(
            config._id.toString()
          );

          if (!oauthStatus.connected) {
            res.status(400).json({
              success: false,
              error: "OAuth authorization required",
              code: "OAUTH_REQUIRED",
              message:
                "Please complete OAuth authorization before connecting. Click the 'Connect' button to start the OAuth flow.",
            });
            return;
          }
        }

        await mcpClientManager.connect(toMCPServerConfig(config));

        res.json({ success: true, message: `Connected to ${name}` });
      } catch (err) {
        logger.error(
          { err, serverName: req.params.name },
          "Error connecting to data source"
        );
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // POST /api/data-sources/:name/disconnect - Disconnect from a data source
  app.post(
    "/api/data-sources/:name/disconnect",
    async (req: Request, res: Response) => {
      try {
        const name = decodeURIComponent(req.params.name);

        if (!mcpClientManager.isConnected(name)) {
          res
            .status(400)
            .json({ success: false, error: "Server not connected" });
          return;
        }

        await mcpClientManager.disconnect(name);

        res.json({
          success: true,
          message: `Disconnected from ${name}`,
        });
      } catch (err) {
        logger.error(
          { err, serverName: req.params.name },
          "Error disconnecting from data source"
        );
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // GET /api/data-sources/:name/status - Get connection status
  app.get(
    "/api/data-sources/:name/status",
    async (req: Request, res: Response) => {
      try {
        const name = decodeURIComponent(req.params.name);

        const isConnected = mcpClientManager.isConnected(name);

        res.json({
          success: true,
          data: { name, connected: isConnected },
        });
      } catch (err) {
        logger.error(
          { err, serverName: req.params.name },
          "Error getting data source status"
        );
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // Schema API endpoints
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

      if (!mcpClientManager.isConnected(config.name)) {
        res.status(400).json({ success: false, error: "Server not connected" });
        return;
      }

      // Queue sync job
      const job = await syncMcpServerQueue.add(config._id.toString(), {
        mcpConfig: toMCPServerConfig(config) as any, // use toJSON instead of toObject as `Map` won't be preserved when passing to redis
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
  await mcpClientManager.disconnectAll();
  await shutdownServices();
  process.exit(0);
});

runServer().catch((error) => {
  logger.error({ err: error }, "Fatal error in MCP server");
  process.exit(1);
});
