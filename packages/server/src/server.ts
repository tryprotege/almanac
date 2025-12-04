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
import { MCPServerConfigModel } from "./models/mcp-config.model.js";
import { syncMcpServerQueue } from "./services/queue/sync.queue.js";
import logger from "./utils/logger.js";

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

  // MCP Server Config REST API endpoints
  // GET /api/mcp-servers - List all MCP server configs
  app.get("/api/mcp-servers", async (_req: Request, res: Response) => {
    try {
      const configs = await MCPServerConfigModel.find().sort({
        createdAt: -1,
      });
      res.json({ success: true, data: configs });
    } catch (err) {
      logger.error({ err }, "Error fetching MCP server configs");
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // POST /api/mcp-servers - Create a new MCP server config
  app.post("/api/mcp-servers", async (req: Request, res: Response) => {
    try {
      const configData: MCPServerConfig = req.body;

      // Validate the config
      const validationError = validateConfig(configData);
      if (validationError) {
        res.status(400).json({ success: false, error: validationError });
        return;
      }

      // Create and save the config
      const config = new MCPServerConfigModel(configData);
      await config.save();

      // Optionally connect to the server immediately
      if (configData.name) {
        try {
          await mcpClientManager.connect(configData);
        } catch (connectError) {
          logger.error(
            { err: connectError, serverName: configData.name },
            `Failed to auto-connect to ${configData.name}`
          );
        }
      }

      res.status(201).json({ success: true, data: config });
    } catch (err) {
      logger.error({ err }, "Error creating MCP server config");
      const statusCode = (err as any).code === 11000 ? 409 : 500;
      res.status(statusCode).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/mcp-servers/:name - Get a specific MCP server config
  app.get("/api/mcp-servers/:name", async (req: Request, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const config = await MCPServerConfigModel.findOne({ name });

      if (!config) {
        res.status(404).json({
          success: false,
          error: "MCP server config not found",
        });
        return;
      }

      res.json({ success: true, data: config });
    } catch (err) {
      logger.error(
        { err, serverName: req.params.name },
        "Error fetching MCP server config"
      );
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PUT /api/mcp-servers/:name - Update an MCP server config
  app.put("/api/mcp-servers/:name", async (req: Request, res: Response) => {
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

      const config = await MCPServerConfigModel.findOneAndUpdate(
        { name },
        updateData,
        { new: true, runValidators: true }
      );

      if (!config) {
        res.status(404).json({
          success: false,
          error: "MCP server config not found",
        });
        return;
      }

      // Reconnect if the server is currently connected
      if (mcpClientManager.isConnected(name)) {
        try {
          await mcpClientManager.disconnect(name);
          await mcpClientManager.connect(config.toJSON() as MCPServerConfig);
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
        "Error updating MCP server config"
      );
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // DELETE /api/mcp-servers/:name - Delete an MCP server config
  app.delete("/api/mcp-servers/:name", async (req: Request, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);

      // Disconnect if currently connected
      if (mcpClientManager.isConnected(name)) {
        await mcpClientManager.disconnect(name);
      }

      const config = await MCPServerConfigModel.findOneAndDelete({ name });

      if (!config) {
        res.status(404).json({
          success: false,
          error: "MCP server config not found",
        });
        return;
      }

      res.json({
        success: true,
        message: "MCP server config deleted",
      });
    } catch (err) {
      logger.error(
        { err, serverName: req.params.name },
        "Error deleting MCP server config"
      );
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // POST /api/mcp-servers/:name/connect - Connect to an MCP server
  app.post(
    "/api/mcp-servers/:name/connect",
    async (req: Request, res: Response) => {
      try {
        const name = decodeURIComponent(req.params.name);
        const config = await MCPServerConfigModel.findOne({ name });

        if (!config) {
          res.status(404).json({
            success: false,
            error: "MCP server config not found",
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

        await mcpClientManager.connect(config.toJSON() as MCPServerConfig);

        res.json({ success: true, message: `Connected to ${name}` });
      } catch (err) {
        logger.error(
          { err, serverName: req.params.name },
          "Error connecting to MCP server"
        );
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // POST /api/mcp-servers/:name/disconnect - Disconnect from an MCP server
  app.post(
    "/api/mcp-servers/:name/disconnect",
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
          "Error disconnecting from MCP server"
        );
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // GET /api/mcp-servers/:name/status - Get connection status
  app.get(
    "/api/mcp-servers/:name/status",
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
          "Error getting MCP server status"
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
      const config = await MCPServerConfigModel.findById(configId);

      if (!config) {
        res.status(404).json({
          success: false,
          error: "MCP server config not found",
        });
        return;
      }

      if (!mcpClientManager.isConnected(config.name)) {
        res.status(400).json({ success: false, error: "Server not connected" });
        return;
      }

      // Queue sync job
      const job = await syncMcpServerQueue.add(config._id.toString(), {
        mcpConfig: config.toObject(),
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
    console.error(`🚀 eBee MCP server running on http://${HOST}:${PORT}`);
    console.error(`📡 MCP endpoint: http://${HOST}:${PORT}/mcp`);
    console.error(`💚 Health check: http://${HOST}:${PORT}/health`);
  });
};

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down MCP server...");
  await mcpClientManager.disconnectAll();
  await shutdownServices();
  process.exit(0);
});

runServer().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
