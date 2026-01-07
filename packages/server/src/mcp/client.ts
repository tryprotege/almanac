import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { ToolClassification } from "@ebee-oss/indexing-engine";
import { EventEmitter } from "events";
import logger from "../utils/logger.js";
import { oauthProviderFactory } from "../oauth/mcp-oauth-provider.js";
import { discoverSseOAuth } from "../oauth/sse-oauth.js";
import type { DataSource } from "../models/data-source.model.js";

class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, Transport> = new Map();
  private toolCache: Map<string, Tool[]> = new Map();
  private toolClassifications: Map<string, Record<string, ToolClassification>> =
    new Map();
  private eventEmitter = new EventEmitter();
  private pendingOAuthCallbacks: Map<
    string,
    {
      resolve: (code: string) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  /**
   * Create OAuth provider for a server
   */
  private createOAuthProvider(dataSource: DataSource): any | undefined {
    if (dataSource.authType !== "oauth" || !dataSource._id) {
      return undefined;
    }

    return oauthProviderFactory.createProvider(
      dataSource._id.toString(),
      dataSource.url!,
      (authUrl) => {
        // Emit event for frontend to handle redirect
        this.eventEmitter.emit("oauth-redirect-required", {
          serverId: dataSource._id?.toString(),
          authUrl: authUrl.toString(),
        });
      },
      dataSource.oauth?.clientMetadataUrl || undefined
    );
  }

  /**
   * Wait for OAuth callback with timeout
   */
  private async waitForOAuthCallback(serverId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.pendingOAuthCallbacks.set(serverId, { resolve, reject });

      // 5 minute timeout
      setTimeout(() => {
        this.pendingOAuthCallbacks.delete(serverId);
        reject(new Error("OAuth callback timeout"));
      }, 300000);
    });
  }

  /**
   * Receive OAuth callback from API endpoint
   */
  receiveOAuthCallback(serverId: string, code: string): void {
    const callback = this.pendingOAuthCallbacks.get(serverId);
    if (callback) {
      callback.resolve(code);
      this.pendingOAuthCallbacks.delete(serverId);
    } else {
      logger.warn({ serverId }, "Received OAuth callback for unknown server");
    }
  }

  /**
   * Subscribe to OAuth redirect events
   */
  onOAuthRedirect(
    handler: (data: { serverId: string; authUrl: string }) => void
  ): void {
    this.eventEmitter.on("oauth-redirect-required", handler);
  }

  /**
   * Connect to an MCP server
   */
  async connect(dataSource: DataSource): Promise<void> {
    if (this.clients.has(dataSource.name)) {
      logger.info(
        { clientName: dataSource.name },
        `Client ${dataSource.name} already connected, disconnecting and reconnecting...`
      );
      try {
        await this.disconnect(dataSource.name);
      } catch (disconnectErr) {
        logger.warn(
          { err: disconnectErr, clientName: dataSource.name },
          "Failed to disconnect before reconnecting, continuing anyway"
        );
        // Force cleanup even if disconnect failed
        this.clients.delete(dataSource.name);
        this.transports.delete(dataSource.name);
        this.toolCache.delete(dataSource.name);
      }
    }

    // Pre-flight OAuth discovery for SSE servers
    if (
      dataSource.type === "sse" &&
      dataSource.authType === "oauth" &&
      dataSource.url
    ) {
      await this.handleSseOAuthPreFlight(dataSource);
      return; // Will retry connection after OAuth
    }

    let transport: Transport;

    if (dataSource.type === "stdio") {
      // stdio doesn't support OAuth
      if (!dataSource.command) {
        throw new Error("stdio transport requires command");
      }
      transport = new StdioClientTransport({
        command: dataSource.command,
        args: dataSource.args || [],
        env: dataSource.getEnv() || undefined,
      });
    } else if (dataSource.type === "sse") {
      if (!dataSource.url) {
        throw new Error("sse transport requires url");
      }

      const sseOpts: { requestInit?: RequestInit; eventSourceInit?: any } = {};

      // Create OAuth provider if needed
      const oauthProvider = this.createOAuthProvider(dataSource);

      if (oauthProvider) {
        // Use OAuth provider (SDK handles auth automatically)
        transport = new SSEClientTransport(new URL(dataSource.url), {
          authProvider: oauthProvider,
          ...sseOpts,
        });
      } else {
        // Non-OAuth: use headers if provided
        const headers = dataSource.getHeaders() || {};
        sseOpts.requestInit = { headers };
        transport = new SSEClientTransport(new URL(dataSource.url), sseOpts);
      }
    } else if (dataSource.type === "streamable-http") {
      if (!dataSource.url) {
        throw new Error("streamable-http transport requires url");
      }

      const httpOpts: { requestInit?: RequestInit } = {};

      // Create OAuth provider if needed
      const oauthProvider = this.createOAuthProvider(dataSource);

      if (oauthProvider) {
        // Use OAuth provider
        transport = new StreamableHTTPClientTransport(new URL(dataSource.url), {
          authProvider: oauthProvider,
          ...httpOpts,
        });
      } else {
        // Non-OAuth: use headers if provided
        const headers = dataSource.getHeaders() || {};

        // Log sanitized headers for debugging
        const sanitizedHeaders = Object.keys(headers).reduce((acc, key) => {
          acc[key] =
            key.toLowerCase() === "authorization" ? "[REDACTED]" : headers[key];
          return acc;
        }, {} as Record<string, string>);

        logger.debug(
          { serverName: dataSource.name, headers: sanitizedHeaders },
          "Connecting with headers"
        );

        httpOpts.requestInit = { headers };
        transport = new StreamableHTTPClientTransport(
          new URL(dataSource.url),
          httpOpts
        );
      }
    } else {
      throw new Error(`Unknown transport type: ${dataSource.type}`);
    }

    const client = new Client(
      { name: `ebee-proxy-client-${dataSource.name}`, version: "0.1.0" },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        // OAuth flow required - wait for callback
        logger.info(
          { serverName: dataSource.name },
          "OAuth authorization required"
        );

        if (!dataSource._id) {
          throw new Error("Server ID required for OAuth flow");
        }

        const authCode = await this.waitForOAuthCallback(
          dataSource._id.toString()
        );

        // finishAuth is only available on HTTP transports with OAuth
        if (
          "finishAuth" in transport &&
          typeof transport.finishAuth === "function"
        ) {
          await transport.finishAuth(authCode);
        }

        // Retry connection
        await client.connect(transport);
      } else {
        throw error;
      }
    }

    this.clients.set(dataSource.name, client);
    this.transports.set(dataSource.name, transport);

    // Refresh tools with error handling
    try {
      await this.refreshTools(dataSource.name);
    } catch (toolError) {
      logger.warn(
        { error: toolError, serverName: dataSource.name },
        "Tool refresh failed but connection established"
      );
    }

    logger.info(`Connected to MCP server: ${dataSource.name}`);
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

    try {
      const response = await client.listTools();

      logger.debug(
        { serverName, responseType: typeof response },
        "Received listTools response"
      );

      // Validate response structure
      if (!response) {
        logger.warn({ serverName }, "listTools returned no response");
        this.toolCache.set(serverName, []);
        return;
      }

      // Ensure tools is an array
      if (response.tools && Array.isArray(response.tools)) {
        this.toolCache.set(serverName, response.tools);
        logger.info(
          { serverName, toolCount: response.tools.length },
          "Successfully cached tools"
        );
      } else {
        logger.warn(
          { serverName, responseType: typeof response.tools },
          "listTools response.tools is not an array"
        );
        this.toolCache.set(serverName, []);
      }
    } catch (error) {
      logger.error(
        { error, serverName },
        "Failed to refresh tools - continuing without tools"
      );
      // Don't throw - allow connection to succeed even if tool listing fails
      this.toolCache.set(serverName, []);
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

    const actualToolName = toolName.replace(`${serverName}__`, "");

    // Log the MCP call with parameters
    logger.info(
      {
        serverName,
        toolName: actualToolName,
        parameters: args,
      },
      `[MCP CALL] ${serverName}.${actualToolName}`
    );

    const response = await client.callTool({
      name: actualToolName,
      arguments: args,
    });

    // Log response (truncated if too large)
    const responseStr = JSON.stringify(response);
    const truncatedResponse =
      responseStr.length > 500
        ? responseStr.substring(0, 500) +
          `... (${responseStr.length} chars total)`
        : responseStr;

    logger.info(
      {
        serverName,
        toolName: actualToolName,
        responsePreview: truncatedResponse,
      },
      `[MCP RESPONSE] ${serverName}.${actualToolName}`
    );

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
   * Handle SSE OAuth pre-flight discovery
   * SSE doesn't support custom headers, so we need to:
   * 1. Discover OAuth metadata before connecting
   * 2. Trigger OAuth flow
   * 3. Store tokens
   * 4. Connect with authenticated session
   */
  private async handleSseOAuthPreFlight(dataSource: DataSource): Promise<void> {
    if (!dataSource.url || !dataSource._id) {
      throw new Error("SSE OAuth requires url and server ID");
    }

    logger.info(
      { serverName: dataSource.name, url: dataSource.url },
      "Starting SSE OAuth pre-flight discovery"
    );

    // Perform discovery
    const discovery = await discoverSseOAuth(dataSource.url);

    if (!discovery.requiresAuth) {
      logger.info(
        { serverName: dataSource.name },
        "SSE server does not require authentication, retrying connection"
      );
      // Retry connection without OAuth
      const dataSourceNoAuth = { ...dataSource, authType: "none" as const };
      return this.connect(dataSourceNoAuth);
    }

    if (discovery.error || !discovery.oauthMetadata) {
      logger.error(
        { serverName: dataSource.name, error: discovery.error },
        "SSE OAuth discovery failed"
      );
      throw new Error(
        `SSE OAuth discovery failed: ${discovery.error || "Unknown error"}`
      );
    }

    // Check if we already have tokens
    const existingProvider = oauthProviderFactory.getProvider(
      dataSource._id.toString()
    );
    if (existingProvider) {
      // Try to connect with existing tokens
      logger.info(
        { serverName: dataSource.name },
        "Found existing OAuth provider, attempting connection"
      );
      // Retry connection (will use OAuth provider)
      return this.connect(dataSource);
    }

    // Need to trigger OAuth flow
    logger.info(
      { serverName: dataSource.name, metadata: discovery.oauthMetadata },
      "SSE requires OAuth, triggering authorization flow"
    );

    // Emit event for frontend to handle
    this.eventEmitter.emit("oauth-redirect-required", {
      serverId: dataSource._id?.toString(),
      serverName: dataSource.name,
      authorizationEndpoint: discovery.oauthMetadata.authorizationEndpoint,
      tokenEndpoint: discovery.oauthMetadata.tokenEndpoint,
      scopes: discovery.oauthMetadata.scopesSupported || [],
    });

    // Don't throw - the frontend will handle the OAuth flow
    // After OAuth completes, the connection will be retried
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
