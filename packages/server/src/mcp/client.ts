import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface MCPServerConfig {
  name: string;
  type: "stdio" | "sse" | "streamable-http";
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
  headers?: Record<string, string> | null;
  requestInit?: RequestInit;
  eventSourceInit?: any;
}

class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, Transport> = new Map();
  private toolCache: Map<string, Tool[]> = new Map();

  /**
   * Connect to an MCP server
   */
  async connect(config: MCPServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      console.error(`Client ${config.name} already connected`);
      return;
    }

    let transport: Transport;

    if (config.type === "stdio") {
      if (!config.command) {
        throw new Error("stdio transport requires command");
      }
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: config.env || undefined,
      });
    } else if (config.type === "sse") {
      if (!config.url) {
        throw new Error("sse transport requires url");
      }

      // Build SSE transport options
      const sseOpts: {
        requestInit?: RequestInit;
        eventSourceInit?: any;
      } = {};

      // Pass requestInit if provided (for POST requests)
      if (config.requestInit) {
        sseOpts.requestInit = config.requestInit;
      } else if (config.headers) {
        // If only headers are provided, construct requestInit with headers
        sseOpts.requestInit = { headers: config.headers };
      }

      // Pass eventSourceInit if provided (for EventSource connection)
      if (config.eventSourceInit) {
        sseOpts.eventSourceInit = config.eventSourceInit;
      }

      transport = new SSEClientTransport(new URL(config.url), sseOpts);
    } else if (config.type === "streamable-http") {
      if (!config.url) {
        throw new Error("streamable-http transport requires url");
      }

      // Build streamable HTTP transport options
      const httpOpts: {
        requestInit?: RequestInit;
      } = {};

      // Pass requestInit if provided (for custom headers, method, etc.)
      if (config.requestInit) {
        httpOpts.requestInit = config.requestInit;
      } else if (config.headers) {
        // If only headers are provided, construct requestInit with headers
        httpOpts.requestInit = { headers: config.headers };
      }

      transport = new StreamableHTTPClientTransport(
        new URL(config.url),
        httpOpts
      );
    } else {
      throw new Error(`Unknown transport type: ${config.type}`);
    }

    const client = new Client(
      {
        name: `ebee-proxy-client-${config.name}`,
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    this.clients.set(config.name, client);
    this.transports.set(config.name, transport);

    // Fetch and cache tools from this server
    await this.refreshTools(config.name);

    console.error(`✅ Connected to MCP server: ${config.name}`);
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    const transport = this.transports.get(serverName);

    if (client && transport) {
      await client.close();
      await transport.close();
      this.clients.delete(serverName);
      this.transports.delete(serverName);
      this.toolCache.delete(serverName);
      console.error(`✅ Disconnected from MCP server: ${serverName}`);
    }
  }

  /**
   * Disconnect all clients
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.clients.keys()).map((name) =>
      this.disconnect(name)
    );
    await Promise.all(promises);
  }

  /**
   * Refresh tools from a specific server
   */
  async refreshTools(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Client ${serverName} not connected`);
    }

    const response = await client.listTools();

    if (response && response.tools) {
      this.toolCache.set(serverName, response.tools);
    }
  }

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): Array<{ serverName: string; tool: Tool }> {
    const allTools: Array<{ serverName: string; tool: Tool }> = [];

    for (const [serverName, tools] of this.toolCache.entries()) {
      for (const tool of tools) {
        allTools.push({
          serverName,
          tool: {
            ...tool,
            // Prefix tool name with server name to avoid conflicts
            name: `${serverName}__${tool.name}`,
            description: `[${serverName}] ${tool.description}`,
          },
        });
      }
    }

    return allTools;
  }

  /**
   * Call a tool on a remote MCP server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Client ${serverName} not connected`);
    }

    const response = await client.callTool({
      name: toolName.replace(`${serverName}__`, ""),
      arguments: args,
    });

    return response;
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }
}

export const mcpClientManager = new MCPClientManager();
