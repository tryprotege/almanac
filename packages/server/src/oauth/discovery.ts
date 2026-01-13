import logger from '../utils/logger.js';

/**
 * OAuth 2.0 Authorization Server Metadata
 * Based on RFC 8414 and OpenID Connect Discovery
 */
export interface OAuthMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopesSupported?: string[];
  responseTypesSupported?: string[];
  grantTypesSupported?: string[];
  revocationEndpoint?: string;
  tokenEndpointAuthMethodsSupported?: string[];
  codeChallengeMethodsSupported?: string[];
}

/**
 * Raw metadata response from discovery endpoints
 */
interface RawOAuthMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  revocation_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
}

/**
 * Discovery result
 */
export interface DiscoveryResult {
  success: boolean;
  metadata?: OAuthMetadata;
  source?: 'rfc8414' | 'oidc';
  error?: string;
}

/**
 * In-memory cache for discovered metadata
 * TTL: 5 minutes
 */
const metadataCache = new Map<string, { metadata: OAuthMetadata; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize issuer URL to ensure consistent format
 */
function normalizeIssuerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash
    let normalized = parsed.origin + parsed.pathname;
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    throw new Error('Invalid issuer URL');
  }
}

/**
 * Fetch metadata from a discovery endpoint
 */
async function fetchMetadata(url: string): Promise<RawOAuthMetadata | null> {
  try {
    logger.debug({ url }, 'Fetching OAuth metadata');
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      logger.debug({ url, status: response.status }, 'Discovery endpoint returned error');
      return null;
    }

    const data = await response.json();
    return data as RawOAuthMetadata;
  } catch (err) {
    logger.debug({ err, url }, 'Failed to fetch metadata from endpoint');
    return null;
  }
}

/**
 * Fetch metadata using RFC 8414 OAuth Authorization Server Metadata
 */
async function fetchRFC8414Metadata(issuerUrl: string): Promise<OAuthMetadata | null> {
  const wellKnownUrl = `${issuerUrl}/.well-known/oauth-authorization-server`;
  const rawMetadata = await fetchMetadata(wellKnownUrl);

  if (!rawMetadata) {
    return null;
  }

  return normalizeMetadata(rawMetadata);
}

/**
 * Fetch metadata using OpenID Connect Discovery
 */
async function fetchOIDCMetadata(issuerUrl: string): Promise<OAuthMetadata | null> {
  const wellKnownUrl = `${issuerUrl}/.well-known/openid-configuration`;
  const rawMetadata = await fetchMetadata(wellKnownUrl);

  if (!rawMetadata) {
    return null;
  }

  return normalizeMetadata(rawMetadata);
}

/**
 * Normalize raw metadata to OAuthMetadata format
 */
function normalizeMetadata(raw: RawOAuthMetadata): OAuthMetadata {
  if (!raw.authorization_endpoint || !raw.token_endpoint) {
    throw new Error('Invalid metadata: missing authorization_endpoint or token_endpoint');
  }

  return {
    issuer: raw.issuer || '',
    authorizationEndpoint: raw.authorization_endpoint,
    tokenEndpoint: raw.token_endpoint,
    scopesSupported: raw.scopes_supported,
    responseTypesSupported: raw.response_types_supported,
    grantTypesSupported: raw.grant_types_supported,
    revocationEndpoint: raw.revocation_endpoint,
    tokenEndpointAuthMethodsSupported: raw.token_endpoint_auth_methods_supported,
    codeChallengeMethodsSupported: raw.code_challenge_methods_supported,
  };
}

/**
 * Validate that metadata has required fields
 */
function validateMetadata(metadata: OAuthMetadata): void {
  if (!metadata.authorizationEndpoint) {
    throw new Error('Missing authorization_endpoint in metadata');
  }
  if (!metadata.tokenEndpoint) {
    throw new Error('Missing token_endpoint in metadata');
  }

  // Validate URLs
  try {
    new URL(metadata.authorizationEndpoint);
    new URL(metadata.tokenEndpoint);
  } catch {
    throw new Error('Invalid endpoint URLs in metadata');
  }
}

/**
 * Get cached metadata if available and not expired
 */
function getCachedMetadata(issuerUrl: string): OAuthMetadata | null {
  const cached = metadataCache.get(issuerUrl);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL_MS) {
    // Cache expired
    metadataCache.delete(issuerUrl);
    return null;
  }

  logger.debug({ issuerUrl }, 'Using cached OAuth metadata');
  return cached.metadata;
}

/**
 * Cache metadata
 */
function cacheMetadata(issuerUrl: string, metadata: OAuthMetadata): void {
  metadataCache.set(issuerUrl, {
    metadata,
    timestamp: Date.now(),
  });
}

/**
 * Discover OAuth metadata from issuer URL
 * Tries RFC 8414 first, then falls back to OIDC Discovery
 */
export async function discoverOAuthMetadata(issuerUrl: string): Promise<DiscoveryResult> {
  try {
    // Normalize issuer URL
    const normalized = normalizeIssuerUrl(issuerUrl);

    // Check cache first
    const cached = getCachedMetadata(normalized);
    if (cached) {
      return {
        success: true,
        metadata: cached,
        source: 'rfc8414', // We don't track source in cache, default to rfc8414
      };
    }

    logger.info({ issuerUrl: normalized }, 'Starting OAuth metadata discovery');

    // Try RFC 8414 first
    let metadata = await fetchRFC8414Metadata(normalized);
    if (metadata) {
      validateMetadata(metadata);
      cacheMetadata(normalized, metadata);
      logger.info(
        { issuerUrl: normalized, source: 'rfc8414' },
        'Successfully discovered OAuth metadata',
      );
      return {
        success: true,
        metadata,
        source: 'rfc8414',
      };
    }

    // Fall back to OIDC Discovery
    metadata = await fetchOIDCMetadata(normalized);
    if (metadata) {
      validateMetadata(metadata);
      cacheMetadata(normalized, metadata);
      logger.info(
        { issuerUrl: normalized, source: 'oidc' },
        'Successfully discovered OAuth metadata',
      );
      return {
        success: true,
        metadata,
        source: 'oidc',
      };
    }

    // Both discovery methods failed
    logger.warn(
      { issuerUrl: normalized },
      'OAuth metadata discovery failed - no discovery endpoints found',
    );
    return {
      success: false,
      error:
        'Discovery failed: No OAuth metadata found at /.well-known/oauth-authorization-server or /.well-known/openid-configuration',
    };
  } catch (err) {
    logger.error({ err, issuerUrl }, 'OAuth metadata discovery error');
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during OAuth discovery',
    };
  }
}

/**
 * Clear discovery cache (useful for testing)
 */
export function clearDiscoveryCache(): void {
  metadataCache.clear();
  logger.debug('OAuth discovery cache cleared');
}
