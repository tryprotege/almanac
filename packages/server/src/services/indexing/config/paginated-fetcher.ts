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

  return {
    records: response.records || response.results || [response],
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
