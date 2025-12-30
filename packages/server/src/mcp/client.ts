import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolClassification } from "@ebee-oss/indexing-engine";
import logger from "../utils/logger.js";

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
  private toolClassifications: Map<string, Record<string, ToolClassification>> =
    new Map();

  /**
   * Connect to an MCP server
   */
  async connect(config: MCPServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      logger.error(
        { clientName: config.name },
        `Client ${config.name} already connected`
      );
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

    logger.info(`Connected to MCP server: ${config.name}`);
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
      logger.info(`Disconnected from MCP server: ${serverName}`);
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
   * Get tools from a specific server
   */
  getServerTools(serverName: string): Tool[] {
    return this.toolCache.get(serverName) || [];
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
   * List resources
   */
  async listResources(serverName: string) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Client ${serverName} not connected`);
    }

    const response = await client.listResources({});

    return response.resources;
  }

  /**
   * Read a resource
   */
  async readResource(serverName: string, uri: string) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Client ${serverName} not connected`);
    }

    const response = await client.readResource({ uri });

    return response.contents;
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

  /**
   * Set tool classifications for a server
   */
  setToolClassifications(
    serverName: string,
    classifications: Record<string, ToolClassification>
  ): void {
    this.toolClassifications.set(serverName, classifications);
    logger.debug(
      { serverName, count: Object.keys(classifications).length },
      "Tool classifications set for server"
    );
  }

  /**
   * Get tool classifications for a server
   */
  getToolClassifications(
    serverName: string
  ): Record<string, ToolClassification> | undefined {
    return this.toolClassifications.get(serverName);
  }

  /**
   * Check if a tool is a write operation
   */
  isWriteTool(serverName: string, toolName: string): boolean {
    const classifications = this.toolClassifications.get(serverName);
    if (!classifications) return false;

    const classification = classifications[toolName];
    return classification?.category === "write";
  }

  /**
   * Check if a tool is a search operation
   */
  isSearchTool(serverName: string, toolName: string): boolean {
    const classifications = this.toolClassifications.get(serverName);
    if (!classifications) return false;

    const classification = classifications[toolName];
    return classification?.category === "search";
  }

  /**
   * Check if a tool is a read operation
   */
  isReadTool(serverName: string, toolName: string): boolean {
    const classifications = this.toolClassifications.get(serverName);
    if (!classifications) return true; // Default to read if not classified

    const classification = classifications[toolName];
    return classification?.category === "read";
  }

  /**
   * Call tool with classification-aware routing
   * Write tools are always passed through to upstream
   * Read tools can potentially use cached/indexed data (future enhancement)
   */
  async callToolWithRouting(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: { forceUpstream?: boolean }
  ): Promise<any> {
    // Check classification
    const isWrite = this.isWriteTool(serverName, toolName);
    const isSearch = this.isSearchTool(serverName, toolName);

    if (isWrite) {
      logger.debug(
        { serverName, toolName },
        "Routing WRITE tool to upstream MCP server"
      );
    }

    // Always pass through for write operations or when forced
    if (isWrite || isSearch || options?.forceUpstream) {
      return this.callTool(serverName, toolName, args);
    }

    // For read operations, currently just call upstream
    // Future: Could check cache/indexed data first
    return this.callTool(serverName, toolName, args);
  }
}

export const mcpClientManager = new MCPClientManager();
