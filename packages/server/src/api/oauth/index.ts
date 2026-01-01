import { Router, type Router as ExpressRouter } from "express";
import { oauthFlowManager } from "../../oauth/oauth-flow.js";
import { DataSourceModel } from "../../models/data-source.model.js";
import { discoverOAuthMetadata } from "../../oauth/discovery.js";
import { discoverSseOAuth } from "../../oauth/sse-oauth.js";
import { mcpClientManager } from "../../mcp/client.js";
import logger from "../../utils/logger.js";

const router: ExpressRouter = Router();

/**
 * POST /api/oauth/discover-sse
 * Discover OAuth metadata from SSE endpoint (pre-flight)
 */
router.post("/discover-sse", async (req, res) => {
  try {
    const { sseUrl } = req.body;

    if (!sseUrl || typeof sseUrl !== "string") {
      return res.status(400).json({
        error: "sseUrl is required and must be a string",
      });
    }

    logger.info({ sseUrl }, "SSE OAuth discovery request received");

    // Discover metadata via pre-flight
    const result = await discoverSseOAuth(sseUrl);

    if (!result.requiresAuth) {
      return res.json({
        success: true,
        requiresAuth: false,
      });
    }

    if (result.error || !result.oauthMetadata) {
      return res.status(404).json({
        success: false,
        error: result.error || "Failed to discover OAuth metadata",
      });
    }

    logger.info(
      { sseUrl, metadata: result.oauthMetadata },
      "SSE OAuth discovery successful"
    );

    res.json({
      success: true,
      requiresAuth: true,
      metadata: result.oauthMetadata,
    });
  } catch (err) {
    logger.error({ err }, "Failed to discover SSE OAuth metadata");
    res.status(500).json({
      error: "Failed to discover SSE OAuth metadata",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/oauth/discover
 * Discover OAuth metadata from issuer URL
 */
router.post("/discover", async (req, res) => {
  try {
    const { issuerUrl } = req.body;

    if (!issuerUrl || typeof issuerUrl !== "string") {
      return res.status(400).json({
        error: "issuerUrl is required and must be a string",
      });
    }

    logger.info({ issuerUrl }, "OAuth discovery request received");

    // Discover metadata
    const result = await discoverOAuthMetadata(issuerUrl);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    logger.info(
      { issuerUrl, source: result.source },
      "OAuth discovery successful"
    );

    res.json({
      success: true,
      metadata: result.metadata,
      source: result.source,
    });
  } catch (err) {
    logger.error({ err }, "Failed to discover OAuth metadata");
    res.status(500).json({
      error: "Failed to discover OAuth metadata",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/oauth/start-sse/:mcpServerId
 * Initiate OAuth flow for an SSE MCP server (with auto-discovery)
 */
router.post("/start-sse/:mcpServerId", async (req, res) => {
  try {
    const { mcpServerId } = req.params;

    // Get data source config
    const dataSource = await DataSourceModel.findById(mcpServerId);
    if (!dataSource) {
      return res.status(404).json({ error: "Data source not found" });
    }

    if (dataSource.type !== "sse" || !dataSource.url) {
      return res
        .status(400)
        .json({ error: "Data source is not configured as SSE" });
    }

    // Perform SSE OAuth discovery
    const discovery = await discoverSseOAuth(dataSource.url);

    if (!discovery.requiresAuth) {
      return res.json({
        requiresAuth: false,
        message: "Server does not require authentication",
      });
    }

    if (discovery.error || !discovery.oauthMetadata) {
      return res.status(400).json({
        error: discovery.error || "Failed to discover OAuth metadata",
      });
    }

    // Start OAuth flow with discovered metadata
    const { authorizationUrl, state } = await oauthFlowManager.startFlow(
      mcpServerId,
      {
        authorizationUrl: discovery.oauthMetadata.authorizationEndpoint,
        tokenUrl: discovery.oauthMetadata.tokenEndpoint,
        clientId: dataSource.oauth?.clientId || "",
        clientSecret: dataSource.oauth?.clientSecret ?? undefined,
        redirectUri:
          dataSource.oauth?.redirectUri ||
          "http://localhost:3001/api/oauth/callback",
        scopes: discovery.oauthMetadata.scopesSupported || [],
        usePKCE: true,
      }
    );

    logger.info({ mcpServerId, state }, "SSE OAuth flow started");

    res.json({
      requiresAuth: true,
      authorizationUrl,
      state,
      metadata: discovery.oauthMetadata,
    });
  } catch (err) {
    logger.error({ err }, "Failed to start SSE OAuth flow");
    res.status(500).json({
      error: "Failed to start SSE OAuth flow",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/oauth/start/:mcpServerId
 * Initiate OAuth flow for an MCP server
 */
router.get("/start/:mcpServerId", async (req, res) => {
  try {
    const { mcpServerId } = req.params;

    // Get data source config
    const dataSource = await DataSourceModel.findById(mcpServerId);
    if (!dataSource) {
      return res.status(404).json({ error: "Data source not found" });
    }

    if (dataSource.authType !== "oauth" || !dataSource.oauth) {
      return res
        .status(400)
        .json({ error: "Data source is not configured for OAuth" });
    }

    // Start OAuth flow
    const { authorizationUrl, state } = await oauthFlowManager.startFlow(
      mcpServerId,
      {
        authorizationUrl: dataSource.oauth.authorizationUrl || "",
        tokenUrl: dataSource.oauth.tokenUrl || "",
        clientId: dataSource.oauth.clientId || "",
        clientSecret: dataSource.oauth.clientSecret ?? undefined,
        redirectUri: dataSource.oauth.redirectUri || "",
        scopes: dataSource.oauth.scopes || [],
        usePKCE: dataSource.oauth.usePKCE ?? true,
      }
    );

    logger.info({ mcpServerId, state }, "OAuth flow started");

    res.json({
      authorizationUrl,
      state,
    });
  } catch (err) {
    logger.error({ err }, "Failed to start OAuth flow");
    res.status(500).json({
      error: "Failed to start OAuth flow",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/oauth/code
 * Receive authorization code from frontend after OAuth redirect
 * This is called by the frontend after the user completes OAuth in popup
 */
router.post("/code", async (req, res) => {
  try {
    const { serverId, code, state } = req.body;

    if (!serverId || !code) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["serverId", "code"],
      });
    }

    logger.info({ serverId }, "Received OAuth code from frontend");

    // Pass code to MCP client manager
    mcpClientManager.receiveOAuthCallback(serverId, code);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to process OAuth code");
    res.status(500).json({
      error: "Failed to process OAuth code",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/oauth/callback
 * Handle OAuth callback from authorization server
 */
router.get("/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for errors from authorization server
    if (error) {
      logger.error({ error, error_description }, "OAuth authorization failed");
      return res.redirect(
        `/oauth/callback?error=${encodeURIComponent(
          error as string
        )}&description=${encodeURIComponent(
          (error_description as string) || ""
        )}`
      );
    }

    if (!code || !state) {
      return res.status(400).json({
        error: "Missing code or state parameter",
      });
    }

    // Exchange code for tokens
    const tokens = await oauthFlowManager.handleCallback(
      code as string,
      state as string
    );

    logger.info({ state }, "OAuth callback handled successfully");

    // Redirect to success page (frontend will handle popup messaging)
    res.redirect("/oauth/callback?success=true");
  } catch (err) {
    logger.error({ err }, "Failed to handle OAuth callback");
    res.redirect(
      `/oauth/callback?error=callback_failed&description=${encodeURIComponent(
        err instanceof Error ? err.message : String(err)
      )}`
    );
  }
});

/**
 * POST /api/oauth/refresh/:mcpServerId
 * Manually refresh OAuth tokens for an MCP server
 */
router.post("/refresh/:mcpServerId", async (req, res) => {
  try {
    const { mcpServerId } = req.params;

    // Refresh tokens
    const tokens = await oauthFlowManager.refreshTokens(mcpServerId);

    logger.info({ mcpServerId }, "OAuth tokens refreshed");

    res.json({
      success: true,
      expiresIn: tokens.expiresIn,
    });
  } catch (err) {
    logger.error({ err }, "Failed to refresh OAuth tokens");
    res.status(500).json({
      error: "Failed to refresh tokens",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * DELETE /api/oauth/revoke/:mcpServerId
 * Revoke OAuth tokens for an MCP server
 */
router.delete("/revoke/:mcpServerId", async (req, res) => {
  try {
    const { mcpServerId } = req.params;

    // Revoke tokens
    await oauthFlowManager.revokeTokens(mcpServerId);

    logger.info({ mcpServerId }, "OAuth tokens revoked");

    res.json({
      success: true,
    });
  } catch (err) {
    logger.error({ err }, "Failed to revoke OAuth tokens");
    res.status(500).json({
      error: "Failed to revoke tokens",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/oauth/status/:mcpServerId
 * Get OAuth connection status for an MCP server
 */
router.get("/status/:mcpServerId", async (req, res) => {
  try {
    const { mcpServerId } = req.params;

    // Get OAuth status
    const status = await oauthFlowManager.getStatus(mcpServerId);

    res.json(status);
  } catch (err) {
    logger.error({ err }, "Failed to get OAuth status");
    res.status(500).json({
      error: "Failed to get OAuth status",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
