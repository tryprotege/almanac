import type { FetcherConfig } from "@ebee-oss/indexing-engine";
import { mcpClientManager } from "../../../mcp/client.js";

export interface PageResult {
  records: any[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Fetch all records with pagination
 */
export async function* fetchAll(
  serverName: string,
  config: FetcherConfig,
  initialParams: Record<string, any> = {}
): AsyncGenerator<any[]> {
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params = { ...config.params, ...initialParams };

    // Add pagination parameters
    if (config.pagination) {
      addPaginationParams(params, cursor, config.pagination);
    }

    // Fetch page
    const result = await fetchPage(serverName, config.tool, params);

    if (result.records.length > 0) {
      yield result.records;
    }

    // Update cursor and hasMore
    cursor = result.nextCursor;
    hasMore = result.hasMore;

    // If no pagination config, break after first page
    if (!config.pagination || config.pagination.type === "none") {
      break;
    }
  }
}

/**
 * Extract records from MCP response format
 * MCP responses come in format: {content: [{type: "text", text: "...JSON..."}]}
 * OR direct data arrays: {content: [{id: "...", ...}]}
 */
function extractRecordsFromMCPResponse(response: any): any[] {
  // If response has content array (MCP format), extract the text and parse it
  if (response?.content && Array.isArray(response.content)) {
    const textContent = response.content.find((c: any) => c.type === "text");

    if (textContent?.text) {
      const text = textContent.text.trim();

      // Check if it's an error message (not JSON)
      if (
        text.startsWith("Entity not") ||
        text.startsWith("Error") ||
        text.startsWith("Failed") ||
        (!text.startsWith("[") && !text.startsWith("{"))
      ) {
        console.warn(
          "MCP response contains error message:",
          text.substring(0, 100)
        );
        return []; // Return empty for errors
      }

      try {
        const parsed = JSON.parse(text);

        // Could be an array or an object
        if (Array.isArray(parsed)) {
          return parsed;
        }

        // Check for common nested array patterns
        if (parsed.results && Array.isArray(parsed.results)) {
          return parsed.results;
        }
        if (parsed.records && Array.isArray(parsed.records)) {
          return parsed.records;
        }
        if (parsed.data) {
          return Array.isArray(parsed.data) ? parsed.data : [parsed.data];
        }

        // Single object - return as array
        return [parsed];
      } catch (err) {
        // If parsing fails, return empty array
        console.warn("Failed to parse MCP response text as JSON:", err);
        return [];
      }
    }

    // NEW: Handle direct content arrays (not text wrappers)
    // If content[0] has an 'id' field, it's likely a direct data array
    if (response.content.length > 0 && response.content[0]?.id) {
      return response.content;
    }
  }

  // Fallback to existing logic for non-MCP responses
  if (response.records && Array.isArray(response.records)) {
    return response.records;
  }
  if (response.results && Array.isArray(response.results)) {
    return response.results;
  }

  // Single response object
  return [response];
}

/**
 * Fetch a single page
 */
async function fetchPage(
  serverName: string,
  toolName: string,
  params: Record<string, any>
): Promise<PageResult> {
  const response = await mcpClientManager.callTool(
    serverName,
    toolName,
    params
  );

  // Extract records from MCP response format
  const records = extractRecordsFromMCPResponse(response);

  // Validate that we have actual records
  if (!Array.isArray(records)) {
    console.warn(
      "fetchPage: extracted records is not an array",
      typeof records
    );
    return {
      records: [],
      nextCursor: undefined,
      hasMore: false,
    };
  }

  return {
    records,
    nextCursor: response.next_cursor || response.nextCursor,
    hasMore: response.has_more ?? response.hasMore ?? false,
  };
}

/**
 * Add pagination parameters to request
 */
function addPaginationParams(
  params: Record<string, any>,
  cursor: string | undefined,
  config: FetcherConfig["pagination"]
): void {
  if (!config) return;

  switch (config.type) {
    case "cursor":
      if (config.limitParam) {
        params[config.limitParam] = 100; // Default page size
      }
      if (cursor && config.cursorParam) {
        params[config.cursorParam] = cursor;
      }
      break;

    case "offset":
      if (config.limitParam) {
        params[config.limitParam] = 100;
      }
      if (config.offsetParam) {
        const currentOffset = params[config.offsetParam] || 0;
        params[config.offsetParam] = currentOffset + 100;
      }
      break;

    case "none":
    default:
      break;
  }
}
