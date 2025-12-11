import type { MockData } from "../types.js";

/**
 * Get all databases
 */
export function getDatabases(data: MockData): any[] {
  return data.notion?.databases || [];
}

/**
 * Get all pages
 */
export function getPages(
  data: MockData,
  options?: {
    database_id?: string;
    limit?: number;
  }
): any[] {
  if (!data.notion) return [];

  let pages = data.notion.pages;

  // Filter by database
  if (options?.database_id) {
    pages = pages.filter((p) => p.parent?.database_id === options.database_id);
  }

  // Apply limit
  if (options?.limit && options.limit > 0) {
    pages = pages.slice(0, options.limit);
  }

  return pages;
}

/**
 * Get page by ID
 */
export function getPageById(data: MockData, pageId: string): any | undefined {
  return data.notion?.pages.find((p) => p.id === pageId);
}

/**
 * Search pages by title
 */
export function searchPages(
  data: MockData,
  query: string,
  options?: {
    limit?: number;
  }
): any[] {
  if (!data.notion) return [];

  const queryLower = query.toLowerCase();

  let pages = data.notion.pages.filter((p) => {
    const title =
      p.properties?.title?.title?.[0]?.plain_text?.toLowerCase() || "";
    return title.includes(queryLower);
  });

  // Apply limit
  if (options?.limit && options.limit > 0) {
    pages = pages.slice(0, options.limit);
  }

  return pages;
}

/**
 * Get all users
 */
export function getUsers(data: MockData): any[] {
  return data.notion?.users || [];
}

/**
 * Get blocks for a page
 */
export function getBlocks(data: MockData, pageId: string): any[] {
  if (!data.notion) return [];

  return data.notion.blocks.filter((b) => b.parent?.page_id === pageId);
}
