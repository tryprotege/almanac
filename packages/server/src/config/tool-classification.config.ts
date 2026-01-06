/**
 * Tool classification configuration
 * Controls how MCP tools are classified and used for indexing
 */

/**
 * Tool classification settings
 */
export const TOOL_CLASSIFICATION_CONFIG = {
  /**
   * Skip write tools during indexing
   * ALWAYS true for safety - write operations should never be used for indexing
   */
  SKIP_WRITE_TOOLS: true,

  /**
   * Skip search tools during indexing
   * Default: true
   * Search tools typically require specific query parameters and cannot enumerate all results
   */
  SKIP_SEARCH_TOOLS: process.env.SKIP_SEARCH_TOOLS !== "false",

  /**
   * Enable verbose logging for tool classification
   * Default: false
   */
  VERBOSE_LOGGING: process.env.TOOL_CLASSIFICATION_VERBOSE === "true",
} as const;

/**
 * Get configuration value
 */
export function getToolClassificationConfig() {
  return TOOL_CLASSIFICATION_CONFIG;
}
