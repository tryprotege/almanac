import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mockData } from "../mockData.js";

const githubMcpServer = new McpServer({
  name: "github-mcp",
  version: "0.1.0",
});

// ============================================
// GitHub Actions Tools
// ============================================

githubMcpServer.registerTool(
  "actions_get",
  {
    title:
      "Get details of GitHub Actions resources (workflows, workflow runs, jobs, and artifacts)",
    description:
      "Get details about specific GitHub Actions resources.\nUse this tool to get details about individual workflows, workflow runs, jobs, and artifacts by their unique IDs.\n",
    inputSchema: z.object({
      method: z
        .enum([
          "get_workflow",
          "get_workflow_run",
          "get_workflow_job",
          "download_workflow_run_artifact",
          "get_workflow_run_usage",
          "get_workflow_run_logs_url",
        ])
        .describe("The method to execute"),
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      resource_id: z.string().describe("The unique identifier of the resource"),
    }),
  },
  async (args) => {
    const result = {
      method: args.method,
      resource_id: args.resource_id,
      data: {},
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "actions_list",
  {
    title: "List GitHub Actions workflows in a repository",
    description:
      "Tools for listing GitHub Actions resources.\nUse this tool to list workflows in a repository, or list workflow runs, jobs, and artifacts for a specific workflow or workflow run.\n",
    inputSchema: z.object({
      method: z
        .enum([
          "list_workflows",
          "list_workflow_runs",
          "list_workflow_jobs",
          "list_workflow_run_artifacts",
        ])
        .describe("The action to perform"),
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      page: z
        .number()
        .min(1)
        .optional()
        .describe("Page number for pagination (default: 1)"),
      per_page: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination (default: 30, max: 100)"),
      resource_id: z
        .string()
        .optional()
        .describe("The unique identifier of the resource"),
      workflow_jobs_filter: z
        .object({
          filter: z.enum(["latest", "all"]).optional(),
        })
        .optional()
        .describe("Filters for workflow jobs"),
      workflow_runs_filter: z
        .object({
          actor: z.string().optional(),
          branch: z.string().optional(),
          event: z.string().optional(),
          status: z
            .enum([
              "queued",
              "in_progress",
              "completed",
              "requested",
              "waiting",
            ])
            .optional(),
        })
        .optional()
        .describe("Filters for workflow runs"),
    }),
  },
  async (args) => {
    if (args.method === "list_workflows") {
      const workflows = mockData.github.workflows.filter((w) =>
        w.url?.includes(`${args.owner}/${args.repo}`)
      );
      return {
        content: [
          { type: "text", text: JSON.stringify({ workflows }, null, 2) },
        ],
      };
    }
    const result = { method: args.method, items: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Security & Alerts Tools
// ============================================

githubMcpServer.registerTool(
  "get_code_scanning_alert",
  {
    title: "Get code scanning alert",
    description:
      "Get details of a specific code scanning alert in a GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("The owner of the repository."),
      repo: z.string().describe("The name of the repository."),
      alertNumber: z.number().describe("The number of the alert."),
    }),
  },
  async (args) => {
    const result = { alert_number: args.alertNumber, state: "open" };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_code_scanning_alerts",
  {
    title: "List code scanning alerts",
    description: "List code scanning alerts in a GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("The owner of the repository."),
      repo: z.string().describe("The name of the repository."),
      ref: z
        .string()
        .optional()
        .describe("The Git reference for the results you want to list."),
      severity: z
        .enum(["critical", "high", "medium", "low", "warning", "note", "error"])
        .optional(),
      state: z
        .enum(["open", "closed", "dismissed", "fixed"])
        .optional()
        .default("open"),
      tool_name: z.string().optional(),
    }),
  },
  async (args) => {
    const result = { alerts: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_dependabot_alert",
  {
    title: "Get dependabot alert",
    description:
      "Get details of a specific dependabot alert in a GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("The owner of the repository."),
      repo: z.string().describe("The name of the repository."),
      alertNumber: z.number().describe("The number of the alert."),
    }),
  },
  async (args) => {
    const result = { alert_number: args.alertNumber, state: "open" };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_dependabot_alerts",
  {
    title: "List dependabot alerts",
    description: "List dependabot alerts in a GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("The owner of the repository."),
      repo: z.string().describe("The name of the repository."),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      state: z
        .enum(["open", "fixed", "dismissed", "auto_dismissed"])
        .optional()
        .default("open"),
    }),
  },
  async (args) => {
    const result = { alerts: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_secret_scanning_alert",
  {
    title: "Get secret scanning alert",
    description:
      "Get details of a specific secret scanning alert in a GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("The owner of the repository."),
      repo: z.string().describe("The name of the repository."),
      alertNumber: z.number().describe("The number of the alert."),
    }),
  },
  async (args) => {
    const result = { alert_number: args.alertNumber, state: "open" };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_secret_scanning_alerts",
  {
    title: "List secret scanning alerts",
    description: "List secret scanning alerts in a GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("The owner of the repository."),
      repo: z.string().describe("The name of the repository."),
      resolution: z
        .enum([
          "false_positive",
          "wont_fix",
          "revoked",
          "pattern_edited",
          "pattern_deleted",
          "used_in_tests",
        ])
        .optional(),
      secret_type: z.string().optional(),
      state: z.enum(["open", "resolved"]).optional(),
    }),
  },
  async (args) => {
    const result = { alerts: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_global_security_advisory",
  {
    title: "Get a global security advisory",
    description: "Get a global security advisory",
    inputSchema: z.object({
      ghsaId: z
        .string()
        .describe("GitHub Security Advisory ID (format: GHSA-xxxx-xxxx-xxxx)."),
    }),
  },
  async (args) => {
    const result = { ghsa_id: args.ghsaId };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_global_security_advisories",
  {
    title: "List global security advisories",
    description: "List global security advisories from GitHub.",
    inputSchema: z.object({
      affects: z.string().optional(),
      cveId: z.string().optional(),
      cwes: z.array(z.string()).optional(),
      ecosystem: z
        .enum([
          "actions",
          "composer",
          "erlang",
          "go",
          "maven",
          "npm",
          "nuget",
          "other",
          "pip",
          "pub",
          "rubygems",
          "rust",
        ])
        .optional(),
      ghsaId: z.string().optional(),
      isWithdrawn: z.boolean().optional(),
      modified: z.string().optional(),
      published: z.string().optional(),
      severity: z
        .enum(["unknown", "low", "medium", "high", "critical"])
        .optional(),
      type: z
        .enum(["reviewed", "malware", "unreviewed"])
        .optional()
        .default("reviewed"),
      updated: z.string().optional(),
    }),
  },
  async (args) => {
    const result = { advisories: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_repository_security_advisories",
  {
    title: "List repository security advisories",
    description: "List repository security advisories for a GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("The owner of the repository."),
      repo: z.string().describe("The name of the repository."),
      direction: z.enum(["asc", "desc"]).optional(),
      sort: z.enum(["created", "updated", "published"]).optional(),
      state: z.enum(["triage", "draft", "published", "closed"]).optional(),
    }),
  },
  async (args) => {
    const result = { advisories: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_org_repository_security_advisories",
  {
    title: "List org repository security advisories",
    description:
      "List repository security advisories for a GitHub organization.",
    inputSchema: z.object({
      org: z.string().describe("The organization login."),
      direction: z.enum(["asc", "desc"]).optional(),
      sort: z.enum(["created", "updated", "published"]).optional(),
      state: z.enum(["triage", "draft", "published", "closed"]).optional(),
    }),
  },
  async (args) => {
    const result = { advisories: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Commit Tools
// ============================================

githubMcpServer.registerTool(
  "get_commit",
  {
    title: "Get commit details",
    description: "Get details for a commit from a GitHub repository",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      sha: z.string().describe("Commit SHA, branch name, or tag name"),
      include_diff: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to include file diffs and stats in the response"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const result = mockData.github.commits.find(
      (c) => c.sha === args.sha && c.url?.includes(`${args.owner}/${args.repo}`)
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_commits",
  {
    title: "List commits",
    description:
      "Get list of commits of a branch in a GitHub repository. Returns at least 30 results per page by default, but can return more if specified using the perPage parameter (up to 100).",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      sha: z
        .string()
        .optional()
        .describe("Commit SHA, branch or tag name to list commits of"),
      author: z
        .string()
        .optional()
        .describe("Author username or email address to filter commits by"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    let commits = mockData.github.commits.filter((c) =>
      c.url?.includes(`${args.owner}/${args.repo}`)
    );

    if (args.sha) {
      commits = commits.filter((c) => c.sha.startsWith(args.sha!));
    }

    const result = { commits };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Copilot Tools
// ============================================

githubMcpServer.registerTool(
  "get_copilot_space",
  {
    title: "Get Copilot Space",
    description:
      "This tool can be used to provide additional context to the chat from a specific Copilot space. If user mentioned the keyword 'Copilot space' with the name and owner of the space, execute this tool.",
    inputSchema: z.object({
      owner: z.string().describe("The owner of the space"),
      name: z.string().describe("The name of the space"),
    }),
  },
  async (args) => {
    const result = { owner: args.owner, name: args.name };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_copilot_spaces",
  {
    title: "List Copilot Spaces",
    description:
      "Retrieves the list of Copilot Spaces accessible to the user, including their names and owners.",
    inputSchema: z.object({}),
  },
  async () => {
    const result = { spaces: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Discussion Tools
// ============================================

githubMcpServer.registerTool(
  "get_discussion",
  {
    title: "Get discussion",
    description: "Get a specific discussion by ID",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      discussionNumber: z.number().describe("Discussion Number"),
    }),
  },
  async (args) => {
    const result = { number: args.discussionNumber };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_discussion_comments",
  {
    title: "Get discussion comments",
    description: "Get comments from a discussion",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      discussionNumber: z.number().describe("Discussion Number"),
      after: z.string().optional().describe("Cursor for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const perPage = args.perPage || 30;
    const allComments: any[] = [];

    // Find starting index based on cursor
    let startIndex = 0;
    if (args.after) {
      const afterIndex = allComments.findIndex((c: any) => c.id === args.after);
      startIndex = afterIndex >= 0 ? afterIndex + 1 : 0;
    }

    const paginatedComments = allComments.slice(
      startIndex,
      startIndex + perPage
    );
    const hasNextPage = startIndex + perPage < allComments.length;
    const nextCursor = hasNextPage
      ? paginatedComments[paginatedComments.length - 1]?.id
      : null;

    const result = {
      comments: paginatedComments,
      pageInfo: {
        hasNextPage,
        endCursor: nextCursor,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_discussion_categories",
  {
    title: "List discussion categories",
    description:
      "List discussion categories with their id and name, for a repository or organisation.",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().optional().describe("Repository name"),
    }),
  },
  async (args) => {
    const result = { categories: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_discussions",
  {
    title: "List discussions",
    description: "List discussions for a repository or organisation.",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().optional().describe("Repository name"),
      after: z.string().optional().describe("Cursor for pagination"),
      category: z
        .string()
        .optional()
        .describe("Optional filter by discussion category ID"),
      direction: z.enum(["ASC", "DESC"]).optional(),
      orderBy: z.enum(["CREATED_AT", "UPDATED_AT"]).optional(),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const perPage = args.perPage || 30;
    const allDiscussions: any[] = [];

    // Find starting index based on cursor
    let startIndex = 0;
    if (args.after) {
      const afterIndex = allDiscussions.findIndex(
        (d: any) => d.id === args.after
      );
      startIndex = afterIndex >= 0 ? afterIndex + 1 : 0;
    }

    const paginatedDiscussions = allDiscussions.slice(
      startIndex,
      startIndex + perPage
    );
    const hasNextPage = startIndex + perPage < allDiscussions.length;
    const nextCursor = hasNextPage
      ? paginatedDiscussions[paginatedDiscussions.length - 1]?.id
      : null;

    const result = {
      discussions: paginatedDiscussions,
      pageInfo: {
        hasNextPage,
        endCursor: nextCursor,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// File & Repository Content Tools
// ============================================

githubMcpServer.registerTool(
  "get_file_contents",
  {
    title: "Get file or directory contents",
    description:
      "Get the contents of a file or directory from a GitHub repository",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner (username or organization)"),
      repo: z.string().describe("Repository name"),
      path: z
        .string()
        .optional()
        .default("/")
        .describe("Path to file/directory"),
      ref: z.string().optional().describe("Accepts optional git refs"),
      sha: z.string().optional().describe("Accepts optional commit SHA"),
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
  "get_repository_tree",
  {
    title: "Get repository tree",
    description:
      "Get the tree structure (files and directories) of a GitHub repository at a specific ref or SHA",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner (username or organization)"),
      repo: z.string().describe("Repository name"),
      tree_sha: z
        .string()
        .optional()
        .describe("The SHA1 value or ref name of the tree"),
      recursive: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Setting this parameter to true returns the objects or subtrees referenced by the tree"
        ),
      path_filter: z
        .string()
        .optional()
        .describe("Optional path prefix to filter the tree results"),
    }),
  },
  async (args) => {
    const result = { tree: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Gist Tools
// ============================================

githubMcpServer.registerTool(
  "get_gist",
  {
    title: "Get Gist Content",
    description: "Get gist content of a particular gist, by gist ID",
    inputSchema: z.object({
      gist_id: z.string().describe("The ID of the gist"),
    }),
  },
  async (args) => {
    const result = { id: args.gist_id };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_gists",
  {
    title: "List Gists",
    description: "List gists for a user",
    inputSchema: z.object({
      username: z
        .string()
        .optional()
        .describe("GitHub username (omit for authenticated user's gists)"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
      since: z
        .string()
        .optional()
        .describe("Only gists updated after this time (ISO 8601 timestamp)"),
    }),
  },
  async (args) => {
    const result = { gists: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Issue Tools
// ============================================

githubMcpServer.registerTool(
  "issue_read",
  {
    title: "Get issue details",
    description:
      "Get information about a specific issue in a GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("The owner of the repository"),
      repo: z.string().describe("The name of the repository"),
      issue_number: z.number().describe("The number of the issue"),
      method: z
        .enum(["get", "get_comments", "get_sub_issues", "get_labels"])
        .describe("The read operation to perform on a single issue"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const issue = mockData.github.issues.find(
      (i) =>
        i.repository_url?.includes(`${args.owner}/${args.repo}`) &&
        i.number === args.issue_number
    );

    if (args.method === "get_comments") {
      const comments = mockData.github.comments.filter((c) =>
        c.issue_url?.includes(
          `${args.owner}/${args.repo}/issues/${args.issue_number}`
        )
      );
      return {
        content: [
          { type: "text", text: JSON.stringify({ comments }, null, 2) },
        ],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "issue_write",
  {
    title: "Create or update issue.",
    description:
      "Create a new or update an existing issue in a GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      method: z
        .enum(["create", "update"])
        .describe("Write operation to perform"),
      issue_number: z.number().optional().describe("Issue number to update"),
      title: z.string().optional().describe("Issue title"),
      body: z.string().optional().describe("Issue body content"),
      assignees: z
        .array(z.string())
        .optional()
        .describe("Usernames to assign to this issue"),
      labels: z
        .array(z.string())
        .optional()
        .describe("Labels to apply to this issue"),
      milestone: z.number().optional().describe("Milestone number"),
      state: z.enum(["open", "closed"]).optional().describe("New state"),
      state_reason: z
        .enum(["completed", "not_planned", "duplicate"])
        .optional()
        .describe("Reason for the state change"),
      duplicate_of: z
        .number()
        .optional()
        .describe("Issue number that this issue is a duplicate of"),
      type: z.string().optional().describe("Type of this issue"),
    }),
  },
  async (args) => {
    if (args.method === "create") {
      const newIssue = {
        id: Date.now(),
        number: mockData.github.issues.length + 1,
        title: args.title,
        body: args.body,
        state: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockData.github.issues.push(newIssue as any);
      return {
        content: [{ type: "text", text: JSON.stringify(newIssue, null, 2) }],
      };
    }
    const result = { updated: true };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_issues",
  {
    title: "List issues",
    description:
      "List issues in a GitHub repository. For pagination, use the 'endCursor' from the previous response's 'pageInfo' in the 'after' parameter.",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      after: z.string().optional().describe("Cursor for pagination"),
      direction: z.enum(["ASC", "DESC"]).optional().describe("Order direction"),
      orderBy: z
        .enum(["CREATED_AT", "UPDATED_AT", "COMMENTS"])
        .optional()
        .describe("Order issues by field"),
      labels: z.array(z.string()).optional().describe("Filter by labels"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
      since: z
        .string()
        .optional()
        .describe("Filter by date (ISO 8601 timestamp)"),
      state: z.enum(["OPEN", "CLOSED"]).optional().describe("Filter by state"),
    }),
  },
  async (args) => {
    const perPage = args.perPage || 30;
    const allIssues = mockData.github.issues.filter((i) =>
      i.repository_url?.includes(`${args.owner}/${args.repo}`)
    );

    // Find starting index based on cursor
    let startIndex = 0;
    if (args.after) {
      const afterIndex = allIssues.findIndex((i: any) => i.id === args.after);
      startIndex = afterIndex >= 0 ? afterIndex + 1 : 0;
    }

    const paginatedIssues = allIssues.slice(startIndex, startIndex + perPage);
    const hasNextPage = startIndex + perPage < allIssues.length;
    const nextCursor = hasNextPage
      ? paginatedIssues[paginatedIssues.length - 1]?.id
      : null;

    const result = {
      issues: paginatedIssues,
      pageInfo: {
        hasNextPage,
        endCursor: nextCursor,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_issue_types",
  {
    title: "List available issue types",
    description:
      "List supported issue types for repository owner (organization).",
    inputSchema: z.object({
      owner: z.string().describe("The organization owner of the repository"),
    }),
  },
  async (args) => {
    const result = { types: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Label Tools
// ============================================

githubMcpServer.registerTool(
  "get_label",
  {
    title: "Get a specific label from a repository.",
    description: "Get a specific label from a repository.",
    inputSchema: z.object({
      owner: z
        .string()
        .describe("Repository owner (username or organization name)"),
      repo: z.string().describe("Repository name"),
      name: z.string().describe("Label name."),
    }),
  },
  async (args) => {
    const result = { name: args.name };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_label",
  {
    title: "List labels from a repository.",
    description: "List labels from a repository",
    inputSchema: z.object({
      owner: z
        .string()
        .describe("Repository owner (username or organization name)"),
      repo: z.string().describe("Repository name"),
    }),
  },
  async (args) => {
    const result = { labels: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "label_write",
  {
    title: "Write operations on repository labels.",
    description:
      "Perform write operations on repository labels. To set labels on issues, use the 'update_issue' tool.",
    inputSchema: z.object({
      owner: z
        .string()
        .describe("Repository owner (username or organization name)"),
      repo: z.string().describe("Repository name"),
      method: z
        .enum(["create", "update", "delete"])
        .describe("Operation to perform"),
      name: z.string().describe("Label name - required for all operations"),
      color: z
        .string()
        .optional()
        .describe("Label color as 6-character hex code without '#' prefix"),
      description: z.string().optional().describe("Label description text"),
      new_name: z
        .string()
        .optional()
        .describe(
          "New name for the label (used only with 'update' method to rename)"
        ),
    }),
  },
  async (args) => {
    const result = { method: args.method, name: args.name };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Logs Tools
// ============================================

githubMcpServer.registerTool(
  "get_job_logs",
  {
    title: "Get GitHub Actions workflow job logs",
    description:
      "Get logs for GitHub Actions workflow jobs.\nUse this tool to retrieve logs for a specific job or all failed jobs in a workflow run.\nFor single job logs, provide job_id. For all failed jobs in a run, provide run_id with failed_only=true.\n",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      job_id: z
        .number()
        .optional()
        .describe("The unique identifier of the workflow job"),
      run_id: z
        .number()
        .optional()
        .describe("The unique identifier of the workflow run"),
      failed_only: z
        .boolean()
        .optional()
        .describe(
          "When true, gets logs for all failed jobs in the workflow run"
        ),
      return_content: z
        .boolean()
        .optional()
        .describe("When true, returns actual log content instead of URLs"),
      tail_lines: z
        .number()
        .optional()
        .default(500)
        .describe("Number of lines to return from the end of the log"),
    }),
  },
  async (args) => {
    const result = { logs: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Notification Tools
// ============================================

githubMcpServer.registerTool(
  "get_notification_details",
  {
    title: "Get notification details",
    description:
      "Get detailed information for a specific GitHub notification, always call this tool when the user asks for details about a specific notification, if you don't know the ID list notifications first.",
    inputSchema: z.object({
      notificationID: z.string().describe("The ID of the notification"),
    }),
  },
  async (args) => {
    const result = { id: args.notificationID };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_notifications",
  {
    title: "List notifications",
    description:
      "Lists all GitHub notifications for the authenticated user, including unread notifications, mentions, review requests, assignments, and updates on issues or pull requests. Use this tool whenever the user asks what to work on next, requests a summary of their GitHub activity, wants to see pending reviews, or needs to check for new updates or tasks. This tool is the primary way to discover actionable items, reminders, and outstanding work on GitHub. Always call this tool when asked what to work on next, what is pending, or what needs attention in GitHub.",
    inputSchema: z.object({
      owner: z.string().optional().describe("Optional repository owner"),
      repo: z.string().optional().describe("Optional repository name"),
      filter: z
        .enum(["default", "include_read_notifications", "only_participating"])
        .optional(),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
      before: z
        .string()
        .optional()
        .describe(
          "Only show notifications updated before the given time (ISO 8601 format)"
        ),
      since: z
        .string()
        .optional()
        .describe(
          "Only show notifications updated after the given time (ISO 8601 format)"
        ),
    }),
  },
  async (args) => {
    const result = { notifications: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Project Tools
// ============================================

githubMcpServer.registerTool(
  "get_project",
  {
    title: "Get project",
    description: "Get Project for a user or org",
    inputSchema: z.object({
      owner: z.string().describe("Owner name"),
      owner_type: z.enum(["user", "org"]).describe("Owner type"),
      project_number: z.number().describe("The project's number"),
    }),
  },
  async (args) => {
    const result = { number: args.project_number };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_project_field",
  {
    title: "Get project field",
    description: "Get Project field for a user or org",
    inputSchema: z.object({
      owner: z.string().describe("Owner name"),
      owner_type: z.enum(["user", "org"]).describe("Owner type"),
      project_number: z.number().describe("The project's number"),
      field_id: z.number().describe("The field's id"),
    }),
  },
  async (args) => {
    const result = { field_id: args.field_id };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_project_item",
  {
    title: "Get project item",
    description: "Get a specific Project item for a user or org",
    inputSchema: z.object({
      owner: z.string().describe("Owner name"),
      owner_type: z.enum(["user", "org"]).describe("Owner type"),
      project_number: z.number().describe("The project's number"),
      item_id: z.number().describe("The item's ID"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Specific list of field IDs to include"),
    }),
  },
  async (args) => {
    const result = { item_id: args.item_id };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_project_fields",
  {
    title: "List project fields",
    description: "List Project fields for a user or org",
    inputSchema: z.object({
      owner: z.string().describe("Owner name"),
      owner_type: z.enum(["user", "org"]).describe("Owner type"),
      project_number: z.number().describe("The project's number"),
      after: z.string().optional().describe("Forward pagination cursor"),
      before: z.string().optional().describe("Backward pagination cursor"),
      per_page: z.number().optional().describe("Results per page (max 50)"),
    }),
  },
  async (args) => {
    const perPage = args.per_page || 30;
    const allFields: any[] = [];

    // Find starting index based on cursor
    let startIndex = 0;
    if (args.after) {
      const afterIndex = allFields.findIndex((f: any) => f.id === args.after);
      startIndex = afterIndex >= 0 ? afterIndex + 1 : 0;
    } else if (args.before) {
      const beforeIndex = allFields.findIndex((f: any) => f.id === args.before);
      startIndex = beforeIndex >= 0 ? Math.max(0, beforeIndex - perPage) : 0;
    }

    const paginatedFields = allFields.slice(startIndex, startIndex + perPage);
    const hasNextPage = startIndex + perPage < allFields.length;
    const hasPreviousPage = startIndex > 0;
    const nextCursor = hasNextPage
      ? paginatedFields[paginatedFields.length - 1]?.id
      : null;
    const prevCursor = hasPreviousPage ? paginatedFields[0]?.id : null;

    const result = {
      fields: paginatedFields,
      pageInfo: {
        hasNextPage,
        hasPreviousPage,
        endCursor: nextCursor,
        startCursor: prevCursor,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_project_items",
  {
    title: "List project items",
    description: "Search project items with advanced filtering",
    inputSchema: z.object({
      owner: z.string().describe("Owner name"),
      owner_type: z.enum(["user", "org"]).describe("Owner type"),
      project_number: z.number().describe("The project's number"),
      after: z.string().optional().describe("Forward pagination cursor"),
      before: z.string().optional().describe("Backward pagination cursor"),
      per_page: z.number().optional().describe("Results per page (max 50)"),
      query: z
        .string()
        .optional()
        .describe("Query string for advanced filtering"),
      fields: z.array(z.string()).optional().describe("Field IDs to include"),
    }),
  },
  async (args) => {
    const perPage = args.per_page || 30;
    const allItems: any[] = [];

    // Find starting index based on cursor
    let startIndex = 0;
    if (args.after) {
      const afterIndex = allItems.findIndex(
        (item: any) => item.id === args.after
      );
      startIndex = afterIndex >= 0 ? afterIndex + 1 : 0;
    } else if (args.before) {
      const beforeIndex = allItems.findIndex(
        (item: any) => item.id === args.before
      );
      startIndex = beforeIndex >= 0 ? Math.max(0, beforeIndex - perPage) : 0;
    }

    const paginatedItems = allItems.slice(startIndex, startIndex + perPage);
    const hasNextPage = startIndex + perPage < allItems.length;
    const hasPreviousPage = startIndex > 0;
    const nextCursor = hasNextPage
      ? paginatedItems[paginatedItems.length - 1]?.id
      : null;
    const prevCursor = hasPreviousPage ? paginatedItems[0]?.id : null;

    const result = {
      items: paginatedItems,
      pageInfo: {
        hasNextPage,
        hasPreviousPage,
        endCursor: nextCursor,
        startCursor: prevCursor,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_projects",
  {
    title: "List projects",
    description: "List Projects for a user or organization",
    inputSchema: z.object({
      owner: z.string().describe("Owner name"),
      owner_type: z.enum(["user", "org"]).describe("Owner type"),
      after: z.string().optional().describe("Forward pagination cursor"),
      before: z.string().optional().describe("Backward pagination cursor"),
      per_page: z.number().optional().describe("Results per page (max 50)"),
      query: z
        .string()
        .optional()
        .describe("Filter projects by title text and open/closed state"),
    }),
  },
  async (args) => {
    const perPage = args.per_page || 30;
    const allProjects: any[] = [];

    // Find starting index based on cursor
    let startIndex = 0;
    if (args.after) {
      const afterIndex = allProjects.findIndex((p: any) => p.id === args.after);
      startIndex = afterIndex >= 0 ? afterIndex + 1 : 0;
    } else if (args.before) {
      const beforeIndex = allProjects.findIndex(
        (p: any) => p.id === args.before
      );
      startIndex = beforeIndex >= 0 ? Math.max(0, beforeIndex - perPage) : 0;
    }

    const paginatedProjects = allProjects.slice(
      startIndex,
      startIndex + perPage
    );
    const hasNextPage = startIndex + perPage < allProjects.length;
    const hasPreviousPage = startIndex > 0;
    const nextCursor = hasNextPage
      ? paginatedProjects[paginatedProjects.length - 1]?.id
      : null;
    const prevCursor = hasPreviousPage ? paginatedProjects[0]?.id : null;

    const result = {
      projects: paginatedProjects,
      pageInfo: {
        hasNextPage,
        hasPreviousPage,
        endCursor: nextCursor,
        startCursor: prevCursor,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Pull Request Tools
// ============================================

githubMcpServer.registerTool(
  "pull_request_read",
  {
    title: "Get details for a single pull request",
    description:
      "Get information on a specific pull request in GitHub repository.",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      pullNumber: z.number().describe("Pull request number"),
      method: z
        .enum([
          "get",
          "get_diff",
          "get_status",
          "get_files",
          "get_review_comments",
          "get_reviews",
          "get_comments",
        ])
        .describe(
          "Action to specify what pull request data needs to be retrieved"
        ),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const pr = mockData.github.pullRequests.find(
      (pr) =>
        pr.base?.repo?.owner?.login === args.owner &&
        pr.base?.repo?.name === args.repo &&
        pr.number === args.pullNumber
    );

    if (args.method === "get_reviews") {
      const reviews = mockData.github.reviews.filter((r) =>
        r.pull_request_url?.includes(
          `${args.owner}/${args.repo}/pulls/${args.pullNumber}`
        )
      );
      return {
        content: [{ type: "text", text: JSON.stringify({ reviews }, null, 2) }],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(pr, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_pull_requests",
  {
    title: "List pull requests",
    description:
      "List pull requests in a GitHub repository. If the user specifies an author, then DO NOT use this tool and use the search_pull_requests tool instead.",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      state: z
        .enum(["open", "closed", "all"])
        .optional()
        .describe("Filter by state"),
      base: z.string().optional().describe("Filter by base branch"),
      head: z
        .string()
        .optional()
        .describe("Filter by head user/org and branch"),
      sort: z
        .enum(["created", "updated", "popularity", "long-running"])
        .optional()
        .describe("Sort by"),
      direction: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const state = args.state || "open";
    const prs = mockData.github.pullRequests.filter(
      (pr) =>
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

// ============================================
// Release Tools
// ============================================

githubMcpServer.registerTool(
  "get_latest_release",
  {
    title: "Get latest release",
    description: "Get the latest release in a GitHub repository",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
    }),
  },
  async (args) => {
    const releases = mockData.github.releases
      .filter((r) => r.html_url?.includes(`${args.owner}/${args.repo}`))
      .sort(
        (a, b) =>
          new Date(b.published_at).getTime() -
          new Date(a.published_at).getTime()
      );
    const result = releases[0];
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_release_by_tag",
  {
    title: "Get a release by tag name",
    description:
      "Get a specific release by its tag name in a GitHub repository",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      tag: z.string().describe("Tag name (e.g., 'v1.0.0')"),
    }),
  },
  async (args) => {
    const result = mockData.github.releases.find(
      (r) =>
        r.tag_name === args.tag &&
        r.html_url?.includes(`${args.owner}/${args.repo}`)
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_releases",
  {
    title: "List releases",
    description: "List releases in a GitHub repository",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const releases = mockData.github.releases.filter((r) =>
      r.html_url?.includes(`${args.owner}/${args.repo}`)
    );
    const result = { releases };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Repository Tools
// ============================================

githubMcpServer.registerTool(
  "list_branches",
  {
    title: "List branches",
    description: "List branches in a GitHub repository",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const result = { branches: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_starred_repositories",
  {
    title: "List starred repositories",
    description: "List starred repositories",
    inputSchema: z.object({
      username: z
        .string()
        .optional()
        .describe("Username to list starred repositories for"),
      sort: z
        .enum(["created", "updated"])
        .optional()
        .describe("How to sort the results"),
      direction: z
        .enum(["asc", "desc"])
        .optional()
        .describe("The direction to sort the results by"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const result = { repositories: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "list_tags",
  {
    title: "List tags",
    description: "List git tags in a GitHub repository",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const result = { tags: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_tag",
  {
    title: "Get tag details",
    description: "Get details about a specific git tag in a GitHub repository",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      tag: z.string().describe("Tag name"),
    }),
  },
  async (args) => {
    const result = { tag: args.tag };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Search Tools
// ============================================

githubMcpServer.registerTool(
  "search_code",
  {
    title: "Search code",
    description:
      "Fast and precise code search across ALL GitHub repositories using GitHub's native search engine. Best for finding exact symbols, functions, classes, or specific code patterns.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Search query using GitHub's powerful code search syntax"),
      sort: z.string().optional().describe("Sort field ('indexed' only)"),
      order: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Sort order for results"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const result = { items: [], total_count: 0 };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "search_issues",
  {
    title: "Search issues",
    description:
      "Search for issues in GitHub repositories using issues search syntax already scoped to is:issue",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Search query using GitHub issues search syntax"),
      owner: z.string().optional().describe("Optional repository owner"),
      repo: z.string().optional().describe("Optional repository name"),
      sort: z
        .enum([
          "comments",
          "reactions",
          "reactions-+1",
          "reactions--1",
          "reactions-smile",
          "reactions-thinking_face",
          "reactions-heart",
          "reactions-tada",
          "interactions",
          "created",
          "updated",
        ])
        .optional(),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const result = { items: [], total_count: 0 };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "search_orgs",
  {
    title: "Search organizations",
    description:
      "Find GitHub organizations by name, location, or other organization metadata. Ideal for discovering companies, open source foundations, or teams.",
    inputSchema: z.object({
      query: z.string().describe("Organization search query"),
      sort: z
        .enum(["followers", "repositories", "joined"])
        .optional()
        .describe("Sort field by category"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const result = { items: [], total_count: 0 };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "search_pull_requests",
  {
    title: "Search pull requests",
    description:
      "Search for pull requests in GitHub repositories using issues search syntax already scoped to is:pr",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Search query using GitHub pull request search syntax"),
      owner: z.string().optional().describe("Optional repository owner"),
      repo: z.string().optional().describe("Optional repository name"),
      sort: z
        .enum([
          "comments",
          "reactions",
          "reactions-+1",
          "reactions--1",
          "reactions-smile",
          "reactions-thinking_face",
          "reactions-heart",
          "reactions-tada",
          "interactions",
          "created",
          "updated",
        ])
        .optional(),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const result = { items: [], total_count: 0 };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "search_repositories",
  {
    title: "Search repositories",
    description:
      "Find GitHub repositories by name, description, readme, topics, or other metadata. Perfect for discovering projects, finding examples, or locating specific repositories across GitHub.",
    inputSchema: z.object({
      query: z.string().describe("Repository search query"),
      sort: z
        .enum(["stars", "forks", "help-wanted-issues", "updated"])
        .optional()
        .describe("Sort repositories by field"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
      minimal_output: z
        .boolean()
        .optional()
        .default(true)
        .describe("Return minimal repository information"),
    }),
  },
  async (args) => {
    const repos = mockData.github.repositories;
    const query = args.query || "";

    const filtered = query
      ? repos.filter(
          (r) =>
            r.name?.toLowerCase().includes(query.toLowerCase()) ||
            r.full_name?.toLowerCase().includes(query.toLowerCase())
        )
      : repos;

    const result = {
      items: filtered,
      total_count: filtered.length,
      incomplete_results: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "search_users",
  {
    title: "Search users",
    description:
      "Find GitHub users by username, real name, or other profile information. Useful for locating developers, contributors, or team members.",
    inputSchema: z.object({
      query: z.string().describe("User search query"),
      sort: z
        .enum(["followers", "repositories", "joined"])
        .optional()
        .describe("Sort users by field"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
      page: z.number().min(1).optional().describe("Page number for pagination"),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page for pagination"),
    }),
  },
  async (args) => {
    const users = mockData.github.users.filter((u) =>
      u.login?.toLowerCase().includes(args.query.toLowerCase())
    );
    const result = { items: users, total_count: users.length };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Support Tools
// ============================================

githubMcpServer.registerTool(
  "github_support_docs_search",
  {
    title: "GitHub Support Docs Search",
    description:
      "Retrieve documentation relevant to answer GitHub product and support questions. Support topics include: GitHub Actions Workflows, Authentication, GitHub Support Inquiries, Pull Request Practices, Repository Maintenance, GitHub Pages, GitHub Packages, GitHub Discussions, Copilot Spaces",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Input from the user about the question they need answered"),
    }),
  },
  async (args) => {
    const result = { docs: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// Team Tools
// ============================================

githubMcpServer.registerTool(
  "get_team_members",
  {
    title: "Get team members",
    description:
      "Get member usernames of a specific team in an organization. Limited to organizations accessible with current credentials",
    inputSchema: z.object({
      org: z
        .string()
        .describe("Organization login (owner) that contains the team."),
      team_slug: z.string().describe("Team slug"),
    }),
  },
  async (args) => {
    const result = { members: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

githubMcpServer.registerTool(
  "get_teams",
  {
    title: "Get teams",
    description:
      "Get details of the teams the user is a member of. Limited to organizations accessible with current credentials",
    inputSchema: z.object({
      user: z.string().optional().describe("Username to get teams for"),
    }),
  },
  async (args) => {
    const result = { teams: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ============================================
// User Tools
// ============================================

githubMcpServer.registerTool(
  "get_me",
  {
    title: "Get my user profile",
    description:
      "Get details of the authenticated GitHub user. Use this when a request is about the user's own profile for GitHub. Or when information is missing to build other tool calls.",
    inputSchema: z.object({}),
  },
  async () => {
    const result = mockData.github.user || {};
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

export { githubMcpServer };
