/**
 * Utility functions for entity extraction and sanitization
 */

/**
 * Strip ALL quotes from strings to ensure consistent entity linking
 * Removes: double quotes ("), single quotes ('), backticks (`), escaped quotes (\"), smart quotes ("", '', etc.)
 * e.g., "meeting \"Sprint Retrospective\"" -> "meeting Sprint Retrospective"
 */
export function stripExtraQuotes(str: string): string {
  if (!str) return str;
  let cleaned = str.trim();

  // Remove ALL types of quotes from anywhere in the string
  // This ensures consistent entity names across documents
  cleaned = cleaned
    .replace(/\\"/g, "") // Remove escaped double quotes
    .replace(/"/g, "") // Remove double quotes
    .replace(/'/g, "") // Remove single quotes
    .replace(/`/g, "") // Remove backticks
    .replace(/"/g, "") // Remove smart double quote (opening)
    .replace(/"/g, "") // Remove smart double quote (closing)
    .replace(/'/g, "") // Remove smart single quote (opening)
    .replace(/'/g, ""); // Remove smart single quote (closing)

  return cleaned.trim(); // Trim again in case quotes were at edges
}

/**
 * Check if a string looks like a command-line command
 */
function isCommandLine(str: string): boolean {
  const commandPatterns = [
    /^(npm|pnpm|npx|yarn|node|tsx|ts-node|deno)\s/i,
    /^(git|docker|kubectl|brew|cargo|rustc)\s/i,
    /^(cd|ls|cp|mv|rm|mkdir|cat|grep|sed|awk)\s/i,
    /--[\w-]+=/, // CLI flags with values
    /^\w+\s+\w+\s+--/, // command subcommand --flag
  ];
  return commandPatterns.some((pattern) => pattern.test(str));
}

/**
 * Check if a string looks like a file path
 */
function isFilePath(str: string): boolean {
  return (
    /^[\w.-]+\/[\w.-/]+$/.test(str) || // unix path
    /^[a-z]:\\/i.test(str) || // windows path
    /\.(ts|js|tsx|jsx|py|java|go|rs|c|cpp|h|md|json|yaml|yml|xml|html|css|scss)$/i.test(
      str
    ) // has file extension
  );
}

/**
 * Extract a meaningful name from a command-line string
 */
function extractCommandName(command: string): string {
  // Try to extract script name from commands like "pnpm tsx scripts/shadowComparison/index.ts"
  const scriptMatch = command.match(/scripts?\/([^\/\s]+)/);
  if (scriptMatch) {
    const scriptName = scriptMatch[1].replace(/\.(ts|js|tsx|jsx)$/i, "");
    return scriptName;
  }

  // For simple commands like "npm install react", keep first 2-3 words
  const parts = command
    .split(" ")
    .filter((part) => !part.startsWith("--") && part.trim());
  return parts.slice(0, 3).join(" ");
}

/**
 * Extract basename from a file path
 */
function extractFileName(filePath: string): string {
  // Extract just the filename from a path
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1];
}

/**
 * Sanitize and validate an entity name for LightRAG
 * Returns null if the entity should be skipped
 */
export function sanitizeEntityName(name: string, type?: string): string | null {
  // 1. Trim whitespace
  let cleaned = name.trim();

  // 2. Remove extra quotes
  cleaned = stripExtraQuotes(cleaned);

  // 3. Reject if empty after cleaning
  if (!cleaned || cleaned.length === 0) {
    return null;
  }

  // 4. Handle command-line strings
  if (isCommandLine(cleaned)) {
    // Extract just the meaningful part
    cleaned = extractCommandName(cleaned);

    // If still too long after extraction, skip it
    if (cleaned.length > 100) {
      return null;
    }
  }

  // 5. Handle file paths
  if (isFilePath(cleaned)) {
    // Extract just the filename
    cleaned = extractFileName(cleaned);
  }

  // 6. Reject if still too long (likely garbled text)
  if (cleaned.length > 150) {
    return null;
  }

  // 7. Reject garbled text (too many spaces or special chars)
  const specialCharRatio =
    (cleaned.match(/[^a-zA-Z0-9\s-_]/g) || []).length / cleaned.length;
  if (specialCharRatio > 0.3) {
    return null; // More than 30% special characters
  }

  return cleaned;
}

/**
 * Infer entity type from relationship type
 */
export function inferEntityTypeFromRelationship(relType: string): string {
  // Map relationship types to likely entity types
  const typeMap: Record<string, string> = {
    MEMBER_OF: "Organization",
    PART_OF: "Organization",
    WORKS_ON: "Project",
    ASSIGNED_TO: "Task",
    REPORTS_TO: "Person",
    MANAGES: "Person",
    CREATED_BY: "Person",
    APPROVED_BY: "Person",
    REVIEWED_BY: "Person",
  };

  return typeMap[relType] || "Entity";
}
