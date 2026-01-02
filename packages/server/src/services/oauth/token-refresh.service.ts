import { MCPServerConfigModel } from "../../models/mcp-config.model.js";
import logger from "../../utils/logger.js";
import { env } from "../../env.js";

interface OAuthConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

/**
 * Token Refresh Service
 * Handles automatic refresh of OAuth tokens before expiration
 */
export class TokenRefreshService {
  private readonly OAUTH_CONFIGS: Record<string, OAuthConfig> = {
    github: {
      tokenUrl: "https://github.com/login/oauth/access_token",
      clientId: env.GITHUB_OAUTH_CLIENT_ID || "",
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET || "",
    },
    notion: {
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      clientId: env.NOTION_OAUTH_CLIENT_ID || "",
      clientSecret: env.NOTION_OAUTH_CLIENT_SECRET || "",
    },
    slack: {
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      clientId: env.SLACK_OAUTH_CLIENT_ID || "",
      clientSecret: env.SLACK_OAUTH_CLIENT_SECRET || "",
    },
  };

  /**
   * Check if token needs refresh and refresh if necessary
   * @param serviceName - Service name (github, notion, slack)
   * @returns true if token was refreshed, false otherwise
   */
  async refreshTokenIfNeeded(serviceName: string): Promise<boolean> {
    try {
      const config = await MCPServerConfigModel.findOne({ name: serviceName });

      if (!config || config.authType !== "oauth" || !config.oauthTokens) {
        return false;
      }

      // Check if token expires in less than 5 minutes
      const expiresAt = config.oauthTokens.expiresAt;
      if (!expiresAt) {
        logger.debug({ serviceName }, "No expiration time set for OAuth token");
        return false;
      }

      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
      if (expiresAt > fiveMinutesFromNow) {
        logger.debug(
          { serviceName, expiresAt },
          "OAuth token does not need refresh yet"
        );
        return false;
      }

      // Token needs refresh
      if (!config.oauthTokens.refreshToken) {
        logger.warn(
          { serviceName },
          "OAuth token expired but no refresh token available"
        );
        return false;
      }

      logger.info({ serviceName }, "Refreshing OAuth token");
      await this.refreshToken(serviceName, config.oauthTokens.refreshToken);
      return true;
    } catch (err) {
      logger.error({ err, serviceName }, "Failed to check/refresh OAuth token");
      return false;
    }
  }

  /**
   * Refresh an OAuth token
   * @param serviceName - Service name
   * @param refreshToken - Refresh token
   */
  private async refreshToken(
    serviceName: string,
    refreshToken: string
  ): Promise<void> {
    const oauthConfig = this.OAUTH_CONFIGS[serviceName];
    if (!oauthConfig) {
      throw new Error(`OAuth not configured for service: ${serviceName}`);
    }

    if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
      throw new Error(
        `OAuth credentials not configured for service: ${serviceName}`
      );
    }

    try {
      const response = await fetch(oauthConfig.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: oauthConfig.clientId,
          client_secret: oauthConfig.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed: ${response.status} ${errorText}`
        );
      }

      const tokens: TokenResponse = await response.json();

      // Update tokens in database
      await MCPServerConfigModel.findOneAndUpdate(
        { name: serviceName },
        {
          $set: {
            "oauthTokens.accessToken": tokens.access_token,
            "oauthTokens.refreshToken": tokens.refresh_token || refreshToken, // Keep old refresh token if new one not provided
            "oauthTokens.expiresAt": tokens.expires_in
              ? new Date(Date.now() + tokens.expires_in * 1000)
              : undefined,
            "oauthTokens.tokenType": tokens.token_type,
            "oauthTokens.scope": tokens.scope,
          },
        }
      );

      logger.info({ serviceName }, "Successfully refreshed OAuth token");
    } catch (err) {
      logger.error({ err, serviceName }, "Failed to refresh OAuth token");
      throw err;
    }
  }

  /**
   * Refresh all tokens that are about to expire
   * This can be called periodically (e.g., every minute)
   */
  async refreshAllExpiring(): Promise<void> {
    try {
      const configs = await MCPServerConfigModel.find({
        authType: "oauth",
        "oauthTokens.refreshToken": { $exists: true },
      });

      logger.debug(
        { count: configs.length },
        "Checking OAuth tokens for refresh"
      );

      for (const config of configs) {
        await this.refreshTokenIfNeeded(config.name);
      }
    } catch (err) {
      logger.error({ err }, "Failed to refresh expiring OAuth tokens");
    }
  }
}

export const tokenRefreshService = new TokenRefreshService();
