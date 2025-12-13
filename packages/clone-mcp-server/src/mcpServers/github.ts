import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import mockDataStore from "../mockData";

export const githubMcpServer = new McpServer({
  name: "github-mcp",
  version: "0.1.0",
});

// ============================================
// Repository Tools
// ============================================

githubMcpServer.registerTool(
  "search_repositories",
  {
    title: "Search Repositories",
    description: "Search GitHub repositories",
    inputSchema: z.object({
      query: z.string().optional().describe("Search query"),
      page: z.number().optional().describe("Page number"),
      perPage: z.number().optional().describe("Results per page"),
    }),
  },
  async (args) => {
    const repos = mockDataStore.github.repositories;
    const query = args.query || "";
    const page = args.page || 1;
    const perPage = args.perPage || 30;

    const filtered = query
      ? repos.filter(
          (r: any) =>
            r.name?.toLowerCase().includes(query.toLowerCase()) ||
            r.full_name?.toLowerCase().includes(query.toLowerCase())
        )
      : repos;

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const items = filtered.slice(start, end);

    const result = {
      items,
      total_count: filtered.length,
      incomplete_results: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_repository",
  {
    title: "Get Repository",
    description: "Get a specific repository",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
    }),
  },
  async (args) => {
    const result = mockDataStore.github.repositories.find(
      (r: any) => r.owner?.login === args.owner && r.name === args.repo
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_repositories",
  {
    title: "List Repositories",
    description: "List repositories for a user/org",
    inputSchema: z.object({
      owner: z.string().describe("Owner username or org name"),
      page: z.number().optional(),
      perPage: z.number().optional(),
    }),
  },
  async (args) => {
    const page = args.page || 1;
    const perPage = args.perPage || 30;
    const repos = mockDataStore.github.repositories.filter(
      (r: any) => r.owner?.login === args.owner
    );
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const result = repos.slice(start, end);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_me",
  {
    title: "Get Me",
    description: "Get authenticated user",
    inputSchema: z.object({}),
  },
  async () => {
    const result = mockDataStore.github.users[0] || {};
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Issue Tools
// ============================================

githubMcpServer.registerTool(
  "list_issues",
  {
    title: "List Issues",
    description: "List issues in a repository",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      page: z.number().optional(),
      perPage: z.number().optional(),
    }),
  },
  async (args) => {
    const page = args.page || 1;
    const perPage = args.perPage || 30;
    const issues = mockDataStore.github.issues.filter((i: any) =>
      i.repository_url?.includes(`${args.owner}/${args.repo}`)
    );
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const result = {
      issues: issues.slice(start, end),
      pageInfo: {
        hasNextPage: end < issues.length,
        endCursor: end < issues.length ? `cursor_${end}` : null,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_issue",
  {
    title: "Get Issue",
    description: "Get a specific issue",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      issue_number: z.number(),
    }),
  },
  async (args) => {
    const result = mockDataStore.github.issues.find(
      (i: any) =>
        i.repository_url?.includes(`${args.owner}/${args.repo}`) &&
        i.number === args.issue_number
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_issue_comments",
  {
    title: "List Issue Comments",
    description: "List comments on an issue",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      issue_number: z.number(),
    }),
  },
  async (args) => {
    const comments = mockDataStore.github.comments.filter((c: any) =>
      c.issue_url?.includes(
        `${args.owner}/${args.repo}/issues/${args.issue_number}`
      )
    );
    const result = { comments };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "create_issue_comment",
  {
    title: "Create Issue Comment",
    description: "Create a comment on an issue",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      issue_number: z.number(),
      body: z.string(),
    }),
  },
  async (args) => {
    const newComment = {
      id: Date.now(),
      body: args.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      issue_url: `https://api.github.com/repos/${args.owner}/${args.repo}/issues/${args.issue_number}`,
    };
    mockDataStore.github.comments.push(newComment);
    return {
      content: [{ type: "text", text: JSON.stringify(newComment, null, 2) }],
    };
  }
);

// ============================================
// Pull Request Tools
// ============================================

githubMcpServer.registerTool(
  "list_pull_requests",
  {
    title: "List Pull Requests",
    description: "List pull requests",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      state: z.enum(["open", "closed", "all"]).optional(),
    }),
  },
  async (args) => {
    const state = args.state || "open";
    const prs = mockDataStore.github.pullRequests.filter(
      (pr: any) =>
        pr.base?.repo?.owner?.login === args.owner &&
        pr.base?.repo?.name === args.repo &&
        (state === "all" || pr.state === state)
    );
    const result = { pull_requests: prs };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_pull_request",
  {
    title: "Get Pull Request",
    description: "Get a specific pull request",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      pull_number: z.number(),
    }),
  },
  async (args) => {
    const result = mockDataStore.github.pullRequests.find(
      (pr: any) =>
        pr.base?.repo?.owner?.login === args.owner &&
        pr.base?.repo?.name === args.repo &&
        pr.number === args.pull_number
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "create_pull_request",
  {
    title: "Create Pull Request",
    description: "Create a new pull request",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      title: z.string(),
      head: z.string(),
      base: z.string(),
      body: z.string().optional(),
    }),
  },
  async (args) => {
    const newPr = {
      id: Date.now(),
      number: mockDataStore.github.pullRequests.length + 1,
      title: args.title,
      head: args.head,
      base: args.base,
      body: args.body,
      state: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockDataStore.github.pullRequests.push(newPr);
    return {
      content: [{ type: "text", text: JSON.stringify(newPr, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_pull_request_reviews",
  {
    title: "List Pull Request Reviews",
    description: "List reviews for a pull request",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      pull_number: z.number(),
    }),
  },
  async (args) => {
    const reviews = mockDataStore.github.reviews.filter((r: any) =>
      r.pull_request_url?.includes(
        `${args.owner}/${args.repo}/pulls/${args.pull_number}`
      )
    );
    const result = { reviews };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Workflow Tools
// ============================================

githubMcpServer.registerTool(
  "list_workflows",
  {
    title: "List Workflows",
    description: "List workflows in a repository",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
    }),
  },
  async (args) => {
    const workflows = mockDataStore.github.workflows.filter((w: any) =>
      w.url?.includes(`${args.owner}/${args.repo}`)
    );
    const result = { workflows };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_workflow_runs",
  {
    title: "List Workflow Runs",
    description: "List workflow runs",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      workflow_id: z.string().optional(),
      status: z.string().optional(),
    }),
  },
  async (args) => {
    let runs = mockDataStore.github.workflowRuns.filter(
      (r: any) =>
        r.repository?.owner?.login === args.owner &&
        r.repository?.name === args.repo
    );

    if (args.workflow_id) {
      runs = runs.filter(
        (r: any) => r.workflow_id === Number(args.workflow_id)
      );
    }

    if (args.status) {
      runs = runs.filter((r: any) => r.status === args.status);
    }

    const result = { workflow_runs: runs };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Release Tools
// ============================================

githubMcpServer.registerTool(
  "list_releases",
  {
    title: "List Releases",
    description: "List releases",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
    }),
  },
  async (args) => {
    const releases = mockDataStore.github.releases.filter((r: any) =>
      r.html_url?.includes(`${args.owner}/${args.repo}`)
    );
    const result = { releases };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_latest_release",
  {
    title: "Get Latest Release",
    description: "Get the latest release",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
    }),
  },
  async (args) => {
    const releases = mockDataStore.github.releases
      .filter((r: any) => r.html_url?.includes(`${args.owner}/${args.repo}`))
      .sort(
        (a: any, b: any) =>
          new Date(b.published_at).getTime() -
          new Date(a.published_at).getTime()
      );
    const result = releases[0];
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Commit Tools
// ============================================

githubMcpServer.registerTool(
  "list_commits",
  {
    title: "List Commits",
    description: "List commits",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      sha: z.string().optional(),
      path: z.string().optional(),
    }),
  },
  async (args) => {
    let commits = mockDataStore.github.commits.filter((c: any) =>
      c.url?.includes(`${args.owner}/${args.repo}`)
    );

    if (args.sha) {
      commits = commits.filter((c: any) => c.sha.startsWith(args.sha));
    }

    const result = { commits };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_commit",
  {
    title: "Get Commit",
    description: "Get a specific commit",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      ref: z.string(),
    }),
  },
  async (args) => {
    const result = mockDataStore.github.commits.find(
      (c: any) =>
        c.sha === args.ref && c.url?.includes(`${args.owner}/${args.repo}`)
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_file_contents",
  {
    title: "Get File Contents",
    description: "Get file contents",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      path: z.string(),
      branch: z.string().optional(),
    }),
  },
  async (args) => {
    const result = { content: "Mock file content...", encoding: "base64" };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "search_code",
  {
    title: "Search Code",
    description: "Search code",
    inputSchema: z.object({
      query: z.string(),
    }),
  },
  async (args) => {
    const result = { items: [], total_count: 0 };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// User Tools
// ============================================

githubMcpServer.registerTool(
  "get_user",
  {
    title: "Get User",
    description: "Get a specific user",
    inputSchema: z.object({
      username: z.string(),
    }),
  },
  async (args) => {
    const result = mockDataStore.github.users.find(
      (u: any) => u.login === args.username
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "search_users",
  {
    title: "Search Users",
    description: "Search users",
    inputSchema: z.object({
      query: z.string(),
    }),
  },
  async (args) => {
    const users = mockDataStore.github.users.filter((u: any) =>
      u.login?.toLowerCase().includes(args.query.toLowerCase())
    );
    const result = { items: users, total_count: users.length };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_rate_limit",
  {
    title: "Get Rate Limit",
    description: "Get rate limit status",
    inputSchema: z.object({}),
  },
  async () => {
    const result = {
      rate: {
        limit: 5000,
        remaining: 4999,
        reset: Math.floor(Date.now() / 1000) + 3600,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);
