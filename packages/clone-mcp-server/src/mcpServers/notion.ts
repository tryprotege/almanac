import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockData } from '../mockData.js';

const notionMcpServer = new McpServer({
  name: 'notion',
  version: '0.1.0',
});

// notion_append_block_children
notionMcpServer.registerTool(
  'notion_append_block_children',
  {
    description:
      "Append new children blocks to a specified parent block in Notion. Requires insert content capabilities. You can optionally specify the 'after' parameter to append after a certain block.",
    inputSchema: z.object({
      block_id: z
        .string()
        .describe(
          'The ID of the parent block.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      children: z
        .array(z.any())
        .describe(
          'Array of block objects to append. Each block must follow the Notion block schema.',
        ),
      after: z
        .string()
        .optional()
        .describe(
          'The ID of the existing block that the new block should be appended after.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const result = {
      object: 'list' as const,
      results: args.children.map((child: any, index: number) => ({
        object: 'block' as const,
        id: `block-${Date.now()}-${index}`,
        parent: { type: 'block_id', block_id: args.block_id },
        created_time: new Date().toISOString(),
        last_edited_time: new Date().toISOString(),
        ...child,
      })),
      next_cursor: null,
      has_more: false,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Blocks Appended\n\nSuccessfully appended ${
            args.children.length
          } block(s) to block ${args.block_id}\n\n${
            args.after ? `After block: ${args.after}\n` : ''
          }`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_retrieve_block
notionMcpServer.registerTool(
  'notion_retrieve_block',
  {
    description: 'Retrieve a block from Notion',
    inputSchema: z.object({
      block_id: z
        .string()
        .describe(
          'The ID of the block to retrieve.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const block = {
      object: 'block' as const,
      id: args.block_id,
      type: 'paragraph' as const,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      paragraph: {
        rich_text: [{ type: 'text', text: { content: 'Mock block content' } }],
      },
    };

    const responseText =
      args.format === 'markdown'
        ? `# Block: ${args.block_id}\n\nMock block content`
        : JSON.stringify(block, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_retrieve_block_children
notionMcpServer.registerTool(
  'notion_retrieve_block_children',
  {
    description: 'Retrieve the children of a block',
    inputSchema: z.object({
      block_id: z
        .string()
        .describe(
          'The ID of the block.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      start_cursor: z.string().optional().describe('Pagination cursor for next page of results'),
      page_size: z.number().optional().describe('Number of results per page (max 100)'),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const result = {
      object: 'list' as const,
      results: [],
      next_cursor: null,
      has_more: false,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Block Children: ${args.block_id}\n\nNo children found.`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_delete_block
notionMcpServer.registerTool(
  'notion_delete_block',
  {
    description: 'Delete a block in Notion',
    inputSchema: z.object({
      block_id: z
        .string()
        .describe(
          'The ID of the block to delete.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const result = {
      object: 'block' as const,
      id: args.block_id,
      archived: true,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Block Deleted\n\nSuccessfully deleted block: ${args.block_id}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_update_block
notionMcpServer.registerTool(
  'notion_update_block',
  {
    description:
      'Update the content of a block in Notion based on its type. The update replaces the entire value for a given field.',
    inputSchema: z.object({
      block_id: z
        .string()
        .describe(
          'The ID of the block to update.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      block: z
        .any()
        .describe("The updated content for the block. Must match the block's type schema."),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const result = {
      object: 'block' as const,
      id: args.block_id,
      last_edited_time: new Date().toISOString(),
      ...args.block,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Block Updated\n\nSuccessfully updated block: ${args.block_id}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_retrieve_page
notionMcpServer.registerTool(
  'notion_retrieve_page',
  {
    description: 'Retrieve a page from Notion',
    inputSchema: z.object({
      page_id: z
        .string()
        .describe(
          'The ID of the page to retrieve.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const id = args.page_id.replace(/[^a-zA-Z0-9-]/g, '');
    const page = mockData.notion.pages.find((p) => p.id === id || p.id.replace(/-/g, '') === id);

    const result = page || {
      object: 'page' as const,
      id: args.page_id,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      properties: {},
    };

    const responseText =
      args.format === 'markdown'
        ? `# Page: ${args.page_id}\n\n${JSON.stringify(result.properties, null, 2)}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_update_page_properties
notionMcpServer.registerTool(
  'notion_update_page_properties',
  {
    description: 'Update properties of a page or an item in a Notion database',
    inputSchema: z.object({
      page_id: z
        .string()
        .describe(
          'The ID of the page or database item to update.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      properties: z
        .any()
        .describe(
          'Properties to update. These correspond to the columns or fields in the database.',
        ),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const page = mockData.notion.pages.find((p) => p.id === args.page_id);
    const result = page
      ? {
          ...page,
          properties: args.properties,
          last_edited_time: new Date().toISOString(),
        }
      : null;

    const responseText =
      args.format === 'markdown'
        ? `# Page Properties Updated\n\nSuccessfully updated page: ${args.page_id}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_list_all_users
notionMcpServer.registerTool(
  'notion_list_all_users',
  {
    description:
      'List all users in the Notion workspace. **Note:** This function requires upgrading to the Notion Enterprise plan and using an Organization API key to avoid permission errors.',
    inputSchema: z.object({
      start_cursor: z.string().optional().describe('Pagination start cursor for listing users'),
      page_size: z.number().optional().describe('Number of users to retrieve (max 100)'),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const pageSize = args.page_size || 100;
    let startIndex = 0;

    if (args.start_cursor) {
      const cursorIndex = mockData.notion.users.findIndex((u) => u.id === args.start_cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const paginatedResults = mockData.notion.users.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageSize;
    const hasMore = nextIndex < mockData.notion.users.length;

    const result = {
      results: paginatedResults,
      next_cursor: hasMore ? mockData.notion.users[nextIndex - 1].id : null,
      has_more: hasMore,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Users\n\nFound ${paginatedResults.length} user(s)\n\n${paginatedResults
            .map((u) => `- ${u.name || 'Unnamed'} (${u.id})`)
            .join('\n')}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_retrieve_user
notionMcpServer.registerTool(
  'notion_retrieve_user',
  {
    description:
      'Retrieve a specific user by user_id in Notion. **Note:** This function requires upgrading to the Notion Enterprise plan and using an Organization API key to avoid permission errors.',
    inputSchema: z.object({
      user_id: z
        .string()
        .describe(
          'The ID of the user to retrieve.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const result = mockData.notion.users.find((u) => u.id === args.user_id);

    const responseText =
      args.format === 'markdown'
        ? result
          ? `# User: ${result.name || 'Unnamed'}\n\nID: ${result.id}\nType: ${result.type}`
          : `User not found: ${args.user_id}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_retrieve_bot_user
notionMcpServer.registerTool(
  'notion_retrieve_bot_user',
  {
    description: 'Retrieve the bot user associated with the current token in Notion',
    inputSchema: z.object({
      random_string: z.string().describe('Dummy parameter for no-parameter tools'),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const result = mockData.notion.users.find((u) => u.type === 'bot') || {
      object: 'user' as const,
      id: 'bot-id',
      type: 'bot' as const,
      name: 'Bot User',
    };

    const responseText =
      args.format === 'markdown'
        ? `# Bot User\n\nID: ${result.id}\nName: ${result.name}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_create_database
notionMcpServer.registerTool(
  'notion_create_database',
  {
    description: 'Create a database in Notion',
    inputSchema: z.object({
      parent: z.any().describe('Parent object of the database'),
      title: z
        .array(z.any())
        .optional()
        .describe('Title of database as it appears in Notion. An array of rich text objects.'),
      properties: z
        .any()
        .describe(
          'Property schema of database. The keys are the names of properties as they appear in Notion and the values are property schema objects.',
        ),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const newDatabase = {
      object: 'database' as const,
      id: `database-${Date.now()}`,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      parent: args.parent,
      properties: args.properties,
      title: args.title,
      archived: false,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Database Created\n\nSuccessfully created database with ID: ${newDatabase.id}`
        : JSON.stringify(newDatabase, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_query_database
notionMcpServer.registerTool(
  'notion_query_database',
  {
    description: 'Query a database in Notion',
    inputSchema: z.object({
      database_id: z
        .string()
        .describe(
          'The ID of the database to query.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      filter: z.any().optional().describe('Filter conditions'),
      sorts: z.array(z.any()).optional().describe('Sort conditions'),
      start_cursor: z.string().optional().describe('Pagination cursor for next page of results'),
      page_size: z.number().optional().describe('Number of results per page (max 100)'),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const result = {
      object: 'list' as const,
      results: [],
      next_cursor: null,
      has_more: false,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Database Query Results\n\nDatabase: ${args.database_id}\n\nNo results found.`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_retrieve_database
notionMcpServer.registerTool(
  'notion_retrieve_database',
  {
    description: 'Retrieve a database in Notion',
    inputSchema: z.object({
      database_id: z
        .string()
        .describe(
          'The ID of the database to retrieve.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const id = args.database_id.replace(/[^a-zA-Z0-9-]/g, '');
    const database = mockData.notion.databases.find(
      (d) => d.id === id || d.id.replace(/-/g, '') === id,
    );

    const result = database || {
      object: 'database' as const,
      id: args.database_id,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      properties: {},
    };

    const responseText =
      args.format === 'markdown'
        ? `# Database: ${args.database_id}\n\n${JSON.stringify(result.properties, null, 2)}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_update_database
notionMcpServer.registerTool(
  'notion_update_database',
  {
    description: 'Update a database in Notion',
    inputSchema: z.object({
      database_id: z
        .string()
        .describe(
          'The ID of the database to update.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      title: z
        .array(z.any())
        .optional()
        .describe(
          'An array of rich text objects that represents the title of the database that is displayed in the Notion UI.',
        ),
      description: z
        .array(z.any())
        .optional()
        .describe(
          'An array of rich text objects that represents the description of the database that is displayed in the Notion UI.',
        ),
      properties: z
        .any()
        .optional()
        .describe(
          'The properties of a database to be changed in the request, in the form of a JSON object.',
        ),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const database = mockData.notion.databases.find((d) => d.id === args.database_id);
    const result = database
      ? { ...database, ...args, last_edited_time: new Date().toISOString() }
      : null;

    const responseText =
      args.format === 'markdown'
        ? `# Database Updated\n\nSuccessfully updated database: ${args.database_id}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_create_database_item
notionMcpServer.registerTool(
  'notion_create_database_item',
  {
    description: 'Create a new item (page) in a Notion database',
    inputSchema: z.object({
      database_id: z
        .string()
        .describe(
          'The ID of the database to add the item to.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      properties: z
        .any()
        .describe('Properties of the new database item. These should match the database schema.'),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const newItem = {
      object: 'page' as const,
      id: `page-${Date.now()}`,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      parent: { database_id: args.database_id },
      properties: args.properties,
      archived: false,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Database Item Created\n\nSuccessfully created item with ID: ${newItem.id}`
        : JSON.stringify(newItem, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_create_comment
notionMcpServer.registerTool(
  'notion_create_comment',
  {
    description:
      "Create a comment in Notion. This requires the integration to have 'insert comment' capabilities. You can either specify a page parent or a discussion_id, but not both.",
    inputSchema: z.object({
      parent: z
        .any()
        .optional()
        .describe(
          'Parent object that specifies the page to comment on. Must include a page_id if used.',
        ),
      discussion_id: z
        .string()
        .optional()
        .describe(
          'The ID of an existing discussion thread to add a comment to.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      rich_text: z
        .array(z.any())
        .describe('Array of rich text objects representing the comment content.'),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const newComment = {
      object: 'comment' as const,
      id: `comment-${Date.now()}`,
      parent: args.parent,
      discussion_id: args.discussion_id || `discussion-${Date.now()}`,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      created_by: { object: 'user' as const, id: 'user-1' },
      rich_text: args.rich_text,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Comment Created\n\nSuccessfully created comment with ID: ${newComment.id}`
        : JSON.stringify(newComment, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_retrieve_comments
notionMcpServer.registerTool(
  'notion_retrieve_comments',
  {
    description:
      "Retrieve a list of unresolved comments from a Notion page or block. Requires the integration to have 'read comment' capabilities.",
    inputSchema: z.object({
      block_id: z
        .string()
        .describe(
          'The ID of the block or page whose comments you want to retrieve.It should be a 32-character string (excluding hyphens) formatted as 8-4-4-4-12 with hyphens (-).',
        ),
      start_cursor: z
        .string()
        .optional()
        .describe('If supplied, returns a page of results starting after the cursor.'),
      page_size: z.number().optional().describe('Number of comments to retrieve (max 100).'),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    const comments = mockData.notion.comments.filter((c) => c.parent?.page_id === args.block_id);

    const result = {
      results: comments,
      next_cursor: null,
      has_more: false,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Comments\n\nFound ${comments.length} comment(s) for block ${args.block_id}`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

// notion_search
notionMcpServer.registerTool(
  'notion_search',
  {
    description: 'Search pages or databases by title in Notion',
    inputSchema: z.object({
      query: z.string().optional().describe('Text to search for in page or database titles'),
      filter: z.any().optional().describe('Filter results by object type (page or database)'),
      sort: z.any().optional().describe('Sort order of results'),
      start_cursor: z.string().optional().describe('Pagination start cursor'),
      page_size: z.number().optional().describe('Number of results to return (max 100).'),
      format: z
        .enum(['json', 'markdown'])
        .optional()
        .default('markdown')
        .describe(
          "Specify the response format. 'json' returns the original data structure, 'markdown' returns a more readable format. Use 'markdown' when the user only needs to read the page and isn't planning to write or modify it. Use 'json' when the user needs to read the page with the intention of writing to or modifying it.",
        ),
    }),
  },
  async (args) => {
    let results: any[] = [];

    if (!args.filter || args.filter.value === 'page') {
      const pages = mockData.notion.pages.filter((p) =>
        args.query ? JSON.stringify(p).toLowerCase().includes(args.query.toLowerCase()) : true,
      );
      results = [...results, ...pages];
    }

    if (!args.filter || args.filter.value === 'database') {
      const databases = mockData.notion.databases.filter((d) =>
        args.query ? JSON.stringify(d).toLowerCase().includes(args.query.toLowerCase()) : true,
      );
      results = [...results, ...databases];
    }

    const result = {
      results: results.slice(0, args.page_size || 100),
      next_cursor: null,
      has_more: false,
    };

    const responseText =
      args.format === 'markdown'
        ? `# Search Results\n\nQuery: ${args.query || 'All'}\n\nFound ${
            result.results.length
          } result(s)`
        : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
);

export { notionMcpServer };
