import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { MCPServerConfigModel } from "../models/mcp-config.model.js";
import { OAuthTokenModel } from "../models/oauth-token.model.js";
import logger from "../utils/logger.js";
import { env } from "../env.js";

/**
 * MCP OAuth Provider - implements MCP SDK's OAuthClientProvider interface
 * Persists OAuth state and tokens to MongoDB
 */
export class MCPOAuthProvider implements OAuthClientProvider {
  private redirectCallback?: (url: URL) => void;

  constructor(
    private mcpServerId: string,
    private mcpServerUrl: string,
    onRedirect?: (url: URL) => void,
    public readonly clientMetadataUrl?: string
  ) {
    this.redirectCallback = onRedirect;
  }

  /**
   * Get redirect URL for OAuth callbacks
   */
  get redirectUrl(): string {
    // Use environment variable or default callback URL
    return env.OAUTH_REDIRECT_URI || "http://localhost:3001/api/oauth/callback";
  }

  /**
   * Get OAuth client metadata for registration
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Ebee MCP Client",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    };
  }

  /**
   * Load client information from database
   * Returns dynamically registered client info OR static client credentials
   */
  clientInformation(): OAuthClientInformationMixed | undefined {
    // This should be called synchronously, but we need to load from DB
    // We'll need to cache this or make the SDK support async
    // For now, return undefined and rely on the SDK to register
    logger.warn(
      { mcpServerId: this.mcpServerId },
      "clientInformation() called synchronously - returning undefined"
    );
    return undefined;
  }

  /**
   * Save dynamically registered client information
   */
  saveClientInformation(clientInfo: OAuthClientInformationMixed): void {
    logger.info(
      { mcpServerId: this.mcpServerId, clientId: clientInfo.client_id },
      "Saving OAuth client information"
    );

    // Extract registration_access_token if it exists (only on full response)
    const registrationAccessToken =
      "registration_access_token" in clientInfo
        ? clientInfo.registration_access_token
        : undefined;

    // Save to database asynchronously
    MCPServerConfigModel.findByIdAndUpdate(
      this.mcpServerId,
      {
        $set: {
          "oauth.registrationStatus": "registered",
          "oauth.clientMetadata": {
            clientId: clientInfo.client_id,
            clientSecret: clientInfo.client_secret,
            clientIdIssuedAt: clientInfo.client_id_issued_at,
            clientSecretExpiresAt: clientInfo.client_secret_expires_at,
            registrationAccessToken,
          },
        },
      },
      { new: true }
    )
      .then(() => {
        logger.info(
          { mcpServerId: this.mcpServerId },
          "Successfully saved client information"
        );
      })
      .catch((err) => {
        logger.error(
          { err, mcpServerId: this.mcpServerId },
          "Failed to save client information"
        );
      });
  }

  /**
   * Load OAuth tokens from database
   */
  tokens(): OAuthTokens | undefined {
    // This is called synchronously by the SDK, but we need async DB access
    // We'll need to cache tokens or make SDK support async
    logger.warn(
      { mcpServerId: this.mcpServerId },
      "tokens() called synchronously - returning undefined"
    );
    return undefined;
  }

