import { mcpClientManager } from "../../../mcp/client.js";
import {
  NotionUser,
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionComment,
} from "./types.js";
import logger from "../../../utils/logger.js";
import { env } from "../../../env.js";

/**
 * Notion MCP Client wrapper for data extraction
 */
export class NotionMCPClient {
  private serverName = "notion";
  private rateLimitDelay = 350; // 350ms = ~3 requests per second

  constructor() {}

  /**
   * Sleep utility for rate limiting
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Call MCP tool with rate limiting and parse response
   */
  private async callTool<T>(
    toolName: string,
    args: Record<string, any>
  ): Promise<T> {
    await this.sleep(this.rateLimitDelay);
    const response = await mcpClientManager.callTool(
      this.serverName,
      toolName,
      args
    );

    // MCP response format: { content: [{ type: 'text', text: '...' }] }
    if (response && response.content && Array.isArray(response.content)) {
      const textContent = response.content.find((c: any) => c.type === "text");
      if (textContent && textContent.text) {
        try {
          return JSON.parse(textContent.text) as T;
        } catch (err) {
          logger.error({ err, toolName }, "Failed to parse MCP response");
          throw new Error(
            `Invalid JSON in MCP response: ${textContent.text.substring(
              0,
              100
            )}...`
          );
        }
      }
    }

    // Fallback: return response as-is if it doesn't match expected format
    return response as T;
  }

  /**
   * Generic pagination handler with support for SYNC_CUTOFF_DATE and SYNC_LIMIT_PER_QUERY
   */
  private async fetchAllPages<T>(
    toolName: string,
    params: Record<string, any>,
    extractResults: (response: any) => T[]
  ): Promise<T[]> {
    const allResults: T[] = [];
    let cursor: string | undefined = undefined;
    const cutoffDate = env.SYNC_CUTOFF_DATE
      ? new Date(env.SYNC_CUTOFF_DATE)
      : null;
    const limit = env.SYNC_LIMIT_PER_QUERY;

    do {
      // Check if we've reached the limit
      if (limit && allResults.length >= limit) {
        logger.info(
          { limit, fetched: allResults.length },
          "Reached SYNC_LIMIT_PER_QUERY, stopping pagination"
        );
        break;
      }

      const response: any = await this.callTool(toolName, {
        ...params,
        start_cursor: cursor,
        page_size: 100,
      });

      const results = extractResults(response);

      // Filter by cutoff date if specified (for records with last_edited_time)
      let filteredResults = results;
      if (cutoffDate) {
        filteredResults = results.filter((result: any) => {
          if (result.last_edited_time) {
            return new Date(result.last_edited_time) >= cutoffDate;
          }
          // Include records without last_edited_time (like users)
          return true;
        });

        // If we got fewer results after filtering and there are still results,
        // it means we've gone past the cutoff date
        if (filteredResults.length === 0 && results.length > 0) {
          logger.info(
            { cutoffDate },
            "All results are before SYNC_CUTOFF_DATE, stopping pagination"
          );
          break;
        }
      }

      allResults.push(...filteredResults);

      // Apply limit if specified
      if (limit && allResults.length > limit) {
        allResults.splice(limit);
        logger.info(
          { limit, fetched: allResults.length },
          "Trimmed results to SYNC_LIMIT_PER_QUERY"
        );
        break;
      }

      cursor = response.next_cursor || undefined;
    } while (cursor);

    return allResults;
  }

  /**
   * Phase 1: Get bot information
   */
  async getBotInfo(): Promise<NotionUser> {
    return this.callTool<NotionUser>("API-get-self", {});
  }

  /**
   * Phase 1: Get all workspace users
   */
  async getAllUsers(): Promise<NotionUser[]> {
    return this.fetchAllPages<NotionUser>(
      "API-get-users",
      {},
      (response) => response.results
    );
  }

  /**
   * Phase 1: Get specific user details
   */
  async getUser(userId: string): Promise<NotionUser> {
    return this.callTool<NotionUser>("API-get-user", { user_id: userId });
  }

  /**
   * Phase 2: Search all pages
   */
  async searchAllPages(): Promise<NotionPage[]> {
    return this.fetchAllPages<NotionPage>(
      "API-post-search",
      {
        query: "",
        filter: {
          value: "page",
          property: "object",
        },
        sort: {
          direction: "descending",
          timestamp: "last_edited_time",
        },
      },
      (response) => response.results
    );
  }

  /**
   * Phase 2: Search all databases
   */
  async searchAllDatabases(): Promise<NotionDatabase[]> {
    return this.fetchAllPages<NotionDatabase>(
      "API-post-search",
      {
        query: "",
        filter: {
          value: "database",
          property: "object",
        },
        sort: {
          direction: "descending",
          timestamp: "last_edited_time",
        },
      },
      (response) => response.results
    );
  }

  /**
   * Phase 3: Get database schema
   */
  async getDatabaseSchema(databaseId: string): Promise<NotionDatabase> {
    return this.callTool<NotionDatabase>("API-retrieve-a-database", {
      database_id: databaseId,
    });
  }

  /**
   * Phase 3: Query all database rows
   */
  async queryDatabaseRows(databaseId: string): Promise<NotionPage[]> {
    return this.fetchAllPages<NotionPage>(
      "API-post-database-query",
      {
        database_id: databaseId,
      },
      (response) => response.results
    );
  }

  /**
   * Phase 4: Get page metadata
   */
  async getPage(pageId: string): Promise<NotionPage> {
    return this.callTool<NotionPage>("API-retrieve-a-page", {
      page_id: pageId,
    });
  }

  /**
   * Phase 4: Get page content blocks
   */
  async getBlockChildren(blockId: string): Promise<NotionBlock[]> {
    return this.fetchAllPages<NotionBlock>(
      "API-get-block-children",
      {
        block_id: blockId,
      },
      (response) => response.results
    );
  }

  /**
   * Phase 4: Get block details
   */
  async getBlock(blockId: string): Promise<NotionBlock> {
    return this.callTool<NotionBlock>("API-retrieve-a-block", {
      block_id: blockId,
    });
  }

  /**
   * Phase 4: Recursively get all blocks in a page
   */
  async getAllBlocksRecursive(blockId: string): Promise<NotionBlock[]> {
    const allBlocks: NotionBlock[] = [];
    const blocks = await this.getBlockChildren(blockId);

    for (const block of blocks) {
      allBlocks.push(block);

      // Recursively get children if block has them
      if (block.has_children) {
        const childBlocks = await this.getAllBlocksRecursive(block.id);
        allBlocks.push(...childBlocks);
      }
    }

    return allBlocks;
  }

  /**
   * Phase 5: Get all comments for a page
   */
  async getPageComments(pageId: string): Promise<NotionComment[]> {
    return this.fetchAllPages<NotionComment>(
      "API-retrieve-a-comment",
      {
        block_id: pageId,
      },
      (response) => response.results
    );
  }

  /**
   * Set custom rate limit delay
   */
  setRateLimitDelay(delayMs: number): void {
    this.rateLimitDelay = delayMs;
  }
}
