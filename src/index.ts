#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { MCPClientManager } from "./services/connector/mcp-clients/client.js";
import { loadProxyConfig, validateConfig } from "./mcp/config-loader.js";
import { localTools, proxyTools } from "./mcp/tools.js";
import { handleLocalTool, handleProxyTool } from "./mcp/handlers.js";
import {
  initializeServices,
  initializeRemoteServers,
  shutdownServices,
} from "./mcp/initialization.js";

const mcpClientManager = new MCPClientManager();

// Create MCP server
const server = new Server(
  {
    name: "ebee-oss",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler - combines local and remote tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const remoteToolsData = mcpClientManager.getAllTools();
  const remoteTools = remoteToolsData.map((t) => t.tool);
  const allTools = [...localTools, ...proxyTools, ...remoteTools];

  return { tools: allTools };
});

// Call tool handler - routes to local or remote handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Check if this is a proxied tool (prefixed with serverName__)
    const proxyMatch = name.match(/^(.+?)__(.+)$/);

    if (proxyMatch) {
      const [, serverName, actualToolName] = proxyMatch;

      if (!mcpClientManager.isConnected(serverName)) {
        throw new Error(`Server ${serverName} is not connected`);
      }

      return await mcpClientManager.callTool(
        serverName,
        actualToolName,
        args as Record<string, unknown>
      );
    }

    // Check if this is a proxy tool
    if (name.startsWith("proxy_")) {
      return await handleProxyTool(name, args, mcpClientManager);
    }

    // Handle local tools
    const services = await initializeServices();
    return await handleLocalTool(name, args, services);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

// Helper to read request body
const readBody = (req: IncomingMessage): Promise<string> => {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
};

// Start server
const runServer = async () => {
  const remoteServerConfigs = loadProxyConfig();

  const validConfigs = remoteServerConfigs.filter((config) => {
    const error = validateConfig(config);
    if (error) {
      console.error(`Invalid config for ${config.name}: ${error}`);
      return false;
    }
    return true;
  });

  if (validConfigs.length > 0) {
    await initializeRemoteServers(validConfigs, mcpClientManager);
  } else {
    console.error("ℹ️  No remote MCP servers configured");
  }

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  // Create HTTP server with JSON-RPC
  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      // Handle CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, mcp-protocol-version"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health check endpoint
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", version: "0.1.0" }));
        return;
      }

      // MCP JSON-RPC endpoint
      if (req.url === "/mcp" && req.method === "POST") {
        try {
          const body = await readBody(req);
          const request = JSON.parse(body);

          let response;

          // Handle initialize
          if (request.method === "initialize") {
            response = {
              jsonrpc: "2.0",
              id: request.id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: {
                  tools: {},
                },
                serverInfo: {
                  name: "ebee-oss",
                  version: "0.1.0",
                },
              },
            };
          }
          // Handle notifications/initialized
          else if (request.method === "notifications/initialized") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end();
            return;
          }
          // Handle list tools
          else if (request.method === "tools/list") {
            const remoteToolsData = mcpClientManager.getAllTools();
            const remoteTools = remoteToolsData.map((t) => t.tool);
            const allTools = [...localTools, ...proxyTools, ...remoteTools];

            response = {
              jsonrpc: "2.0",
              id: request.id,
              result: { tools: allTools },
            };
          }
          // Handle call tool
          else if (request.method === "tools/call") {
            const { name, arguments: args } = request.params;

            // Check if proxied tool
            const proxyMatch = name.match(/^(.+?)__(.+)$/);

            let result;
            if (proxyMatch) {
              const [, serverName, actualToolName] = proxyMatch;
              if (!mcpClientManager.isConnected(serverName)) {
                throw new Error(`Server ${serverName} is not connected`);
              }
              result = await mcpClientManager.callTool(
                serverName,
                actualToolName,
                args as Record<string, unknown>
              );
            } else if (name.startsWith("proxy_")) {
              result = await handleProxyTool(name, args, mcpClientManager);
            } else {
              // Handle local tools by calling the handler directly
              const mockRequest = {
                method: "tools/call",
                params: { name, arguments: args },
              };

              const handlers = (server as any)._requestHandlers;
              const handler = handlers.get("tools/call");
              if (!handler) {
                throw new Error("Tool handler not found");
              }

              result = await handler(mockRequest);
            }

            response = {
              jsonrpc: "2.0",
              id: request.id,
              result,
            };
          } else {
            response = {
              jsonrpc: "2.0",
              id: request.id,
              error: {
                code: -32601,
                message: "Method not found",
              },
            };
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } catch (error) {
          const errorResponse = {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : String(error),
            },
          };
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errorResponse));
        }
        return;
      }

      // 404 for other routes
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  );

  httpServer.listen(PORT, HOST, () => {
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
