import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { DataSourceModel } from "../models/data-source.model.js";
import { OAuthTokenModel } from "../models/oauth-token.model.js";
import logger from "../utils/logger.js";
import { env } from "../env.js";

/**
 * MCP OAuth Provider - implements MCP SDK's OAuthClientProvider interface
 * Persists OAuth state and tokens to MongoDB
 */
export class MCPOAuthProvider implements OAuthClientProvider {
  private redirectCallback?: (url: URL) => void;
  private tokensCache?: OAuthTokens;
  private clientInfoCache?: OAuthClientInformationMixed;
  private codeVerifierCache?: string;
  private isInitialized = false;

  constructor(
    private mcpServerId: string,
    _mcpServerUrl: string,
    onRedirect?: (url: URL) => void,
    public readonly clientMetadataUrl?: string
  ) {
    this.redirectCallback = onRedirect;
    // Initialize cache asynchronously
    this.initializeCache().catch((err) => {
      logger.error(
        { err, mcpServerId },
        "Failed to initialize OAuth provider cache"
      );
    });
  }

  /**
   * Initialize cache from database
   */
  private async initializeCache(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load tokens
      this.tokensCache = await this.loadTokens();

      // Load client information
      this.clientInfoCache = await this.loadClientInformation();

      // Load code verifier
      this.codeVerifierCache = await this.loadCodeVerifier();

      this.isInitialized = true;

      logger.debug(
        {
          mcpServerId: this.mcpServerId,
          hasTokens: !!this.tokensCache,
          hasClientInfo: !!this.clientInfoCache,
        },
        "OAuth provider cache initialized"
      );
    } catch (err) {
      logger.error(
        { err, mcpServerId: this.mcpServerId },
        "Failed to initialize OAuth provider cache"
      );
    }
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
    // Return cached value
    if (this.clientInfoCache) {
      logger.debug(
        { mcpServerId: this.mcpServerId },
        "Returning cached client information"
      );
      return this.clientInfoCache;
    }

    logger.debug(
      { mcpServerId: this.mcpServerId },
      "No cached client information available"
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

    // Update cache immediately
    this.clientInfoCache = clientInfo;

    // Extract registration_access_token if it exists (only on full response)
    const registrationAccessToken =
      "registration_access_token" in clientInfo
        ? clientInfo.registration_access_token
        : undefined;

    const clientMetadata = {
      clientId: clientInfo.client_id,
      clientSecret: clientInfo.client_secret,
      clientIdIssuedAt: clientInfo.client_id_issued_at,
      clientSecretExpiresAt: clientInfo.client_secret_expires_at,
      registrationAccessToken,
    };

    // Save to DataSource
    DataSourceModel.findByIdAndUpdate(
      this.mcpServerId,
      {
        $set: {
          "oauth.registrationStatus": "registered",
          "oauth.clientMetadata": clientMetadata,
        },
      },
      { new: true }
    )
      .then((updated) => {
        if (updated) {
          logger.info(
            { mcpServerId: this.mcpServerId },
            "Successfully saved client information to DataSource"
          );
        } else {
          logger.warn(
            { mcpServerId: this.mcpServerId },
            "Failed to save client information - DataSource not found"
          );
        }
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
    // Return cached value
    if (this.tokensCache) {
      logger.debug(
        { mcpServerId: this.mcpServerId },
        "Returning cached OAuth tokens"
      );
      return this.tokensCache;
    }

    logger.debug(
      { mcpServerId: this.mcpServerId },
      "No cached OAuth tokens available"
    );
    return undefined;
  }

  /**
   * Save OAuth tokens to database
   */
  saveTokens(tokens: OAuthTokens): void {
    logger.info({ mcpServerId: this.mcpServerId }, "Saving OAuth tokens");

    // Update cache immediately
    this.tokensCache = tokens;

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

    // Update cache immediately
    this.codeVerifierCache = codeVerifier;

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
    // Return cached value
    if (this.codeVerifierCache) {
      logger.debug(
        { mcpServerId: this.mcpServerId },
        "Returning cached code verifier"
      );
      return this.codeVerifierCache;
    }

    logger.debug(
      { mcpServerId: this.mcpServerId },
      "No cached code verifier available"
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
      const dataSource = await DataSourceModel.findById(this.mcpServerId);

      if (!dataSource?.oauth) {
        return undefined;
      }

      // Return dynamic registration if available
      if (
        dataSource.oauth.registrationStatus === "registered" &&
        dataSource.oauth.clientMetadata
      ) {
        return {
          client_id: dataSource.oauth.clientMetadata.clientId!,
          client_secret:
            dataSource.oauth.clientMetadata.clientSecret ?? undefined,
          client_id_issued_at:
            dataSource.oauth.clientMetadata.clientIdIssuedAt ?? undefined,
          client_secret_expires_at:
            dataSource.oauth.clientMetadata.clientSecretExpiresAt ?? undefined,
        };
      }

      // Fall back to static credentials
      if (dataSource.oauth.clientId) {
        return {
          client_id: dataSource.oauth.clientId,
          client_secret: dataSource.oauth.clientSecret ?? undefined,
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
