import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const notionMcpServer = new McpServer({
  name: "notion-mcp",
  version: "0.1.0",
});

// API-get-self
notionMcpServer.registerTool(
  "API-get-self",
  {
    title: "Get Bot Info",
    description: "Get bot information",
    inputSchema: z.object({}),
  },
  async () => {
    const result = mockDataStore.notion.users.find(
      (u: any) => u.type === "bot"
    ) || {
      object: "user",
      id: "bot-id",
      type: "bot",
      name: "Bot User",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-get-users
notionMcpServer.registerTool(
  "API-get-users",
  {
    title: "Get All Users",
    description: "Get all workspace users",
    inputSchema: z.object({}),
  },
  async () => {
    const result = {
      results: mockDataStore.notion.users,
      next_cursor: null,
      has_more: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-get-user
notionMcpServer.registerTool(
  "API-get-user",
  {
    title: "Get User",
    description: "Get specific user details",
    inputSchema: z.object({
      user_id: z.string().describe("The user ID"),
    }),
  },
  async (args) => {
    const result = mockDataStore.notion.users.find(
      (u: any) => u.id === args.user_id
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-post-search
notionMcpServer.registerTool(
  "API-post-search",
  {
    title: "Search",
    description: "Search all pages and databases",
    inputSchema: z.object({
      query: z.string().optional().describe("The search query"),
      filter: z
        .object({
          value: z.enum(["page", "database"]),
          property: z.string(),
        })
        .optional()
        .describe("Filter by object type"),
    }),
  },
  async (args) => {
    let results: any[] = [];

    if (!args.filter || args.filter.value === "page") {
      const pages = mockDataStore.notion.pages.filter((p: any) =>
        args.query
          ? JSON.stringify(p).toLowerCase().includes(args.query.toLowerCase())
          : true
      );
      results = [...results, ...pages];
    }

    if (!args.filter || args.filter.value === "database") {
      const databases = mockDataStore.notion.databases.filter((d: any) =>
        args.query
          ? JSON.stringify(d).toLowerCase().includes(args.query.toLowerCase())
          : true
      );
      results = [...results, ...databases];
    }

    const result = {
      results,
      next_cursor: null,
      has_more: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-retrieve-a-database
notionMcpServer.registerTool(
  "API-retrieve-a-database",
  {
    title: "Get Database Schema",
    description: "Get database schema",
    inputSchema: z.object({
      database_id: z.string().describe("The database ID"),
    }),
  },
  async (args) => {
    const result = mockDataStore.notion.databases.find(
      (d: any) => d.id === args.database_id
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-post-database-query
notionMcpServer.registerTool(
  "API-post-database-query",
  {
    title: "Query Database",
    description: "Query all database rows",
    inputSchema: z.object({
      database_id: z.string().describe("The database ID"),
    }),
  },
  async (args) => {
    const pages = mockDataStore.notion.pages.filter(
      (p: any) => p.parent?.database_id === args.database_id
    );
    const result = {
      results: pages,
      next_cursor: null,
      has_more: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-retrieve-a-page
notionMcpServer.registerTool(
  "API-retrieve-a-page",
  {
    title: "Get Page",
    description: "Get page metadata",
    inputSchema: z.object({
      page_id: z.string().describe("The page ID"),
    }),
  },
  async (args) => {
    const result = mockDataStore.notion.pages.find(
      (p: any) => p.id === args.page_id
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-get-block-children
notionMcpServer.registerTool(
  "API-get-block-children",
  {
    title: "Get Block Children",
    description: "Get page content blocks",
    inputSchema: z.object({
      block_id: z.string().describe("The block or page ID"),
    }),
  },
  async (args) => {
    const blocks = mockDataStore.notion.blocks.filter(
      (b: any) =>
        b.parent?.page_id === args.block_id ||
        b.parent?.block_id === args.block_id
    );
    const result = {
      results: blocks,
      next_cursor: null,
      has_more: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-retrieve-a-block
notionMcpServer.registerTool(
  "API-retrieve-a-block",
  {
    title: "Get Block",
    description: "Get block details",
    inputSchema: z.object({
      block_id: z.string().describe("The block ID"),
    }),
  },
  async (args) => {
    const result = mockDataStore.notion.blocks.find(
      (b: any) => b.id === args.block_id
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-retrieve-a-comment
notionMcpServer.registerTool(
  "API-retrieve-a-comment",
  {
    title: "Get Comments",
    description: "Get all comments for a page",
    inputSchema: z.object({
      block_id: z.string().describe("The page ID"),
    }),
  },
  async (args) => {
    const comments = mockDataStore.notion.comments.filter(
      (c: any) => c.parent?.page_id === args.block_id
    );
    const result = {
      results: comments,
      next_cursor: null,
      has_more: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);
