/**
 * MCP Server Manager - Handles spawning and communicating with MCP servers
 *
 * This module manages the lifecycle of Model Context Protocol (MCP) servers:
 * - Spawns servers as child processes (stdio transport)
 * - Connects to remote servers via HTTP/SSE (SSE transport)
 * - Lists available tools from each server
 * - Executes tool calls and returns results
 */

import { spawn, ChildProcess } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface MCPServerConfig {
  url?: string; // For URL-based servers (eBee)
  command?: string; // For command-based servers (stdio)
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPServer {
  name: string;
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  process?: ChildProcess; // Optional - only for stdio servers
  tools: MCPTool[];
}

export class MCPServerManager {
  private servers: Map<string, MCPServer> = new Map();
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Start an MCP server and connect to it (detects transport type automatically)
   */
  async startServer(name: string, config: MCPServerConfig): Promise<void> {
    // Detect transport type and use appropriate method
    if (config.url) {
      await this.startURLServer(name, config.url);
    } else if (config.command) {
      await this.startStdioServer(name, config);
    } else {
      throw new Error(
        `Invalid MCP config for ${name}: must have url or command`
      );
    }
  }

  /**
   * Start a URL-based MCP server (uses StreamableHTTP transport)
   */
  private async startURLServer(name: string, url: string): Promise<void> {
    if (this.verbose) {
      console.log(`\n🔧 Starting MCP server: ${name}`);
      console.log(`   URL: ${url}`);
    }

    try {
      // Create StreamableHTTP transport
      const transport = new StreamableHTTPClientTransport(new URL(url));

      const client = new Client(
        {
          name: "ebee-benchmark",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect to the server
      await client.connect(transport);

      if (this.verbose) {
        console.log(`   ✓ Connected to ${name}`);
      }

      // List available tools
      const toolsResponse = await client.listTools();
      const tools: MCPTool[] = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema as any,
      }));

      if (this.verbose) {
        console.log(`   ✓ Found ${tools.length} tools from ${name}:`);
        tools.forEach((tool) => {
          console.log(`      - ${tool.name}: ${tool.description}`);
        });
      }

      // Store server info (no process for URL servers)
      this.servers.set(name, {
        name,
        client,
        transport,
        tools,
      });
    } catch (error) {
      console.error(`Failed to start MCP server ${name}:`, error);
      throw error;
    }
  }

  /**
   * Start a stdio-based MCP server (spawns child process)
   */
  private async startStdioServer(
    name: string,
    config: MCPServerConfig
  ): Promise<void> {
    if (this.verbose) {
      console.log(`\n🔧 Starting MCP server: ${name}`);
      console.log(
        `   Command: ${config.command} ${config.args?.join(" ") || ""}`
      );
    }

    try {
      // Spawn the MCP server process
      const childProcess = spawn(config.command!, config.args || [], {
        env: {
          ...process.env,
          ...config.env,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Handle process errors
      childProcess.on("error", (error: Error) => {
        console.error(`[${name}] Process error:`, error);
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        if (this.verbose) {
          console.error(`[${name}] stderr:`, data.toString());
        }
      });

      // Create MCP client with stdio transport
      const transport = new StdioClientTransport({
        command: config.command!,
        args: config.args || [],
        env: config.env,
      });

      const client = new Client(
        {
          name: "ebee-benchmark",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect to the server
      await client.connect(transport);

      if (this.verbose) {
        console.log(`   ✓ Connected to ${name}`);
      }

      // List available tools
      const toolsResponse = await client.listTools();
      const tools: MCPTool[] = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema as any,
      }));

      if (this.verbose) {
        console.log(`   ✓ Found ${tools.length} tools from ${name}:`);
        tools.forEach((tool) => {
          console.log(`      - ${tool.name}: ${tool.description}`);
        });
      }

      // Store server info
      this.servers.set(name, {
        name,
        client,
        transport,
        process: childProcess,
        tools,
      });
    } catch (error) {
      console.error(`Failed to start MCP server ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get all available tools from all servers
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = [];

    for (const server of this.servers.values()) {
      allTools.push(...server.tools);
    }

    return allTools;
  }

  /**
   * Get tools in Anthropic format for API calls
   */
  getAnthropicTools(): any[] {
    return this.getAllTools().map((tool) => ({
      type: "custom" as const,
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(
    toolName: string,
    args: any
  ): Promise<{ content: any; isError: boolean }> {
    // Find which server has this tool
    let targetServer: MCPServer | undefined;

    for (const server of this.servers.values()) {
      if (server.tools.some((t) => t.name === toolName)) {
        targetServer = server;
        break;
      }
    }

    if (!targetServer) {
      throw new Error(`Tool ${toolName} not found in any MCP server`);
    }

    if (this.verbose) {
      console.log(
        `\n🔧 Calling tool: ${toolName} on server: ${targetServer.name}`
      );
      console.log(`   Args:`, JSON.stringify(args, null, 2));
    }

    try {
      const result = await targetServer.client.callTool({
        name: toolName,
        arguments: args,
      });

      if (this.verbose) {
        console.log(`   ✓ Tool call succeeded`);
      }

      return {
        content: result.content,
        isError: !!result.isError,
      };
    } catch (error) {
      console.error(`Tool call failed: ${toolName}`, error);
      return {
        content: [
          {
            type: "text",
            text: `Error calling tool: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Stop all MCP servers
   */
  async stopAll(): Promise<void> {
    if (this.verbose) {
      console.log("\n🛑 Stopping all MCP servers...");
    }

    for (const [name, server] of this.servers.entries()) {
      try {
        await server.client.close();

        // Only kill process if it exists (stdio servers)
        if (server.process) {
          server.process.kill();
        }

        if (this.verbose) {
          console.log(`   ✓ Stopped ${name}`);
        }
      } catch (error) {
        console.error(`Error stopping server ${name}:`, error);
      }
    }

    this.servers.clear();
  }

  /**
   * Get server names
   */
  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Check if a server is running
   */
  isServerRunning(name: string): boolean {
    return this.servers.has(name);
  }
}
