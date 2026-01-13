import { OAuthTokenModel } from '../models/oauth-token.model.js';
import { DataSourceModel } from '../models/data-source.model.js';
import { generatePKCE, generateState } from './pkce.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * OAuth configuration for MCP servers
 */
export interface OAuthConfig {
  authorizationUrl: string; // Authorization endpoint
  tokenUrl: string; // Token endpoint
  clientId: string;
  clientSecret?: string; // Optional for public clients
  redirectUri: string;
  scopes: string[];
  usePKCE: boolean; // Default true for OAuth 2.1
}

/**
 * OAuth token response
 */
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string[];
  tokenType?: string;
}

/**
 * OAuth Flow Manager
 * Handles delegated OAuth for connecting to custom MCP servers
 */
export class OAuthFlowManager {
  /**
   * Start OAuth flow for an MCP server
   * @param mcpServerId - MCP server config ID
   * @param config - OAuth configuration
   * @returns Authorization URL and state
   */
  async startFlow(
    mcpServerId: string,
    config: OAuthConfig,
  ): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    logger.info({ mcpServerId }, 'Starting OAuth flow');

    // Validate server exists
    const serverExists = await DataSourceModel.findById(mcpServerId);
    if (!serverExists) {
      throw new Error(`MCP server not found: ${mcpServerId}`);
    }

    // Generate PKCE pair
    const { codeVerifier, codeChallenge } = generatePKCE();

    // Generate state for CSRF protection
    const state = generateState();

    // Create or update OAuth token document with state and code verifier
    await OAuthTokenModel.findOneAndUpdate(
      { mcpServerConfigId: new mongoose.Types.ObjectId(mcpServerId) },
      {
        mcpServerConfigId: new mongoose.Types.ObjectId(mcpServerId),
        state,
        codeVerifier,
        // Temporary placeholder values (will be replaced after callback)
        accessToken: 'pending',
        salt: state, // Use state as temporary salt
      },
      { upsert: true, new: true },
    );

    // Build authorization URL
    const authUrl = new URL(config.authorizationUrl);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', config.scopes.join(' '));

    if (config.usePKCE) {
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
    }

    logger.debug({ mcpServerId, state }, 'Generated authorization URL for OAuth flow');

