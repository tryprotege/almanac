/**
 * Centralized random ID generation utilities to prevent duplicates
 */

const generatedIds = new Set<string>();

/**
 * Generate a random numeric ID within a range
 */
export function generateRandomId(min: number = 1000, max: number = 999999): number {
  let id: number;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    id = Math.floor(Math.random() * (max - min + 1)) + min;
    attempts++;

    if (attempts > maxAttempts) {
      // If we can't find a unique ID, expand the range
      max = max * 10;
      attempts = 0;
    }
  } while (generatedIds.has(`num-${id}`));

  generatedIds.add(`num-${id}`);
  return id;
}

/**
 * Generate a random string ID with prefix
 */
export function generateRandomStringId(prefix: string, length: number = 8): string {
  let id: string;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    const randomPart = Math.random()
      .toString(36)
      .substring(2, 2 + length)
      .padEnd(length, '0');
    id = `${prefix}_${randomPart}`;
    attempts++;

    if (attempts > maxAttempts) {
      // Add timestamp to ensure uniqueness
      id = `${prefix}_${randomPart}_${Date.now()}`;
      break;
    }
  } while (generatedIds.has(id));

  generatedIds.add(id);
  return id;
}

/**
 * Generate a random hexadecimal hash
 */
export function generateRandomHash(length: number = 40): string {
  const chars = '0123456789abcdef';
  let hash = '';

  for (let i = 0; i < length; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }

  return hash;
}

/**
 * Generate a random node ID (GitHub-style)
 */
export function generateRandomNodeId(prefix: string = 'MDU6'): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  const encoded = Buffer.from(randomPart).toString('base64').replace(/=/g, '');
  return `${prefix}${encoded}`;
}

/**
 * Generate a unique recording ID for Fathom
 */
export function generateFathomRecordingId(): number {
  return generateRandomId(100000, 999999);
}

/**
 * Generate a unique Slack timestamp
 */
export function generateSlackTimestamp(date: Date): string {
  const baseTimestamp = date.getTime() / 1000;
  // Add microseconds for uniqueness
  const microseconds = Math.floor(Math.random() * 1000000);
  return `${baseTimestamp.toFixed(0)}.${String(microseconds).padStart(6, '0')}`;
}

/**
 * Reset the ID tracker (useful for testing)
 */
export function resetIdTracker(): void {
  generatedIds.clear();
}

/**
 * Get count of generated IDs (for debugging)
 */
export function getGeneratedIdCount(): number {
  return generatedIds.size;
}