  /**
   * Save OAuth tokens to database
   */
  saveTokens(tokens: OAuthTokens): void {
    logger.info({ mcpServerId: this.mcpServerId }, "Saving OAuth tokens");

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : undefined;

    // Save to database asynchronously
    OAuthTokenModel.findOneAndUpdate(
      { mcpServerConfigId: this.mcpServerId },
      {
        $set: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenType: tokens.token_type || "Bearer",
          scope: tokens.scope?.split(" ") || [],
          expiresAt,
        },
      },
      { upsert: true, new: true }
    )
      .then(() => {
        logger.info(
          { mcpServerId: this.mcpServerId },
          "Successfully saved OAuth tokens"
        );
      })
      .catch((err) => {
        logger.error(
          { err, mcpServerId: this.mcpServerId },
          "Failed to save OAuth tokens"
        );
      });
  }

  /**
   * Trigger browser redirect to authorization URL
   */
  redirectToAuthorization(authorizationUrl: URL): void {
    logger.info(
      { mcpServerId: this.mcpServerId, authUrl: authorizationUrl.toString() },
      "OAuth redirect required"
    );

    if (this.redirectCallback) {
      this.redirectCallback(authorizationUrl);
    } else {
      logger.warn(
        { mcpServerId: this.mcpServerId },
        "No redirect callback configured - OAuth flow cannot proceed"
      );
    }
  }

  /**
   * Save PKCE code verifier
   */
  saveCodeVerifier(codeVerifier: string): void {
    logger.debug(
      { mcpServerId: this.mcpServerId },
      "Saving PKCE code verifier"
    );

    // Save to database asynchronously
    OAuthTokenModel.findOneAndUpdate(
      { mcpServerConfigId: this.mcpServerId },
      { $set: { codeVerifier } },
      { upsert: true, new: true }
    )
      .then(() => {
        logger.debug(
          { mcpServerId: this.mcpServerId },
          "Successfully saved code verifier"
        );
      })
      .catch((err) => {
        logger.error(
          { err, mcpServerId: this.mcpServerId },
          "Failed to save code verifier"
        );
      });
  }

  /**
   * Retrieve PKCE code verifier
   */
  codeVerifier(): string {
    // This is called synchronously by the SDK
    // We'll need to cache this value
    logger.warn(
      { mcpServerId: this.mcpServerId },
      "codeVerifier() called synchronously - returning empty string"
    );
    return "";
  }

  /**
   * Async helper to load client information from database
   */
  async loadClientInformation(): Promise<
    OAuthClientInformationMixed | undefined
  > {
    try {
      const config = await MCPServerConfigModel.findById(this.mcpServerId);

      if (!config?.oauth) {
        return undefined;
      }

      // Return dynamic registration if available
      if (
        config.oauth.registrationStatus === "registered" &&
        config.oauth.clientMetadata
      ) {
        return {
          client_id: config.oauth.clientMetadata.clientId!,
          client_secret: config.oauth.clientMetadata.clientSecret ?? undefined,
          client_id_issued_at:
            config.oauth.clientMetadata.clientIdIssuedAt ?? undefined,
          client_secret_expires_at:
            config.oauth.clientMetadata.clientSecretExpiresAt ?? undefined,
        };
      }

      // Fall back to static credentials
      if (config.oauth.clientId) {
        return {
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret ?? undefined,
        };
      }

      return undefined;
    } catch (err) {
      logger.error(
        { err, mcpServerId: this.mcpServerId },
        "Failed to load client information"
      );
      return undefined;
    }
  }

  /**
   * Async helper to load tokens from database
   */
  async loadTokens(): Promise<OAuthTokens | undefined> {
    try {
      const tokenDoc = await OAuthTokenModel.findOne({
        mcpServerConfigId: this.mcpServerId,
      });

      if (!tokenDoc) {
        return undefined;
      }

      return {
        access_token: tokenDoc.accessToken,
        refresh_token: tokenDoc.refreshToken ?? undefined,
        token_type: tokenDoc.tokenType || "Bearer",
        expires_in: tokenDoc.expiresAt
          ? Math.floor((tokenDoc.expiresAt.getTime() - Date.now()) / 1000)
          : undefined,
        scope: tokenDoc.scope?.join(" ") ?? undefined,
      };
    } catch (err) {
      logger.error(
        { err, mcpServerId: this.mcpServerId },
        "Failed to load OAuth tokens"
      );
      return undefined;
    }
  }

  /**
   * Async helper to load code verifier from database
   */
  async loadCodeVerifier(): Promise<string | undefined> {
    try {
      const tokenDoc = await OAuthTokenModel.findOne({
        mcpServerConfigId: this.mcpServerId,
      });

      return tokenDoc?.codeVerifier ?? undefined;
    } catch (err) {
      logger.error(
        { err, mcpServerId: this.mcpServerId },
        "Failed to load code verifier"
      );
      return undefined;
    }
  }
}

/**
 * Factory for managing OAuth provider instances
 */
export class MCPOAuthProviderFactory {
  private providers: Map<string, MCPOAuthProvider> = new Map();

  /**
   * Create or get an OAuth provider for an MCP server
   */
  createProvider(
    mcpServerId: string,
    serverUrl: string,
    onRedirect: (url: URL) => void,
    clientMetadataUrl?: string
  ): MCPOAuthProvider {
    let provider = this.providers.get(mcpServerId);

    if (!provider) {
      provider = new MCPOAuthProvider(
        mcpServerId,
        serverUrl,
        onRedirect,
        clientMetadataUrl
      );
      this.providers.set(mcpServerId, provider);
      logger.debug({ mcpServerId }, "Created new OAuth provider instance");
    }

    return provider;
  }

  /**
   * Get an existing OAuth provider
   */
  getProvider(mcpServerId: string): MCPOAuthProvider | undefined {
    return this.providers.get(mcpServerId);
  }

  /**
   * Remove an OAuth provider
   */
  removeProvider(mcpServerId: string): void {
    this.providers.delete(mcpServerId);
    logger.debug({ mcpServerId }, "Removed OAuth provider instance");
  }
}

// Export singleton factory
export const oauthProviderFactory = new MCPOAuthProviderFactory();
