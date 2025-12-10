import crypto from "crypto";

/**
 * Interface for encrypted data structure
 */
export interface EncryptedData {
  encrypted: string; // Base64 encoded ciphertext
  iv: string; // Base64 encoded initialization vector (12 bytes for GCM)
  authTag: string; // Base64 encoded authentication tag (16 bytes)
}

/**
 * Encrypt a single string value using AES-256-GCM
 * @param plaintext - The plaintext string to encrypt
 * @param key - 32-byte encryption key (Buffer)
 * @returns Encrypted string in format: enc:{"encrypted":"...","iv":"...","authTag":"..."}
 */
export function encrypt(plaintext: string, key: Buffer): string {
  if (!plaintext) {
    throw new Error("Plaintext cannot be empty");
  }

  if (!key || key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits)");
  }

  try {
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(12);

    // Create cipher
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    // Get auth tag
    const authTag = cipher.getAuthTag().toString("base64");

    // Return formatted string
    const encryptedData: EncryptedData = {
      encrypted,
      iv: iv.toString("base64"),
      authTag,
    };

    return `enc:${JSON.stringify(encryptedData)}`;
  } catch (err) {
    throw new Error(
      `Encryption failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Decrypt an encrypted value using AES-256-GCM
 * @param encryptedValue - Encrypted string starting with "enc:"
 * @param key - 32-byte encryption key (Buffer)
 * @returns Decrypted plaintext string
 */
export function decrypt(encryptedValue: string, key: Buffer): string {
  if (!encryptedValue) {
    throw new Error("Encrypted value cannot be empty");
  }

  if (!key || key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits)");
  }

  // Check if encrypted
  if (!encryptedValue.startsWith("enc:")) {
    throw new Error('Value is not encrypted (must start with "enc:")');
  }

  try {
    // Parse encrypted data
    const jsonStr = encryptedValue.substring(4);
    const encryptedData: EncryptedData = JSON.parse(jsonStr);

    // Validate structure
    if (
      !encryptedData.encrypted ||
      !encryptedData.iv ||
      !encryptedData.authTag
    ) {
      throw new Error("Invalid encrypted data structure");
    }

    // Convert from base64
    const iv = Buffer.from(encryptedData.iv, "base64");
    const authTag = Buffer.from(encryptedData.authTag, "base64");
    const encrypted = encryptedData.encrypted;

    // Create decipher
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    throw new Error(
      `Decryption failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Check if a value is encrypted
 * @param value - String value to check
 * @returns true if value starts with "enc:", false otherwise
 */
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith("enc:");
}

/**
 * Encrypt all values in a Map or Record, keeping keys plaintext
 * @param map - Map or Record with string key-value pairs
 * @param key - 32-byte encryption key (Buffer)
 * @returns New Map with encrypted values
 */
export function encryptMapValues(
  map: Map<string, string> | Record<string, string> | null | undefined,
  key: Buffer
): Map<string, string> {
  if (!map) return new Map();

  if (!key || key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits)");
  }

  const result = new Map<string, string>();
  const entries = map instanceof Map ? map.entries() : Object.entries(map);

  for (const [k, v] of entries) {
    // Skip if already encrypted
    if (isEncrypted(v)) {
      result.set(k, v);
    } else {
      try {
        result.set(k, encrypt(v, key));
      } catch (err) {
        // Log error but continue processing other values
        console.error(
          `Failed to encrypt value for key "${k}":`,
          err instanceof Error ? err.message : String(err)
        );
        // Keep original value if encryption fails
        result.set(k, v);
      }
    }
  }

  return result;
}

/**
 * Decrypt all encrypted values in a Map or Record
 * @param map - Map or Record with string key-value pairs
 * @param key - 32-byte encryption key (Buffer)
 * @returns New Map with decrypted values
 */
export function decryptMapValues(
  map: Map<string, string> | Record<string, string> | null | undefined,
  key: Buffer
): Map<string, string> {
  if (!map) return new Map();

  if (!key || key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits)");
  }

  const result = new Map<string, string>();
  const entries = map instanceof Map ? map.entries() : Object.entries(map);

  for (const [k, v] of entries) {
    // Decrypt if encrypted, otherwise keep as-is
    if (isEncrypted(v)) {
      try {
        result.set(k, decrypt(v, key));
      } catch (err) {
        // Log error but keep encrypted value to prevent data loss
        console.error(
          `Failed to decrypt value for key "${k}":`,
          err instanceof Error ? err.message : String(err)
        );
        result.set(k, v);
      }
    } else {
      result.set(k, v);
    }
  }

  return result;
}

/**
 * Generate a new 256-bit encryption key
 * @returns 64-character hex string (32 bytes)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Convert hex string to Buffer for use as encryption key
 * @param keyHex - 64-character hex string
 * @returns 32-byte Buffer
 */
export function hexToBuffer(keyHex: string): Buffer {
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("Encryption key must be 64 hex characters (32 bytes)");
  }

  if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error("Encryption key must be valid hexadecimal");
  }

  return Buffer.from(keyHex, "hex");
}

/**
 * Validate encryption key format
 * @param keyHex - Hex string to validate
 * @returns true if valid, false otherwise
 */
export function isValidEncryptionKey(keyHex: string): boolean {
  return (
    typeof keyHex === "string" &&
    keyHex.length === 64 &&
    /^[0-9a-f]{64}$/i.test(keyHex)
  );
}
