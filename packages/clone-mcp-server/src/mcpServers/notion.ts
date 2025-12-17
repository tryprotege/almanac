import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mockData } from "../mockData.js";

const notionMcpServer = new McpServer({
  name: "notion-mcp",
  version: "0.1.0",
});

// API-get-user
notionMcpServer.registerTool(
  "API-get-user",
  {
    description: "Notion | Retrieve a user",
    inputSchema: z.object({
      user_id: z.string().describe("The user ID"),
    }),
  },
  async (args) => {
    const result = mockData.notion.users.find((u) => u.id === args.user_id);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-get-users
notionMcpServer.registerTool(
  "API-get-users",
  {
    description: "Notion | List all users",
    inputSchema: z.object({
      start_cursor: z
        .string()
        .optional()
        .describe(
          "If supplied, this endpoint will return a page of results starting after the cursor provided. If not supplied, this endpoint will return the first page of results."
        ),
      page_size: z
        .number()
        .int()
        .default(100)
        .optional()
        .describe(
          "The number of items from the full list desired in the response. Maximum: 100"
        ),
    }),
  },
  async (args) => {
    const pageSize = args.page_size || 100;
    let startIndex = 0;

    // Find start index based on cursor
    if (args.start_cursor) {
      const cursorIndex = mockData.notion.users.findIndex(
        (u) => u.id === args.start_cursor
      );
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const paginatedResults = mockData.notion.users.slice(
      startIndex,
      startIndex + pageSize
    );
    const nextIndex = startIndex + pageSize;
    const hasMore = nextIndex < mockData.notion.users.length;

    const result = {
      results: paginatedResults,
      next_cursor: hasMore ? mockData.notion.users[nextIndex - 1].id : null,
      has_more: hasMore,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-get-self
notionMcpServer.registerTool(
  "API-get-self",
  {
    description: "Notion | Retrieve your token's bot user",
    inputSchema: z.object({}),
  },
  async () => {
    const result = mockData.notion.users.find((u) => u.type === "bot") || {
      object: "user" as const,
      id: "bot-id",
      type: "bot" as const,
      name: "Bot User",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-post-database-query
notionMcpServer.registerTool(
  "API-post-database-query",
  {
    description: "Notion | Query a database",
    inputSchema: z.object({
      database_id: z.string().describe("Identifier for a Notion database."),
      filter_properties: z
        .array(z.string())
        .optional()
        .describe(
          "A list of page property value IDs associated with the database. Use this param to limit the response to a specific page property value or values for pages that meet the `filter` criteria."
        ),
      filter: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          "When supplied, limits which pages are returned based on the [filter conditions](ref:post-database-query-filter)."
        ),
      sorts: z
        .array(
          z.object({
            property: z.string(),
            direction: z.enum(["ascending", "descending"]),
          })
        )
        .optional()
        .describe(
          "When supplied, orders the results based on the provided [sort criteria](ref:post-database-query-sort)."
        ),
      start_cursor: z
        .string()
        .optional()
        .describe(
          "When supplied, returns a page of results starting after the cursor provided. If not supplied, this endpoint will return the first page of results."
        ),
      page_size: z
        .number()
        .int()
        .default(100)
        .optional()
        .describe(
          "The number of items from the full list desired in the response. Maximum: 100"
        ),
      archived: z.boolean().optional(),
      in_trash: z.boolean().optional(),
    }),
  },
  async (args) => {
    const pages = mockData.notion.pages.filter(
      (p) => p.parent?.database_id === args.database_id
    );

    const pageSize = args.page_size || 100;
    let startIndex = 0;

    // Find start index based on cursor
    if (args.start_cursor) {
      const cursorIndex = pages.findIndex((p) => p.id === args.start_cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const paginatedResults = pages.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageSize;
    const hasMore = nextIndex < pages.length;

    const result = {
      results: paginatedResults,
      next_cursor: hasMore ? pages[nextIndex - 1].id : null,
      has_more: hasMore,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-post-search
notionMcpServer.registerTool(
  "API-post-search",
  {
    description: "Notion | Search by title",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          "The text that the API compares page and database titles against."
        ),
      sort: z
        .object({
          direction: z
            .string()
            .optional()
            .describe(
              "The direction to sort. Possible values include `ascending` and `descending`."
            ),
          timestamp: z
            .string()
            .optional()
            .describe(
              "The name of the timestamp to sort against. Possible values include `last_edited_time`."
            ),
        })
        .optional()
        .describe(
          'A set of criteria, `direction` and `timestamp` keys, that orders the results. The **only** supported timestamp value is `"last_edited_time"`. Supported `direction` values are `"ascending"` and `"descending"`. If `sort` is not provided, then the most recently edited results are returned first.'
        ),
      filter: z
        .object({
          value: z
            .string()
            .optional()
            .describe(
              "The value of the property to filter the results by. Possible values for object type include `page` or `database`. **Limitation**: Currently the only filter allowed is `object` which will filter by type of object (either `page` or `database`)"
            ),
          property: z
            .string()
            .optional()
            .describe(
              "The name of the property to filter by. Currently the only property you can filter by is the object type. Possible values include `object`. Limitation: Currently the only filter allowed is `object` which will filter by type of object (either `page` or `database`)"
            ),
        })
        .optional()
        .describe(
          'A set of criteria, `value` and `property` keys, that limits the results to either only pages or only databases. Possible `value` values are `"page"` or `"database"`. The only supported `property` value is `"object"`.'
        ),
      start_cursor: z
        .string()
        .optional()
        .describe(
          "A `cursor` value returned in a previous response that If supplied, limits the response to results starting after the `cursor`. If not supplied, then the first page of results is returned. Refer to [pagination](https://developers.notion.com/reference/intro#pagination) for more details."
        ),
      page_size: z
        .number()
        .int()
        .default(100)
        .optional()
        .describe(
          "The number of items from the full list to include in the response. Maximum: `100`."
        ),
    }),
  },
  async (args) => {
    let results: any[] = [];

    if (!args.filter || args.filter.value === "page") {
      const pages = mockData.notion.pages.filter((p) =>
        args.query
          ? JSON.stringify(p).toLowerCase().includes(args.query.toLowerCase())
          : true
      );
      results = [...results, ...pages];
    }

    if (!args.filter || args.filter.value === "database") {
      const databases = mockData.notion.databases.filter((d) =>
        args.query
          ? JSON.stringify(d).toLowerCase().includes(args.query.toLowerCase())
          : true
      );
      results = [...results, ...databases];
    }

    const pageSize = args.page_size || 100;
    let startIndex = 0;

    // Find start index based on cursor
    if (args.start_cursor) {
      const cursorIndex = results.findIndex((r) => r.id === args.start_cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const paginatedResults = results.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageSize;
    const hasMore = nextIndex < results.length;

    const result = {
      results: paginatedResults,
      next_cursor: hasMore ? results[nextIndex - 1].id : null,
      has_more: hasMore,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-get-block-children
notionMcpServer.registerTool(
  "API-get-block-children",
  {
    description: "Notion | Retrieve block children",
    inputSchema: z.object({
      block_id: z.string().describe("Identifier for a [block](ref:block)"),
      start_cursor: z
        .string()
        .optional()
        .describe(
          "If supplied, this endpoint will return a page of results starting after the cursor provided. If not supplied, this endpoint will return the first page of results."
        ),
      page_size: z
        .number()
        .int()
        .default(100)
        .optional()
        .describe(
          "The number of items from the full list desired in the response. Maximum: 100"
        ),
    }),
  },
  async (args) => {
    if (!Array.isArray(mockData.notion.blocks))
      return { content: [{ type: "text", text: JSON.stringify([], null, 2) }] };

    const blocks = mockData.notion.blocks.filter(
      (b) =>
        b.parent?.page_id === args.block_id ||
        b.parent?.block_id === args.block_id
    );

    const pageSize = args.page_size || 100;
    let startIndex = 0;

    // Find start index based on cursor
    if (args.start_cursor) {
      const cursorIndex = blocks.findIndex((b) => b.id === args.start_cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const paginatedResults = blocks.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageSize;
    const hasMore = nextIndex < blocks.length;

    const result = {
      results: paginatedResults,
      next_cursor: hasMore ? blocks[nextIndex - 1].id : null,
      has_more: hasMore,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-patch-block-children
notionMcpServer.registerTool(
  "API-patch-block-children",
  {
    description: "Notion | Append block children",
    inputSchema: z.object({
      block_id: z
        .string()
        .describe(
          "Identifier for a [block](ref:block). Also accepts a [page](ref:page) ID."
        ),
      children: z
        .array(z.any())
        .describe(
          "Child content to append to a container block as an array of [block objects](ref:block)"
        ),
      after: z
        .string()
        .optional()
        .describe(
          "The ID of the existing block that the new block should be appended after."
        ),
    }),
  },
  async (args) => {
    const result = {
      object: "list",
      results: args.children,
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
    description: "Notion | Retrieve a block",
    inputSchema: z.object({
      block_id: z.string().describe("Identifier for a Notion block"),
    }),
  },
  async (args) => {
    const result = mockData.notion.blocks.find((b) => b.id === args.block_id);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-update-a-block
notionMcpServer.registerTool(
  "API-update-a-block",
  {
    description: "Notion | Update a block",
    inputSchema: z.object({
      block_id: z.string().describe("Identifier for a Notion block"),
      type: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          "The [block object `type`](ref:block#block-object-keys) value with the properties to be updated. Currently only `text` (for supported block types) and `checked` (for `to_do` blocks) fields can be updated."
        ),
      archived: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "Set to true to archive (delete) a block. Set to false to un-archive (restore) a block."
        ),
    }),
  },
  async (args) => {
    const block = mockData.notion.blocks.find((b) => b.id === args.block_id);
    const result = block ? { ...block, archived: args.archived } : null;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-delete-a-block
notionMcpServer.registerTool(
  "API-delete-a-block",
  {
    description: "Notion | Delete a block",
    inputSchema: z.object({
      block_id: z.string().describe("Identifier for a Notion block"),
    }),
  },
  async (args) => {
    const block = mockData.notion.blocks.find((b) => b.id === args.block_id);
    const result = block ? { ...block, archived: true } : null;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-retrieve-a-page
notionMcpServer.registerTool(
  "API-retrieve-a-page",
  {
    description: "Notion | Retrieve a page",
    inputSchema: z.object({
      page_id: z.string().describe("Identifier for a Notion page"),
      filter_properties: z
        .string()
        .optional()
        .describe(
          "A list of page property value IDs associated with the page. Use this param to limit the response to a specific page property value or values. To retrieve multiple properties, specify each page property ID. For example: `?filter_properties=iAk8&filter_properties=b7dh`."
        ),
    }),
  },
  async (args) => {
    const result = mockData.notion.pages.find((p) => p.id === args.page_id);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-patch-page
notionMcpServer.registerTool(
  "API-patch-page",
  {
    description: "Notion | Update page properties",
    inputSchema: z.object({
      page_id: z
        .string()
        .describe("The identifier for the Notion page to be updated."),
      properties: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          "The property values to update for the page. The keys are the names or IDs of the property and the values are property values. If a page property ID is not included, then it is not changed."
        ),
      in_trash: z
        .boolean()
        .default(false)
        .optional()
        .describe(
          "Set to true to delete a block. Set to false to restore a block."
        ),
      archived: z.boolean().optional(),
      icon: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          "A page icon for the page. Supported types are [external file object](https://developers.notion.com/reference/file-object) or [emoji object](https://developers.notion.com/reference/emoji-object)."
        ),
      cover: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          "A cover image for the page. Only [external file objects](https://developers.notion.com/reference/file-object) are supported."
        ),
    }),
  },
  async (args) => {
    const page = mockData.notion.pages.find((p) => p.id === args.page_id);
    const result = page ? { ...page, ...args } : null;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-post-page
notionMcpServer.registerTool(
  "API-post-page",
  {
    description: "Notion | Create a page",
    inputSchema: z.object({
      parent: z
        .object({
          page_id: z.string(),
        })
        .describe("The parent page"),
      properties: z
        .record(z.string(), z.any())
        .describe("The property values for the page"),
      children: z
        .array(z.any())
        .optional()
        .describe(
          "The content to be rendered on the new page, represented as an array of [block objects](https://developers.notion.com/reference/block)."
        ),
      icon: z
        .string()
        .optional()
        .describe(
          "The icon of the new page. Either an [emoji object](https://developers.notion.com/reference/emoji-object) or an [external file object](https://developers.notion.com/reference/file-object).."
        ),
      cover: z
        .string()
        .optional()
        .describe(
          "The cover image of the new page, represented as a [file object](https://developers.notion.com/reference/file-object)."
        ),
    }),
  },
  async (args) => {
    const newPage = {
      object: "page" as const,
      id: `page-${Date.now()}`,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      parent: args.parent,
      properties: args.properties,
      archived: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(newPage, null, 2) }],
    };
  }
);

// API-create-a-database
notionMcpServer.registerTool(
  "API-create-a-database",
  {
    description: "Notion | Create a database",
    inputSchema: z.object({
      parent: z
        .object({
          type: z.enum(["page_id"]),
          page_id: z.string(),
        })
        .describe("The parent page"),
      properties: z
        .record(z.string(), z.any())
        .describe(
          "Property schema of database. The keys are the names of properties as they appear in Notion and the values are [property schema objects](https://developers.notion.com/reference/property-schema-object)."
        ),
    }),
  },
  async (args) => {
    const newDatabase = {
      object: "database" as const,
      id: `database-${Date.now()}`,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      parent: args.parent,
      properties: args.properties,
      archived: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(newDatabase, null, 2) }],
    };
  }
);

// API-update-a-database
notionMcpServer.registerTool(
  "API-update-a-database",
  {
    description: "Notion | Update a database",
    inputSchema: z.object({
      database_id: z.string().describe("identifier for a Notion database"),
      title: z
        .array(z.any())
        .optional()
        .describe(
          "An array of [rich text objects](https://developers.notion.com/reference/rich-text) that represents the title of the database that is displayed in the Notion UI. If omitted, then the database title remains unchanged."
        ),
      description: z
        .array(z.any())
        .optional()
        .describe(
          "An array of [rich text objects](https://developers.notion.com/reference/rich-text) that represents the description of the database that is displayed in the Notion UI. If omitted, then the database description remains unchanged."
        ),
      properties: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          "Property schema of database. The keys are the names of properties as they appear in Notion and the values are [property schema objects](https://developers.notion.com/reference/property-schema-object)."
        ),
    }),
  },
  async (args) => {
    const database = mockData.notion.databases.find(
      (d) => d.id === args.database_id
    );
    const result = database ? { ...database, ...args } : null;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-retrieve-a-database
notionMcpServer.registerTool(
  "API-retrieve-a-database",
  {
    description: "Notion | Retrieve a database",
    inputSchema: z.object({
      database_id: z
        .string()
        .describe("An identifier for the Notion database."),
    }),
  },
  async (args) => {
    const result = mockData.notion.databases.find(
      (d) => d.id === args.database_id
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-retrieve-a-page-property
notionMcpServer.registerTool(
  "API-retrieve-a-page-property",
  {
    description: "Notion | Retrieve a page property item",
    inputSchema: z.object({
      page_id: z.string().describe("Identifier for a Notion page"),
      property_id: z
        .string()
        .describe(
          "Identifier for a page [property](https://developers.notion.com/reference/page#all-property-values)"
        ),
      page_size: z
        .number()
        .int()
        .optional()
        .describe(
          "For paginated properties. The max number of property item objects on a page. The default size is 100"
        ),
      start_cursor: z.string().optional().describe("For paginated properties."),
    }),
  },
  async (args) => {
    const page = mockData.notion.pages.find((p) => p.id === args.page_id);
    const result = page?.properties?.[args.property_id] || null;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-retrieve-a-comment
notionMcpServer.registerTool(
  "API-retrieve-a-comment",
  {
    description: "Notion | Retrieve comments",
    inputSchema: z.object({
      block_id: z.string().describe("Identifier for a Notion block or page"),
      start_cursor: z
        .string()
        .optional()
        .describe(
          "If supplied, this endpoint will return a page of results starting after the cursor provided. If not supplied, this endpoint will return the first page of results."
        ),
      page_size: z
        .number()
        .int()
        .optional()
        .describe(
          "The number of items from the full list desired in the response. Maximum: 100"
        ),
    }),
  },
  async (args) => {
    const comments = mockData.notion.comments.filter(
      (c) => c.parent?.page_id === args.block_id
    );

    const pageSize = args.page_size || 100;
    let startIndex = 0;

    // Find start index based on cursor
    if (args.start_cursor) {
      const cursorIndex = comments.findIndex((c) => c.id === args.start_cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const paginatedResults = comments.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageSize;
    const hasMore = nextIndex < comments.length;

    const result = {
      results: paginatedResults,
      next_cursor: hasMore ? comments[nextIndex - 1].id : null,
      has_more: hasMore,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// API-create-a-comment
notionMcpServer.registerTool(
  "API-create-a-comment",
  {
    description: "Notion | Create comment",
    inputSchema: z.object({
      parent: z
        .object({
          page_id: z.string().describe("the page ID"),
        })
        .describe("The page that contains the comment"),
      rich_text: z
        .array(
          z.object({
            text: z.object({
              content: z.string().describe("The content of the comment"),
            }),
          })
        )
        .describe("The rich text content of the comment"),
    }),
  },
  async (args) => {
    const newComment = {
      object: "comment" as const,
      id: `comment-${Date.now()}`,
      parent: args.parent,
      discussion_id: `discussion-${Date.now()}`,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      created_by: { object: "user" as const, id: "user-1" },
      rich_text: args.rich_text,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(newComment, null, 2) }],
    };
  }
);

export { notionMcpServer };
