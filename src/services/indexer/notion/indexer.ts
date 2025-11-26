import { NotionMCPClient } from "./mcpClient.js";
import {
  NotionUser,
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionComment,
  IndexerProgress,
  IndexerOptions,
  IndexerResult,
} from "./types.js";

/**
 * Functional Notion Indexer
 * Pure functions for extracting and transforming Notion data
 */

// ============================================================================
// Core Extraction Functions
// ============================================================================

/**
 * Extract all users from workspace
 */
export const extractUsers = async (
  client: NotionMCPClient
): Promise<{ bot: NotionUser; users: NotionUser[] }> => {
  const [bot, users] = await Promise.all([
    client.getBotInfo(),
    client.getAllUsers(),
  ]);

  return { bot, users };
};

/**
 * Extract all pages and databases from workspace
 */
export const extractWorkspaceContent = async (
  client: NotionMCPClient
): Promise<{ pages: NotionPage[]; databases: NotionDatabase[] }> => {
  const [pages, databases] = await Promise.all([
    client.searchAllPages(),
    client.searchAllDatabases(),
  ]);

  return { pages, databases };
};

/**
 * Extract database schema and all its rows
 */
export const extractDatabase = async (
  client: NotionMCPClient,
  databaseId: string
): Promise<{ schema: NotionDatabase; rows: NotionPage[] }> => {
  const [schema, rows] = await Promise.all([
    client.getDatabaseSchema(databaseId),
    client.queryDatabaseRows(databaseId),
  ]);

  return { schema, rows };
};

/**
 * Extract all databases with their schemas and rows
 */
export const extractAllDatabases = async (
  client: NotionMCPClient,
  databases: NotionDatabase[]
): Promise<Array<{ schema: NotionDatabase; rows: NotionPage[] }>> => {
  return Promise.all(databases.map((db) => extractDatabase(client, db.id)));
};

/**
 * Extract page content including metadata and blocks
 */
export const extractPageContent = async (
  client: NotionMCPClient,
  pageId: string,
  includeComments: boolean = true
): Promise<{
  page: NotionPage;
  blocks: NotionBlock[];
  comments: NotionComment[];
}> => {
  const page = await client.getPage(pageId);
  const blocks = await client.getAllBlocksRecursive(pageId);
  const comments = includeComments ? await client.getPageComments(pageId) : [];

  return { page, blocks, comments };
};

/**
 * Extract content for multiple pages
 */
export const extractAllPagesContent = async (
  client: NotionMCPClient,
  pages: NotionPage[],
  includeComments: boolean = true
): Promise<
  Array<{
    page: NotionPage;
    blocks: NotionBlock[];
    comments: NotionComment[];
  }>
> => {
  return Promise.all(
    pages.map((page) => extractPageContent(client, page.id, includeComments))
  );
};

// ============================================================================
// Data Transformation Functions
// ============================================================================

/**
 * Extract text content from rich text array
 */
export const extractTextFromRichText = (
  richText: Array<{ type: string; text: { content: string } }>
): string => {
  return richText.map((rt) => rt.text?.content || "").join("");
};

/**
 * Extract text content from a block
 */
export const extractBlockText = (block: NotionBlock): string => {
  const blockType = block.type;
  const blockData = block[blockType];

  if (blockData && blockData.rich_text) {
    return extractTextFromRichText(blockData.rich_text);
  }

  return "";
};

/**
 * Flatten block hierarchy into a list with depth information
 */
export const flattenBlocks = (
  blocks: NotionBlock[],
  depth: number = 0
): Array<NotionBlock & { depth: number }> => {
  return blocks.map((block) => ({
    ...block,
    depth,
  }));
};

/**
 * Extract all text content from blocks
 */
export const extractAllBlockText = (blocks: NotionBlock[]): string => {
  return blocks.map(extractBlockText).filter(Boolean).join("\n\n");
};

/**
 * Build page document for MongoDB
 */
export const buildPageDocument = (
  page: NotionPage,
  blocks: NotionBlock[],
  comments: NotionComment[]
) => {
  const textContent = extractAllBlockText(blocks);

  return {
    _id: `notion_page_${page.id}`,
    notion_id: page.id,
    type: "page",
    title: extractTextFromRichText((page.properties.title as any)?.title || []),
    properties: page.properties,
    parent: page.parent,
    content_text: textContent,
    blocks: blocks.map((b) => ({
      id: b.id,
      type: b.type,
      text: extractBlockText(b),
      has_children: b.has_children,
    })),
    comments_count: comments.length,
    metadata: {
      created_time: page.created_time,
      last_edited_time: page.last_edited_time,
      created_by: page.created_by,
      last_edited_by: page.last_edited_by,
      url: page.url,
      icon: page.icon,
      cover: page.cover,
    },
    indexed_at: new Date().toISOString(),
  };
};

/**
 * Build database document for MongoDB
 */
export const buildDatabaseDocument = (
  database: NotionDatabase,
  rows: NotionPage[]
) => {
  return {
    _id: `notion_database_${database.id}`,
    notion_id: database.id,
    type: "database",
    title: extractTextFromRichText(database.title),
    description: extractTextFromRichText(database.description || []),
    properties: database.properties,
    parent: database.parent,
    row_count: rows.length,
    row_ids: rows.map((r) => r.id),
    metadata: {
      created_time: database.created_time,
      last_edited_time: database.last_edited_time,
      created_by: database.created_by,
      last_edited_by: database.last_edited_by,
      url: database.url,
      icon: database.icon,
      cover: database.cover,
    },
    indexed_at: new Date().toISOString(),
  };
};

/**
 * Build user document for MongoDB
 */
