#!/usr/bin/env node
import express, { NextFunction, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { notionMcpServer } from "./mcpServers/notion.js";
import { githubMcpServer } from "./mcpServers/github.js";
import { fathomMcpServer } from "./mcpServers/fathom.js";
import { slackMcpServer } from "./mcpServers/slack.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
const HOST = process.env.HOST || "0.0.0.0";

const mcpHandler =
  (mcpServer: McpServer) => async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };

// Start server
async function main() {
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

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      services: {
        github: "/mcp/github",
        fathom: "/mcp/fathom",
        notion: "/mcp/notion",
        slack: "/mcp/slack",
      },
    });
  });

  // MCP endpoints
  app.post("/mcp/github", mcpHandler(githubMcpServer));
  app.post("/mcp/fathom", mcpHandler(fathomMcpServer));
  app.post("/mcp/notion", mcpHandler(notionMcpServer));
  app.post("/mcp/slack", mcpHandler(slackMcpServer));

  // 404 for other routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  app.listen(PORT, HOST, () => {
    console.log(`Mock MCP server listening on http://${HOST}:${PORT}`);
    console.log(`Health check: http://${HOST}:${PORT}/health`);
    console.log(`\nMCP Endpoints:`);
    console.log(`  GitHub:  POST http://${HOST}:${PORT}/mcp/github`);
    console.log(`  Fathom:  POST http://${HOST}:${PORT}/mcp/fathom`);
    console.log(`  Notion:  POST http://${HOST}:${PORT}/mcp/notion`);
    console.log(`  Slack:   POST http://${HOST}:${PORT}/mcp/slack`);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
