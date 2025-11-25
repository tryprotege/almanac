import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import http from "http";
import { spawn, ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_PORT = 3099;
const TEST_HOST = "127.0.0.1";

// Type definitions
interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

// Helper to make HTTP requests
function makeRequest(
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: TEST_HOST,
      port: TEST_PORT,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode || 500,
            data: data ? JSON.parse(data) : null,
            headers: res.headers,
          });
        } catch (error) {
          resolve({
            status: res.statusCode || 500,
            data,
            headers: res.headers,
          });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Helper to make JSON-RPC requests
async function makeJsonRpcRequest(
  method: string,
  params?: any,
  id: number | string = 1
): Promise<JsonRpcResponse> {
  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  const response = await makeRequest("POST", "/mcp", request);
  expect(response.status).toBe(200);
  expect(response.data).toHaveProperty("jsonrpc", "2.0");
  expect(response.data).toHaveProperty("id", id);

  return response.data as JsonRpcResponse;
}

// Helper to wait for server to be ready
async function waitForServer(
  maxAttempts = 30,
  delayMs = 1000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await makeRequest("GET", "/health");
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

describe("eBee MCP Server Integration Tests", () => {
  let serverProcess: ChildProcess;

  beforeAll(async () => {
    // Set environment variables for test
    const testEnv = {
      ...process.env,
      PORT: String(TEST_PORT),
      HOST: TEST_HOST,
      MONGODB_URI:
        process.env.MONGODB_URI || "mongodb://localhost:27017/ebee-test",
      REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
      QDRANT_URL: process.env.QDRANT_URL || "http://localhost:6333",
      MEMGRAPH_URI: process.env.MEMGRAPH_URI || "bolt://localhost:7687",
    };

    // Start the server process
    const serverPath = path.resolve(__dirname, "./index.ts");
    serverProcess = spawn("tsx", [serverPath], {
      env: testEnv,
      stdio: "pipe", // Capture output for debugging
    });

    // Log server output for debugging
    serverProcess.stdout?.on("data", (data) => {
      if (process.env.DEBUG_TESTS) {
        console.log(`[Server]: ${data}`);
      }
    });

    serverProcess.stderr?.on("data", (data) => {
      if (process.env.DEBUG_TESTS) {
        console.error(`[Server Error]: ${data}`);
      }
    });

    serverProcess.on("error", (error) => {
      console.error("Failed to start server:", error);
    });

    // Wait for server to be ready
    const isReady = await waitForServer();
    if (!isReady) {
      throw new Error("Server failed to start within timeout period");
    }

    console.log("✅ Test server is ready");
  }, 60000); // 60 second timeout for server startup

  afterAll(async () => {
    // Cleanup: Stop the server process
    if (serverProcess) {
      serverProcess.kill("SIGTERM");

      // Wait for graceful shutdown
      await new Promise((resolve) => {
        serverProcess.on("exit", resolve);
        setTimeout(resolve, 5000); // Force resolve after 5s
      });
    }
  }, 10000);

  describe("Health Check Endpoint", () => {
    it("should return 200 OK with status and version", async () => {
      const response = await makeRequest("GET", "/health");

      expect(response.status).toBe(200);
      expect(response.data).toEqual({
        status: "ok",
        version: "0.1.0",
      });
      expect(response.headers["content-type"]).toContain("application/json");
    });
  });

  describe("CORS Headers", () => {
    it("should handle OPTIONS preflight request", async () => {
      const response = await makeRequest("OPTIONS", "/mcp");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe("*");
      expect(response.headers["access-control-allow-methods"]).toContain(
        "POST"
      );
      expect(response.headers["access-control-allow-headers"]).toContain(
        "Content-Type"
      );
    });

    it("should include CORS headers in POST response", async () => {
      const response = await makeRequest("POST", "/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      });

      expect(response.headers["access-control-allow-origin"]).toBe("*");
    });
  });

  describe("JSON-RPC Protocol", () => {
    describe("Initialize Handshake", () => {
      it("should handle initialize request", async () => {
        const response = await makeJsonRpcRequest("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        });

        expect(response.result).toHaveProperty("protocolVersion", "2024-11-05");
        expect(response.result).toHaveProperty("capabilities");
        expect(response.result.capabilities).toHaveProperty("tools");
        expect(response.result).toHaveProperty("serverInfo");
        expect(response.result.serverInfo).toEqual({
          name: "ebee-oss",
          version: "0.1.0",
        });
      });

      it("should handle notifications/initialized", async () => {
        const request = {
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        };

        const response = await makeRequest("POST", "/mcp", request);
        expect(response.status).toBe(200);
      });
    });

    describe("Tools", () => {
      it("should list available tools", async () => {
        const response = await makeJsonRpcRequest("tools/list");

        expect(response.result).toHaveProperty("tools");
        expect(Array.isArray(response.result.tools)).toBe(true);
        expect(response.result.tools.length).toBeGreaterThan(0);

        // Check for local tools
        const redisGetTool = response.result.tools.find(
          (t: any) => t.name === "redis_get"
        );
        expect(redisGetTool).toBeDefined();
        expect(redisGetTool).toHaveProperty("description");
        expect(redisGetTool).toHaveProperty("inputSchema");

        // Check for proxy tools
        const proxyListTool = response.result.tools.find(
          (t: any) => t.name === "proxy_list_servers"
        );
        expect(proxyListTool).toBeDefined();
      });

      it("should call proxy_list_servers tool", async () => {
        const response = await makeJsonRpcRequest("tools/call", {
          name: "proxy_list_servers",
          arguments: {},
        });

        expect(response.result).toHaveProperty("content");
        expect(Array.isArray(response.result.content)).toBe(true);
        expect(response.result.content[0]).toHaveProperty("type", "text");
        expect(response.result.content[0]).toHaveProperty("text");

        const resultText = JSON.parse(response.result.content[0].text);
        expect(resultText).toHaveProperty("servers");
        expect(Array.isArray(resultText.servers)).toBe(true);
      });

      it("should return error for unknown tool", async () => {
        const response = await makeJsonRpcRequest("tools/call", {
          name: "unknown_tool",
          arguments: {},
        });

        expect(response.result).toHaveProperty("content");
        expect(response.result).toHaveProperty("isError", true);
        expect(response.result.content[0].text).toContain("Error");
      });
    });

    describe("Error Handling", () => {
      it("should return method not found for unknown method", async () => {
        const response = await makeJsonRpcRequest("unknown/method");

        expect(response.error).toBeDefined();
        expect(response.error?.code).toBe(-32601);
        expect(response.error?.message).toBe("Method not found");
      });

      it("should handle malformed JSON", async () => {
        const options: http.RequestOptions = {
          hostname: TEST_HOST,
          port: TEST_PORT,
          path: "/mcp",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        };

        const response = await new Promise<{
          status: number;
          data: any;
        }>((resolve) => {
          const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              resolve({
                status: res.statusCode || 500,
                data: data ? JSON.parse(data) : null,
              });
            });
          });

          req.write("invalid json");
          req.end();
        });

        expect(response.status).toBe(500);
        expect(response.data).toHaveProperty("error");
        expect(response.data.error).toHaveProperty("code", -32603);
      });

      it("should return 404 for unknown routes", async () => {
        const response = await makeRequest("GET", "/unknown");

        expect(response.status).toBe(404);
        expect(response.data).toEqual({ error: "Not found" });
      });
    });
  });

  describe("Multiple Concurrent Requests", () => {
    it("should handle multiple concurrent tool list requests", async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        makeJsonRpcRequest("tools/list", undefined, i)
      );

      const responses = await Promise.all(requests);

      responses.forEach((response, index) => {
        expect(response.id).toBe(index);
        expect(response.result).toHaveProperty("tools");
        expect(Array.isArray(response.result.tools)).toBe(true);
      });
    });

    it("should handle mixed request types concurrently", async () => {
      const [healthResponse, toolsListResponse, toolCallResponse] =
        await Promise.all([
          makeRequest("GET", "/health"),
          makeJsonRpcRequest("tools/list", undefined, 1),
          makeJsonRpcRequest(
            "tools/call",
            {
              name: "proxy_list_servers",
              arguments: {},
            },
            2
          ),
        ]);

      expect(healthResponse.status).toBe(200);
      expect(healthResponse.data).toHaveProperty("status", "ok");
      expect(toolsListResponse.result).toHaveProperty("tools");
      expect(toolCallResponse.result).toHaveProperty("content");
    });
  });

  describe("Request ID Handling", () => {
    it("should preserve request ID in response", async () => {
      const testId = "test-id-123";
      const response = await makeJsonRpcRequest(
        "tools/list",
        undefined,
        testId
      );

      expect(response.id).toBe(testId);
    });

    it("should handle numeric request IDs", async () => {
      const testId = 42;
      const response = await makeJsonRpcRequest(
        "tools/list",
        undefined,
        testId
      );

      expect(response.id).toBe(testId);
    });
  });
});