export const buildUserDocument = (user: NotionUser) => {
  return {
    _id: `notion_user_${user.id}`,
    notion_id: user.id,
    type: "user",
    user_type: user.type,
    name: user.name,
    avatar_url: user.avatar_url,
    email: user.person?.email,
    indexed_at: new Date().toISOString(),
  };
};

/**
 * Build comment document for MongoDB
 */
export const buildCommentDocument = (
  comment: NotionComment,
  pageId: string
) => {
  return {
    _id: `notion_comment_${comment.id}`,
    notion_id: comment.id,
    type: "comment",
    page_id: pageId,
    discussion_id: comment.discussion_id,
    text: extractTextFromRichText(comment.rich_text),
    created_by: comment.created_by,
    created_time: comment.created_time,
    last_edited_time: comment.last_edited_time,
    indexed_at: new Date().toISOString(),
  };
};

// ============================================================================
// Progress Tracking Functions
// ============================================================================

/**
 * Create initial progress state
 */
export const createInitialProgress = (jobId: string): IndexerProgress => ({
  job_id: jobId,
  started_at: new Date().toISOString(),
  status: "running",
  current_phase: "initialization",
  progress: {
    users: { total: 0, processed: 0 },
    databases: { total: 0, processed: 0 },
    pages: { total: 0, processed: 0 },
    blocks: { total: 0, processed: 0 },
    comments: { total: 0, processed: 0 },
  },
  errors: [],
  last_updated: new Date().toISOString(),
});

/**
 * Update progress phase
 */
export const updateProgressPhase = (
  progress: IndexerProgress,
  phase: string
): IndexerProgress => ({
  ...progress,
  current_phase: phase,
  last_updated: new Date().toISOString(),
});

/**
 * Update progress counts
 */
export const updateProgressCounts = (
  progress: IndexerProgress,
  entity: keyof IndexerProgress["progress"],
  total: number,
  processed: number
): IndexerProgress => ({
  ...progress,
  progress: {
    ...progress.progress,
    [entity]: { total, processed },
  },
  last_updated: new Date().toISOString(),
});

/**
 * Add error to progress
 */
export const addProgressError = (
  progress: IndexerProgress,
  entityId: string,
  entityType: string,
  error: string
): IndexerProgress => ({
  ...progress,
  errors: [
    ...progress.errors,
    {
      entity_id: entityId,
      entity_type: entityType,
      error,
      timestamp: new Date().toISOString(),
    },
  ],
  last_updated: new Date().toISOString(),
});

/**
 * Complete progress
 */
export const completeProgress = (
  progress: IndexerProgress,
  status: "completed" | "failed"
): IndexerProgress => ({
  ...progress,
  status,
  last_updated: new Date().toISOString(),
});

// ============================================================================
// Main Orchestration Function
// ============================================================================

/**
 * Execute full Notion workspace indexing
 */
export const indexNotionWorkspace = async (
  client: NotionMCPClient,
  options: IndexerOptions
): Promise<IndexerResult> => {
  const jobId = `notion_index_${Date.now()}`;
  const startTime = Date.now();
  let progress = createInitialProgress(jobId);

  try {
    // Phase 1: Extract users
    progress = updateProgressPhase(progress, "extracting_users");
    const { users } = await extractUsers(client);
    progress = updateProgressCounts(
      progress,
      "users",
      users.length,
      users.length
    );

    // Phase 2: Extract workspace content
    progress = updateProgressPhase(progress, "discovering_content");
    const { pages, databases } = await extractWorkspaceContent(client);
    progress = updateProgressCounts(progress, "databases", databases.length, 0);
    progress = updateProgressCounts(progress, "pages", pages.length, 0);

    // Phase 3: Extract databases
    progress = updateProgressPhase(progress, "extracting_databases");
    const databasesData = await extractAllDatabases(client, databases);
    progress = updateProgressCounts(
      progress,
      "databases",
      databases.length,
      databases.length
    );

    // Phase 4: Extract page content
    progress = updateProgressPhase(progress, "extracting_pages");
    const allPages = [...pages, ...databasesData.flatMap((db) => db.rows)];
    const uniquePages = Array.from(
      new Map(allPages.map((p) => [p.id, p])).values()
    );

    const pagesContent = await extractAllPagesContent(
      client,
      uniquePages,
      options.include_comments
    );

    progress = updateProgressCounts(
      progress,
      "pages",
      uniquePages.length,
      uniquePages.length
    );

    const totalBlocks = pagesContent.reduce(
      (sum, pc) => sum + pc.blocks.length,
      0
    );
    const totalComments = pagesContent.reduce(
      (sum, pc) => sum + pc.comments.length,
      0
    );

    progress = updateProgressCounts(
      progress,
      "blocks",
      totalBlocks,
      totalBlocks
    );
    progress = updateProgressCounts(
      progress,
      "comments",
      totalComments,
      totalComments
    );

    // Complete
    progress = completeProgress(progress, "completed");

    const duration = Date.now() - startTime;
    const totalEntities =
      users.length +
      databases.length +
      uniquePages.length +
      totalBlocks +
      totalComments;

    // TODO: save data in mongo, qdrant etc...

    return {
      success: true,
      job_id: jobId,
      progress,
      summary: {
        total_entities: totalEntities,
        successful: totalEntities - progress.errors.length,
        failed: progress.errors.length,
        duration_ms: duration,
      },
    };
  } catch (error) {
    progress = completeProgress(progress, "failed");
    progress = addProgressError(
      progress,
      "workspace",
      "workspace",
      error instanceof Error ? error.message : String(error)
    );

    return {
      success: false,
      job_id: jobId,
      progress,
      summary: {
        total_entities: 0,
        successful: 0,
        failed: 1,
        duration_ms: Date.now() - startTime,
      },
    };
  }
};