    return {
      authorizationUrl: authUrl.toString(),
      state,
    };
  }

  /**
   * Handle OAuth callback and exchange authorization code for tokens
   * @param code - Authorization code from callback
   * @param state - State parameter from callback
   * @returns OAuth tokens
   */
  async handleCallback(code: string, state: string): Promise<OAuthTokenResponse> {
    logger.info({ state }, 'Handling OAuth callback');

    // Find OAuth token record by state
    const tokenRecord = await OAuthTokenModel.findOne({ state });
    if (!tokenRecord) {
      throw new Error('Invalid OAuth state - token record not found');
    }

    // Get OAuth config from DataSource
    const dataSource = await DataSourceModel.findById(tokenRecord.mcpServerConfigId);

    if (!dataSource || !dataSource.oauth) {
      throw new Error('OAuth config not found in DataSource');
    }

    const oauthConfig = dataSource.oauth;
    logger.debug(
      { mcpServerConfigId: tokenRecord.mcpServerConfigId },
      'Found OAuth config in DataSourceModel',
    );

    // Prepare token exchange request
    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: oauthConfig.redirectUri || '',
      client_id: oauthConfig.clientId || '',
    });

    // Add client secret if available
    if (oauthConfig.clientSecret) {
      tokenRequestBody.set('client_secret', oauthConfig.clientSecret);
    }

    // Add PKCE code verifier if PKCE is enabled
    if (oauthConfig.usePKCE && tokenRecord.codeVerifier) {
      tokenRequestBody.set('code_verifier', tokenRecord.codeVerifier);
    }

    // Exchange code for tokens
    logger.debug({ state }, 'Exchanging authorization code for tokens');
    const response = await fetch(oauthConfig.tokenUrl || '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ state, status: response.status, error: errorText }, 'Token exchange failed');
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    const tokenData = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    // Extract tokens from response
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;
    const scope = tokenData.scope?.split(' ');
    const tokenType = tokenData.token_type || 'Bearer';

    if (!accessToken) {
      throw new Error('Access token not received from authorization server');
    }

    // Calculate expiration date
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    // Update token record with actual tokens
    await OAuthTokenModel.findOneAndUpdate(
      { _id: tokenRecord._id },
      {
        accessToken,
        refreshToken,
        tokenType,
        scope,
        expiresAt,
        state: undefined, // Clear state after successful exchange
        codeVerifier: undefined, // Clear code verifier
      },
    );

    logger.info(
      { mcpServerConfigId: tokenRecord.mcpServerConfigId },
      'Successfully exchanged authorization code for tokens',
    );

    return {
      accessToken,
      refreshToken,
      expiresIn,
      scope,
      tokenType,
    };
  }

  /**
   * Refresh OAuth tokens for an MCP server
   * @param mcpServerId - MCP server config ID
   * @returns New OAuth tokens
   */
  async refreshTokens(mcpServerId: string): Promise<OAuthTokenResponse> {
    logger.info({ mcpServerId }, 'Refreshing OAuth tokens');

    // Get token record
    const tokenRecord = await OAuthTokenModel.findOne({
      mcpServerConfigId: new mongoose.Types.ObjectId(mcpServerId),
    });

    if (!tokenRecord || !tokenRecord.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Get OAuth config from DataSource
    const dataSource = await DataSourceModel.findById(mcpServerId);

    if (!dataSource || !dataSource.oauth) {
      throw new Error('OAuth config not found in DataSource');
    }

    const oauthConfig = dataSource.oauth;
    logger.debug({ mcpServerId }, 'Found OAuth config in DataSourceModel for refresh');

    // Prepare token refresh request
    const tokenRequestBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenRecord.refreshToken,
      client_id: oauthConfig.clientId || '',
    });

    // Add client secret if available
    if (oauthConfig.clientSecret) {
      tokenRequestBody.set('client_secret', oauthConfig.clientSecret);
    }

    // Request new tokens
    logger.debug({ mcpServerId }, 'Requesting token refresh');
    const response = await fetch(oauthConfig.tokenUrl || '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { mcpServerId, status: response.status, error: errorText },
        'Token refresh failed',
      );
      throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
    }

    const tokenData = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    // Extract tokens from response
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || tokenRecord.refreshToken; // Use old refresh token if not rotated
    const expiresIn = tokenData.expires_in;
    const scope = tokenData.scope?.split(' ');
    const tokenType = tokenData.token_type || 'Bearer';

    if (!accessToken) {
      throw new Error('Access token not received from authorization server');
    }

    // Calculate expiration date
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    // Update token record
    await OAuthTokenModel.findOneAndUpdate(
      { _id: tokenRecord._id },
      {
        accessToken,
        refreshToken,
        tokenType,
        scope,
        expiresAt,
      },
    );

    logger.info({ mcpServerId }, 'Successfully refreshed tokens');

    return {
      accessToken,
      refreshToken,
      expiresIn,
      scope,
      tokenType,
    };
  }

  /**
   * Revoke OAuth tokens for an MCP server
   * @param mcpServerId - MCP server config ID
   */
  async revokeTokens(mcpServerId: string): Promise<void> {
    logger.info({ mcpServerId }, 'Revoking OAuth tokens');

    // Delete token record
    await OAuthTokenModel.findOneAndDelete({
      mcpServerConfigId: new mongoose.Types.ObjectId(mcpServerId),
    });

    logger.info({ mcpServerId }, 'Successfully revoked tokens');
  }

  /**
   * Get a valid access token for an MCP server
   * Auto-refreshes if token is expired
   * @param mcpServerId - MCP server config ID
   * @returns Valid access token or null if not authenticated
   */
  async getAccessToken(mcpServerId: string): Promise<string | null> {
    // Get token record
    const tokenRecord = await OAuthTokenModel.findOne({
      mcpServerConfigId: new mongoose.Types.ObjectId(mcpServerId),
    });

    if (!tokenRecord) {
      logger.debug({ mcpServerId }, 'No OAuth token found');
      return null;
    }

    // Check if access token is still valid
    if (tokenRecord.expiresAt && tokenRecord.expiresAt <= new Date()) {
      logger.debug({ mcpServerId }, 'Access token expired, attempting refresh');

      // Token expired, try to refresh
      if (tokenRecord.refreshToken) {
        try {
          const newTokens = await this.refreshTokens(mcpServerId);
          return newTokens.accessToken;
        } catch (err) {
          logger.error({ err, mcpServerId }, 'Failed to refresh expired token');
          return null;
        }
      } else {
        logger.warn({ mcpServerId }, 'Access token expired and no refresh token available');
        return null;
      }
    }

    // Token is still valid
    return tokenRecord.accessToken;
  }

  /**
   * Get OAuth connection status for an MCP server
   * @param mcpServerId - MCP server config ID
   * @returns Connection status information
   */
  async getStatus(mcpServerId: string): Promise<{
    connected: boolean;
    expiresAt?: Date;
    hasRefreshToken: boolean;
    scope?: string[];
  }> {
    const tokenRecord = await OAuthTokenModel.findOne({
      mcpServerConfigId: new mongoose.Types.ObjectId(mcpServerId),
    });

    if (!tokenRecord) {
      return {
        connected: false,
        hasRefreshToken: false,
      };
    }

    return {
      connected: true,
      expiresAt: tokenRecord.expiresAt ?? undefined,
      hasRefreshToken: !!tokenRecord.refreshToken,
      scope: tokenRecord.scope,
    };
  }
}

// Export singleton instance
export const oauthFlowManager = new OAuthFlowManager();
