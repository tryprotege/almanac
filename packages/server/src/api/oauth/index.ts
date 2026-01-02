import { Request, Response, Router } from "express";
import { OAuthStateService } from "../../services/oauth/oauth-state.service.js";
import { MCPServerConfigModel } from "../../models/mcp-config.model.js";
import { env } from "../../env.js";
import logger from "../../utils/logger.js";
import { connectRedis } from "../../connections/redis.js";

const oauthRouter: Router = Router();

// OAuth configuration for each service
interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  additionalParams?: Record<string, string>;
}

const getOAuthConfig = (service: string): OAuthConfig | null => {
  const configs: Record<string, OAuthConfig> = {
    github: {
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "read:org", "read:user", "workflow"],
      clientId: env.GITHUB_OAUTH_CLIENT_ID || "",
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET || "",
    },
    notion: {
      authUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: [],
      clientId: env.NOTION_OAUTH_CLIENT_ID || "",
      clientSecret: env.NOTION_OAUTH_CLIENT_SECRET || "",
      additionalParams: {
        response_type: "code",
        owner: "user",
      },
    },
    slack: {
      authUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: [
        "channels:read",
        "channels:history",
        "users:read",
        "chat:write",
        "groups:read",
        "groups:history",
        "im:read",
        "im:history",
        "mpim:read",
        "mpim:history",
      ],
      clientId: env.SLACK_OAUTH_CLIENT_ID || "",
      clientSecret: env.SLACK_OAUTH_CLIENT_SECRET || "",
    },
  };

  return configs[service] || null;
};

// Step 1: Initiate OAuth flow
oauthRouter.get("/:service/authorize", async (req: Request, res: Response) => {
  const { service } = req.params;

  try {
    const config = getOAuthConfig(service);

    if (!config) {
      res.status(400).json({
        success: false,
        error: `Unsupported service: ${service}`,
      });
      return;
    }

    if (!config.clientId || !config.clientSecret) {
      res.status(500).json({
        success: false,
        error: `OAuth not configured for ${service}. Please set client ID and secret in environment variables.`,
      });
      return;
    }

    // Create Redis connection for state service
    const redis = await connectRedis();
    const stateService = new OAuthStateService(redis);

    // Generate state token for CSRF protection
    const state = await stateService.generateState(service);

    // Build authorization URL
    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set(
      "redirect_uri",
      `${env.SERVER_URL}/api/oauth/${service}/callback`
    );
    authUrl.searchParams.set("state", state);

    if (config.scopes.length > 0) {
      authUrl.searchParams.set("scope", config.scopes.join(" "));
    }

    // Add any additional parameters
    if (config.additionalParams) {
      Object.entries(config.additionalParams).forEach(([key, value]) => {
        authUrl.searchParams.set(key, value);
      });
    }

    logger.info({ service, state }, "Generated OAuth authorization URL");

    res.json({
      success: true,
      data: {
        authUrl: authUrl.toString(),
        state,
      },
    });
  } catch (err) {
    logger.error({ err, service }, "Failed to initiate OAuth flow");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Step 2: Handle OAuth callback
oauthRouter.get("/:service/callback", async (req: Request, res: Response) => {
  const { service } = req.params;
  const { code, state, error, error_description } = req.query;

  try {
    // Check for OAuth errors
    if (error) {
      logger.error(
        { service, error, error_description },
        "OAuth authorization failed"
      );
      res.redirect(
        `${
          env.CLIENT_URL
        }/connections?oauth=error&service=${service}&message=${encodeURIComponent(
          error_description?.toString() || error.toString()
        )}`
      );
      return;
    }

    if (!code || !state) {
      res.redirect(
        `${env.CLIENT_URL}/connections?oauth=error&service=${service}&message=Missing+code+or+state`
      );
      return;
    }

    const config = getOAuthConfig(service);
    if (!config) {
      res.redirect(
        `${env.CLIENT_URL}/connections?oauth=error&service=${service}&message=Unsupported+service`
      );
      return;
    }

    // Create Redis connection for state service
    const redis = await connectRedis();
    const stateService = new OAuthStateService(redis);

    // Verify state token
    const verifiedService = await stateService.verifyAndConsumeState(
      state.toString()
    );
    if (!verifiedService || verifiedService !== service) {
      logger.warn({ service, state }, "Invalid OAuth state token");
      res.redirect(
        `${env.CLIENT_URL}/connections?oauth=error&service=${service}&message=Invalid+state+token`
      );
      return;
    }

    // Exchange code for tokens
    logger.info({ service }, "Exchanging OAuth code for tokens");

    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code.toString(),
        redirect_uri: `${env.SERVER_URL}/api/oauth/${service}/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error(
        { service, status: tokenResponse.status, errorText },
        "Failed to exchange OAuth code for tokens"
      );
      res.redirect(
        `${env.CLIENT_URL}/connections?oauth=error&service=${service}&message=Token+exchange+failed`
      );
      return;
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };

    // Store tokens in database
    await MCPServerConfigModel.findOneAndUpdate(
      { name: service },
      {
        $set: {
          authType: "oauth",
          oauthTokens: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expires_in
              ? new Date(Date.now() + tokens.expires_in * 1000)
              : undefined,
            tokenType: tokens.token_type || "Bearer",
            scope: tokens.scope,
          },
        },
      },
      { upsert: true }
    );

    logger.info({ service }, "Successfully stored OAuth tokens");

    // Redirect to success page
    res.redirect(
      `${env.CLIENT_URL}/connections?oauth=success&service=${service}`
    );
  } catch (err) {
    logger.error({ err, service }, "OAuth callback error");
    res.redirect(
      `${env.CLIENT_URL}/connections?oauth=error&service=${service}&message=Internal+error`
    );
  }
});

// Get OAuth status for a service
oauthRouter.get("/:service/status", async (req: Request, res: Response) => {
  const { service } = req.params;

  try {
    const config = await MCPServerConfigModel.findOne({ name: service });

    if (!config || config.authType !== "oauth") {
      res.json({
        success: true,
        data: {
          connected: false,
          service,
        },
      });
      return;
    }

    const hasValidToken =
      config.oauthTokens?.accessToken &&
      (!config.oauthTokens.expiresAt ||
        config.oauthTokens.expiresAt > new Date());

    res.json({
      success: true,
      data: {
        connected: true,
        service,
        hasValidToken,
        expiresAt: config.oauthTokens?.expiresAt,
        scope: config.oauthTokens?.scope,
      },
    });
  } catch (err) {
    logger.error({ err, service }, "Failed to get OAuth status");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Disconnect OAuth for a service
oauthRouter.delete(
  "/:service/disconnect",
  async (req: Request, res: Response) => {
    const { service } = req.params;

    try {
      await MCPServerConfigModel.findOneAndUpdate(
        { name: service },
        {
          $set: {
            authType: "api_key",
          },
          $unset: {
            oauthTokens: "",
          },
        }
      );

      logger.info({ service }, "Disconnected OAuth");

      res.json({
        success: true,
        message: `Disconnected OAuth for ${service}`,
      });
    } catch (err) {
      logger.error({ err, service }, "Failed to disconnect OAuth");
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

export { oauthRouter };
