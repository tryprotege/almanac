/**
 * Utility functions for escaping Cypher identifiers (relationship types, labels, property names)
 * to handle special characters that would otherwise break query syntax.
 */

/**
 * Characters that require escaping in Cypher identifiers
 * Includes: spaces, special characters, operators, brackets, etc.
 */
const SPECIAL_CHARS_REGEX = /[^a-zA-Z0-9_]/;

/**
 * Check if a Cypher identifier needs escaping
 * Identifiers need escaping if they contain:
 * - Special characters (anything not alphanumeric or underscore)
 * - Start with a number
 * - Are Cypher reserved keywords
 */
export function needsEscaping(identifier: string): boolean {
  if (!identifier || identifier.length === 0) {
    return true;
  }

  // Check for special characters
  if (SPECIAL_CHARS_REGEX.test(identifier)) {
    return true;
  }

  // Check if starts with a number
  if (/^[0-9]/.test(identifier)) {
    return true;
  }

  // Check if it's a Cypher reserved keyword (case-insensitive)
  const reservedKeywords = [
    "MATCH",
    "WHERE",
    "RETURN",
    "CREATE",
    "DELETE",
    "SET",
    "REMOVE",
    "MERGE",
    "WITH",
    "UNWIND",
    "CASE",
    "WHEN",
    "THEN",
    "ELSE",
    "END",
    "AND",
    "OR",
    "XOR",
    "NOT",
    "IN",
    "STARTS",
    "ENDS",
    "CONTAINS",
    "IS",
    "NULL",
    "TRUE",
    "FALSE",
    "DISTINCT",
    "AS",
    "ORDER",
    "BY",
    "SKIP",
    "LIMIT",
    "ASC",
    "DESC",
    "ON",
    "INDEX",
    "DROP",
    "CONSTRAINT",
    "ASSERT",
    "UNIQUE",
    "EXISTS",
    "CALL",
    "YIELD",
  ];

  return reservedKeywords.includes(identifier.toUpperCase());
}

/**
 * Escape a Cypher identifier using backticks
 * Handles edge cases:
 * - Empty strings
 * - Identifiers containing backticks (doubled)
 * - Already escaped identifiers
 *
 * @param identifier The identifier to escape
 * @returns The escaped identifier with backticks if needed
 */
export function escapeIdentifier(identifier: string): string {
  if (!identifier || identifier.length === 0) {
    throw new Error("Cannot escape empty identifier");
  }

  // If already escaped (starts and ends with backtick), return as-is
  if (identifier.startsWith("`") && identifier.endsWith("`")) {
    return identifier;
  }

  // Check if escaping is needed
  if (!needsEscaping(identifier)) {
    return identifier;
  }

  // Escape any existing backticks by doubling them
  const escapedBackticks = identifier.replace(/`/g, "``");

  // Wrap in backticks
  return `\`${escapedBackticks}\``;
}

/**
 * Escape a relationship type for use in Cypher queries
 * This is the primary function to use when building relationship patterns
 *
 * @param relationshipType The relationship type (e.g., "RELATED_TO", "HAS<PROPERTY")
 * @returns The properly escaped relationship type
 */
export function escapeRelationshipType(relationshipType: string): string {
  return escapeIdentifier(relationshipType);
}

/**
 * Escape a node label for use in Cypher queries
 *
 * @param label The node label (e.g., "Entity", "My Label")
 * @returns The properly escaped label
 */
export function escapeLabel(label: string): string {
  return escapeIdentifier(label);
}

/**
 * Remove escape characters from an identifier
 * Use when reading identifiers from query results
 *
 * @param escapedIdentifier The escaped identifier
 * @returns The unescaped identifier
 */
export function unescapeIdentifier(escapedIdentifier: string): string {
  if (!escapedIdentifier) {
    return escapedIdentifier;
  }

  // Remove surrounding backticks
  let unescaped = escapedIdentifier;
  if (unescaped.startsWith("`") && unescaped.endsWith("`")) {
    unescaped = unescaped.slice(1, -1);
  }

  // Unescape doubled backticks
  unescaped = unescaped.replace(/``/g, "`");

  return unescaped;
}

/**
 * Validate a relationship type and provide helpful error messages
 * Use this for validation/warning purposes in the indexing pipeline
 *
 * @param relationshipType The relationship type to validate
 * @returns Validation result with warnings
 */
export function validateRelationshipType(relationshipType: string): {
  isValid: boolean;
  needsEscaping: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!relationshipType || relationshipType.length === 0) {
    return {
      isValid: false,
      needsEscaping: false,
      warnings: ["Relationship type cannot be empty"],
    };
  }

  if (relationshipType.length > 100) {
    warnings.push(
      `Relationship type is very long (${relationshipType.length} chars). Consider shortening it.`
    );
  }

  const needsEsc = needsEscaping(relationshipType);

  if (needsEsc) {
    if (SPECIAL_CHARS_REGEX.test(relationshipType)) {
      const specialChars = relationshipType.match(/[^a-zA-Z0-9_]/g) || [];
      const uniqueChars = [...new Set(specialChars)];
      warnings.push(
        `Contains special characters: ${uniqueChars.join(
          ", "
        )}. Will be escaped with backticks.`
      );
    }

    if (/^[0-9]/.test(relationshipType)) {
      warnings.push("Starts with a number. Will be escaped with backticks.");
    }

    if (relationshipType.includes("`")) {
      warnings.push(
        "Contains backtick characters. These will be doubled when escaped."
      );
    }
  }

  return {
    isValid: true,
    needsEscaping: needsEsc,
    warnings,
  };
}
