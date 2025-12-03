#!/usr/bin/env node
/**
 * eBee MCP stdio-to-HTTP Bridge
 *
 * This script acts as a bridge between Claude Desktop's stdio transport
 * and the eBee HTTP MCP server. It reads JSON-RPC messages from stdin,
 * forwards them to the HTTP server, and writes responses to stdout.
 */

import readline from "readline";
import { EventEmitter } from "events";

const EBEE_SERVER_URL =
  process.env.EBEE_SERVER_URL || "http://localhost:3000/mcp";
const REQUEST_TIMEOUT = 30000; // 30 seconds

class StdioHttpBridge extends EventEmitter {
  private rl: readline.Interface;
  private buffer: string = "";

  constructor() {
    super();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.setupStdinHandling();
  }

  private setupStdinHandling(): void {
    this.rl.on("line", async (line: string) => {
      try {
        // Parse the JSON-RPC message
        const message = JSON.parse(line);
        this.logDebug("Received message:", message);

        // Forward to HTTP server
        const response = await this.forwardToHttpServer(message);

        // Write response to stdout
        this.writeResponse(response);
      } catch (err) {
        this.logError("Error processing message:", err);

        // Try to extract the request ID for error response
        let requestId: any = null;
        try {
          const parsed = JSON.parse(line);
          requestId = parsed.id;
        } catch {
          // If we can't parse, use null
        }

        // Send JSON-RPC error response
        this.writeResponse({
          jsonrpc: "2.0",
          id: requestId,
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    });

    this.rl.on("close", () => {
      this.logDebug("stdin closed");
      process.exit(0);
    });

    // Handle errors
    process.stdin.on("error", (err) => {
      this.logError("stdin error:", err);
      process.exit(1);
    });

    process.stdout.on("error", (err) => {
      this.logError("stdout error:", err);
      process.exit(1);
    });
  }

  private async forwardToHttpServer(message: any): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(EBEE_SERVER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-protocol-version": "2024-11-05",
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(`Unexpected content type: ${contentType}`);
      }

      return await response.json();
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          throw new Error(
            "Request timeout - eBee server did not respond within 30 seconds"
          );
        } else if (err.message.includes("ECONNREFUSED")) {
          throw new Error(
            `eBee server not running at ${EBEE_SERVER_URL}. Please start the server first.`
          );
        }
      }
      throw err;
    }
  }

  private writeResponse(response: any): void {
    try {
      const json = JSON.stringify(response);
      this.logDebug("Sending response:", response);
      process.stdout.write(json + "\n");
    } catch (err) {
      this.logError("Error writing response:", err);
    }
  }

  private logDebug(...args: any[]): void {
    if (process.env.EBEE_DEBUG === "true") {
      console.error("[eBee stdio bridge]", ...args);
    }
  }

  private logError(...args: any[]): void {
    console.error("[eBee stdio bridge ERROR]", ...args);
  }

  start(): void {
    this.logDebug(`🐝 eBee MCP stdio bridge starting...`);
    this.logDebug(`Forwarding requests to: ${EBEE_SERVER_URL}`);
    this.logDebug("Waiting for JSON-RPC messages on stdin...");
  }
}

// Handle unhandled rejections
process.on("unhandledRejection", (err) => {
  console.error("[eBee stdio bridge] Unhandled rejection:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[eBee stdio bridge] Uncaught exception:", err);
  process.exit(1);
});

// Start the bridge
const bridge = new StdioHttpBridge();
bridge.start();
