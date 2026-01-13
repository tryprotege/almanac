import crypto from 'crypto';

/**
 * PKCE (Proof Key for Code Exchange) pair
 * Required for OAuth 2.1 authorization code flow
 */
export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generate a PKCE code verifier and challenge pair
 * @returns PKCEPair with code_verifier and code_challenge
 */
export function generatePKCE(): PKCEPair {
  // Generate code_verifier: random 128-character string
  // Must be 43-128 characters, use cryptographically random bytes
  const codeVerifier = crypto
    .randomBytes(64) // 64 bytes = 128 hex characters
    .toString('hex');

  // Generate code_challenge: Base64-URL-encoded SHA256 hash of code_verifier
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url'); // base64url encoding (URL-safe)

  return {
    codeVerifier,
    codeChallenge,
  };
}

/**
 * Validate PKCE code_verifier against code_challenge
 * @param codeVerifier - The code verifier from token exchange
 * @param codeChallenge - The code challenge from authorization request
 * @returns true if valid, false otherwise
 */
export function validatePKCE(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) {
    return false;
  }

  // Verify length (must be 43-128 characters)
  if (codeVerifier.length < 43 || codeVerifier.length > 128) {
    return false;
  }

  // Regenerate code_challenge from code_verifier
  const computedChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  // Compare with provided code_challenge
  return computedChallenge === codeChallenge;
}

/**
 * Generate a random state parameter for OAuth flow
 * Used to prevent CSRF attacks
 * @returns Random 32-character hex string
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Validate state parameter
 * @param state - The state to validate
 * @returns true if state is valid format
 */
export function isValidState(state: string): boolean {
  return typeof state === 'string' && state.length >= 16;
}
