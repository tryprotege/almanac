/**
 * SSE OAuth Discovery Service
 *
 * Handles OAuth discovery for SSE-based MCP servers.
 * Uses the MCP SDK to connect to SSE and discover OAuth requirements.
 *
 * MCP-compliant approach:
 * 1. Attempt to connect to SSE without auth
 * 2. If OAuth required, SDK throws UnauthorizedError with metadata
 * 3. Extract OAuth metadata from error
 * 4. Return metadata for OAuth flow
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import logger from '../utils/logger.js';

export interface SseOAuthDiscoveryResult {
  requiresAuth: boolean;
  oauthMetadataUrl?: string;
  oauthMetadata?: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    registrationEndpoint?: string;
    scopesSupported?: string[];
  };
  error?: string;
}

/**
 * Perform MCP-compliant OAuth discovery for SSE servers
 * Connects to SSE stream and handles UnauthorizedError
 */
export async function discoverSseOAuth(sseUrl: string): Promise<SseOAuthDiscoveryResult> {
  try {
    logger.info({ sseUrl }, 'Performing MCP SSE OAuth discovery');

    // Create temporary SSE client
    const transport = new SSEClientTransport(new URL(sseUrl));
    const client = new Client(
      { name: 'ebee-oauth-discovery', version: '0.1.0' },
      { capabilities: {} },
    );

    try {
      // Attempt connection without auth
      await client.connect(transport);

      // If we got here, no auth required
      logger.info({ sseUrl }, 'SSE endpoint does not require authentication');

      // Clean up
      await client.close();
      await transport.close();

      return {
        requiresAuth: false,
      };
    } catch (error) {
      // Clean up transport
      try {
        await transport.close();
      } catch {}

      // Debug logging to see error structure
      logger.info(
        {
          sseUrl,
          errorType: (error as any)?.type,
          errorCode: (error as any)?.code,
          errorName: (error as any)?.constructor?.name,
          isUnauthorizedError: error instanceof UnauthorizedError,
        },
        'DEBUG: Caught error during SSE connection',
      );

      // Check if it's a 401 error (OAuth required)
      const errorCode = (error as any)?.code || (error as any)?.event?.code;
      const errorType = (error as any)?.type;
      const is401Error =
        error instanceof UnauthorizedError ||
        (errorCode === 401 && errorType === 'SseError') ||
        (errorCode === 401 && (error as any)?.message?.includes('401'));

      logger.info({ sseUrl, is401Error }, 'DEBUG: 401 error check result');

      if (is401Error) {
        logger.info({ sseUrl }, 'SSE endpoint requires OAuth authentication');

        // For SseError, we need to fetch OAuth metadata via HTTP
        // The SSE connection itself doesn't give us the metadata
        const metadata = await fetchSseOAuthMetadata(sseUrl);

        if (!metadata) {
          return {
            requiresAuth: true,
            error: 'Failed to discover OAuth metadata from SSE endpoint',
          };
        }

        logger.info({ sseUrl, metadata }, 'Successfully discovered SSE OAuth metadata');

        return {
          requiresAuth: true,
          oauthMetadata: metadata,
        };
      }

      // Other errors - connection failed
      logger.error({ err: error, sseUrl }, 'Error connecting to SSE endpoint');
      return {
        requiresAuth: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (err) {
    logger.error({ err, sseUrl }, 'Error during SSE OAuth discovery');
    return {
      requiresAuth: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fetch OAuth metadata from SSE endpoint via HTTP
 * Supports RFC 8707 (OAuth 2.0 Protected Resource Metadata)
 * 3-step discovery chain:
 * 1. HEAD request → WWW-Authenticate → resource_metadata URL
 * 2. Fetch protected resource metadata → authorization_servers
 * 3. Fetch auth server metadata → authorization_endpoint, token_endpoint
 */
async function fetchSseOAuthMetadata(sseUrl: string): Promise<{
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  scopesSupported?: string[];
} | null> {
  try {
    logger.info({ sseUrl }, 'Starting RFC 8707 OAuth discovery');

    // Step 1: Make HEAD request to get WWW-Authenticate header
    const response = await fetch(sseUrl, {
      method: 'HEAD',
      redirect: 'manual',
    });

    if (response.status !== 401) {
      logger.warn({ sseUrl, status: response.status }, 'Expected 401 but got different status');
      return null;
    }

    const wwwAuth = response.headers.get('www-authenticate');
    if (!wwwAuth) {
      logger.warn({ sseUrl }, '401 response but no WWW-Authenticate header');
      return null;
    }

    logger.info({ sseUrl, wwwAuth }, 'WWW-Authenticate header received');

    // Parse WWW-Authenticate header to extract metadata URL
    let metadataUrl = parseWwwAuthenticate(wwwAuth);

    // If no metadata URL in header, try standard well-known endpoints
    if (!metadataUrl) {
      logger.info(
        { sseUrl },
        'No metadata URL in WWW-Authenticate, trying standard discovery endpoints',
      );
      metadataUrl = await tryStandardDiscovery(sseUrl);

      if (!metadataUrl) {
        logger.warn({ sseUrl, wwwAuth }, 'Could not discover OAuth metadata via any method');
        return null;
      }
    }

    // Check if this is a resource_metadata URL (RFC 8707)
    const isResourceMetadata = metadataUrl.includes('oauth-protected-resource');

    if (isResourceMetadata) {
      // Step 2: Fetch protected resource metadata
      logger.info({ metadataUrl }, 'Fetching protected resource metadata');
      const resourceResponse = await fetch(metadataUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!resourceResponse.ok) {
        logger.warn(
          { metadataUrl, status: resourceResponse.status },
          'Failed to fetch resource metadata',
        );
        return null;
      }

      const resourceMetadata = (await resourceResponse.json()) as Record<string, unknown>;
      logger.info({ resourceMetadata }, 'Resource metadata received');

      // Extract authorization server URL
      const authServers = resourceMetadata.authorization_servers;
      if (!Array.isArray(authServers) || authServers.length === 0) {
        logger.warn({ resourceMetadata }, 'No authorization servers in resource metadata');
        return null;
      }

      const authServerUrl = authServers[0] as string;
      logger.info({ authServerUrl }, 'Using authorization server');

      // Step 3: Fetch authorization server metadata
      const authServerMetadataUrl = `${authServerUrl}/.well-known/oauth-authorization-server`;
      logger.info({ authServerMetadataUrl }, 'Fetching auth server metadata');

      const authServerResponse = await fetch(authServerMetadataUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!authServerResponse.ok) {
        logger.warn(
          { authServerMetadataUrl, status: authServerResponse.status },
          'Failed to fetch auth server metadata',
        );
        return null;
      }

      const authServerMetadata = (await authServerResponse.json()) as Record<string, unknown>;
      logger.info({ authServerMetadata }, 'Auth server metadata received');

      // Validate and return
      if (
        !authServerMetadata.authorization_endpoint ||
        typeof authServerMetadata.authorization_endpoint !== 'string' ||
        !authServerMetadata.token_endpoint ||
        typeof authServerMetadata.token_endpoint !== 'string'
      ) {
        logger.warn({ authServerMetadata }, 'Auth server metadata missing required endpoints');
        return null;
      }

      return {
        authorizationEndpoint: authServerMetadata.authorization_endpoint,
        tokenEndpoint: authServerMetadata.token_endpoint,
        registrationEndpoint:
          typeof authServerMetadata.registration_endpoint === 'string'
            ? authServerMetadata.registration_endpoint
            : undefined,
        scopesSupported: Array.isArray(resourceMetadata.scopes_supported)
          ? (resourceMetadata.scopes_supported as string[])
          : undefined,
      };
    } else {
      // Traditional OAuth discovery (direct metadata URL)
      logger.info({ metadataUrl }, 'Fetching OAuth metadata (traditional)');
      const metadataResponse = await fetch(metadataUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!metadataResponse.ok) {
        logger.warn(
          { metadataUrl, status: metadataResponse.status },
          'Failed to fetch OAuth metadata',
        );
        return null;
      }

      const metadata = (await metadataResponse.json()) as Record<string, unknown>;

      // Validate required fields
      if (
        !metadata.authorization_endpoint ||
        typeof metadata.authorization_endpoint !== 'string' ||
        !metadata.token_endpoint ||
        typeof metadata.token_endpoint !== 'string'
      ) {
        logger.warn({ metadataUrl, metadata }, 'OAuth metadata missing required endpoints');
        return null;
      }

      return {
        authorizationEndpoint: metadata.authorization_endpoint,
        tokenEndpoint: metadata.token_endpoint,
        registrationEndpoint:
          typeof metadata.registration_endpoint === 'string'
            ? metadata.registration_endpoint
            : undefined,
        scopesSupported: Array.isArray(metadata.scopes_supported)
          ? (metadata.scopes_supported as string[])
          : undefined,
      };
    }
  } catch (err) {
    logger.error({ err, sseUrl }, 'Error fetching OAuth metadata');
    return null;
  }
}

/**
 * Try standard OAuth discovery endpoints
 * Attempts RFC 8414 and OIDC discovery on the base URL
 */
async function tryStandardDiscovery(endpointUrl: string): Promise<string | null> {
  try {
    // Extract base URL (remove path, keep protocol and domain)
    const url = new URL(endpointUrl);
    const baseUrl = `${url.protocol}//${url.host}`;

    logger.info({ endpointUrl, baseUrl }, 'Trying standard OAuth discovery');

    // Try RFC 8414: OAuth 2.0 Authorization Server Metadata
    const rfc8414Url = `${baseUrl}/.well-known/oauth-authorization-server`;
    logger.info({ rfc8414Url }, 'Trying RFC 8414 discovery');

    try {
      const response = await fetch(rfc8414Url, {
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const metadata = (await response.json()) as Record<string, unknown>;
        if (metadata.authorization_endpoint && metadata.token_endpoint) {
          logger.info(
            { rfc8414Url, metadata },
            'Successfully discovered OAuth metadata via RFC 8414',
          );
          return rfc8414Url;
        }
      }
    } catch (err) {
      logger.debug({ err, rfc8414Url }, 'RFC 8414 discovery failed');
    }

    // Try OIDC: OpenID Connect Discovery
    const oidcUrl = `${baseUrl}/.well-known/openid-configuration`;
    logger.info({ oidcUrl }, 'Trying OIDC discovery');

    try {
      const response = await fetch(oidcUrl, {
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const metadata = (await response.json()) as Record<string, unknown>;
        if (metadata.authorization_endpoint && metadata.token_endpoint) {
          logger.info({ oidcUrl, metadata }, 'Successfully discovered OAuth metadata via OIDC');
          return oidcUrl;
        }
      }
    } catch (err) {
      logger.debug({ err, oidcUrl }, 'OIDC discovery failed');
    }

    logger.warn({ endpointUrl, baseUrl }, 'All standard discovery methods failed');
    return null;
  } catch (err) {
    logger.error({ err, endpointUrl }, 'Error during standard discovery');
    return null;
  }
}

/**
 * Parse WWW-Authenticate header to extract OAuth metadata URL
 * Supports RFC 8707 (resource_metadata) and traditional realm
 * Example: Bearer realm="OAuth", resource_metadata="https://..."
 */
function parseWwwAuthenticate(header: string): string | null {
  try {
    // Look for Bearer challenge
    if (!header.toLowerCase().includes('bearer')) {
      return null;
    }

    // RFC 8707: Extract resource_metadata URL first (preferred)
    const resourceMetadataMatch = header.match(/resource_metadata="([^"]+)"/);
    if (resourceMetadataMatch && resourceMetadataMatch[1]) {
      logger.info({ url: resourceMetadataMatch[1] }, 'Found resource_metadata URL');
      return resourceMetadataMatch[1];
    }

    // Fallback: Extract realm (only if it's a URL)
    const realmMatch = header.match(/realm="([^"]+)"/);
    if (realmMatch && realmMatch[1] && realmMatch[1].startsWith('http')) {
      logger.info({ url: realmMatch[1] }, 'Found realm URL');
      return realmMatch[1];
    }

    // Last resort: Try to extract any URL from the header
    const urlMatch = header.match(/(https?:\/\/[^\s"]+)/);
    if (urlMatch && urlMatch[1]) {
      logger.info({ url: urlMatch[1] }, 'Found URL in header');
      return urlMatch[1];
    }

    return null;
  } catch (err) {
    logger.error({ err, header }, 'Error parsing WWW-Authenticate header');
    return null;
  }
}
