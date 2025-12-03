import { mcpClientManager } from "../../../mcp/client.js";
import {
  GitHubRepository,
  GitHubOrganization,
  GitHubIssue,
  GitHubPullRequest,
  GitHubWorkflow,
  GitHubWorkflowRun,
  GitHubWorkflowJob,
  GitHubRelease,
  GitHubCodeScanningAlert,
  GitHubDependabotAlert,
  GitHubSecretScanningAlert,
  GitHubDiscussion,
  GitHubComment,
  GitHubNotification,
  GitHubUser,
  GitHubCommit,
  GitHubReview,
  CreateIssueData,
  UpdateIssueData,
  CreatePullRequestData,
  UpdatePullRequestData,
  CreateReleaseData,
  CreateCommentData,
} from "./types.js";

/**
 * GitHub MCP Client wrapper for data extraction
 * Provides comprehensive GitHub integration including:
 * - Issue & PR Automation
 * - CI/CD & Workflow Intelligence
 * - Code Analysis & Security
 * - Team Collaboration
 */
export class GitHubMCPClient {
  private serverName = "github";
  private rateLimitDelay = 1000; // 1 second for GitHub API (3,600 requests/hour)

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
      if (response.isError) {
        console.warn(`MCP tool ${toolName} returned an error:`, textContent);
        throw new Error(
          "MCP tool error: " + (textContent?.text || "Unknown error")
        );
      } else if (textContent && textContent.text) {
        if (toolName === "list_code_scanning_alerts") {
          console.log(
            `MCP response for tool ${toolName}:`,
            textContent.text,
            response
          );
        }
        try {
          return JSON.parse(textContent.text) as T;
        } catch (error) {
          console.error("Failed to parse MCP response:", error);
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
   * Generic pagination handler for REST API (page-based)
   */
  private async fetchAllPages<T>(
    toolName: string,
    params: Record<string, any>,
    extractResults: (response: any) => T[]
  ): Promise<T[]> {
    const allResults: T[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response: any = await this.callTool(toolName, {
        ...params,
        page,
        perPage,
      });

      const results = extractResults(response);

      if (results.length === 0 || (results as any)?.total_count === 0) break;

      allResults.push(...results);

      // If we got less than perPage results, we're done
      if (results.length < perPage) break;

      page++;
    }

    return allResults;
  }

  /**
   * Generic pagination handler for GraphQL API (cursor-based)
   * Used for endpoints that return: { items: [], pageInfo: { endCursor, hasNextPage } }
   */
  private async fetchAllPagesCursor<T>(
    toolName: string,
    params: Record<string, any>,
    extractResults: (response: any) => T[]
  ): Promise<T[]> {
    const allResults: T[] = [];
    let after: string | undefined = undefined;

    while (true) {
      const requestParams: Record<string, any> = { ...params };
      if (after) {
        requestParams.after = after;
      }

      const response: any = await this.callTool(toolName, requestParams);

      const results = extractResults(response);
      if (Array.isArray(results) && results.length > 0) {
        allResults.push(...results);
      }

      // Check if there are more pages using pageInfo
      if (response.pageInfo && response.pageInfo.hasNextPage) {
        after = response.pageInfo.endCursor;
      } else {
        break;
      }

      // Safety check: if no results and no next page, break
      if (results.length === 0) break;
    }

    return allResults;
  }

  // ============================================
  // Repository & Organization Methods
  // ============================================

  /**
   * Get repository details
   */
  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return this.callTool<GitHubRepository>("search_repositories", {
      query: `repo:${owner}/${repo}`,
    });
  }

  async getMe(): Promise<GitHubUser> {
    return this.callTool<GitHubUser>("get_me", {});
  }

  /**
   * List repositories for an organization or user
   */
  async listRepositories(owner: string): Promise<GitHubRepository[]> {
    return this.fetchAllPages<GitHubRepository>(
      "search_repositories",
      { query: `user:${owner}`, minimal_output: false },
      (response) => response.items || []
    );
  }

  /**
   * Get organization details
   */
  async getOrganization(org: string): Promise<GitHubOrganization> {
    return this.callTool<GitHubOrganization>("search_repositories", {
      query: `org:${org}`,
    });
  }

  /**
   * Create a new repository
   */
  async createRepository(data: {
    name: string;
    description?: string;
    private?: boolean;
    auto_init?: boolean;
  }): Promise<GitHubRepository> {
    return this.callTool<GitHubRepository>("create_repository", data);
  }

  /**
   * Fork a repository
   */
  async forkRepository(
    owner: string,
    repo: string,
    organization?: string
  ): Promise<GitHubRepository> {
    const params: Record<string, any> = { owner, repo };
    if (organization) params.organization = organization;
    return this.callTool<GitHubRepository>("fork_repository", params);
  }

  /**
   * Create or update a file in a repository
   */
  async createOrUpdateFile(params: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch: string;
    sha?: string;
  }): Promise<any> {
    return this.callTool("create_or_update_file", params);
  }

  /**
   * Push multiple files to a repository in a single commit
   */
  async pushFiles(params: {
    owner: string;
    repo: string;
    branch: string;
    files: Array<{ path: string; content: string }>;
    message: string;
  }): Promise<any> {
    return this.callTool("push_files", params);
  }

  // ============================================
  // Issue Management Methods
  // ============================================

  /**
   * List issues in a repository
   */
  async listIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    return this.fetchAllPagesCursor<GitHubIssue>(
      "list_issues",
      { owner, repo },
      (response) => response.issues || []
    );
  }

  /**
   * Get a specific issue
   */
  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<GitHubIssue> {
    return this.callTool<GitHubIssue>("get_issue", {
      owner,
      repo,
      issue_number: issueNumber,
    });
  }

  /**
   * Create a new issue
   */
  async createIssue(
    owner: string,
    repo: string,
    data: CreateIssueData
  ): Promise<GitHubIssue> {
    return this.callTool<GitHubIssue>("create_issue", {
      owner,
      repo,
      ...data,
    });
  }

  /**
   * Update an existing issue
   */
  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    data: UpdateIssueData
  ): Promise<GitHubIssue> {
    return this.callTool<GitHubIssue>("update_issue", {
      owner,
      repo,
      issue_number: issueNumber,
      ...data,
    });
  }

  /**
   * Close an issue
   */
  async closeIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<GitHubIssue> {
    return this.updateIssue(owner, repo, issueNumber, { state: "closed" });
  }

  /**
   * Search issues across repositories
   */
  async searchIssues(query: string): Promise<GitHubIssue[]> {
    return this.fetchAllPages<GitHubIssue>(
      "search_issues",
      { query },
      (response) => response.items || []
    );
  }

  // ============================================
  // Pull Request Management Methods
  // ============================================

  /**
   * List pull requests in a repository
   */
  async listPullRequests(
    owner: string,
    repo: string,
    state: "open" | "closed" | "all" = "open"
  ): Promise<GitHubPullRequest[]> {
    return this.fetchAllPages<GitHubPullRequest>(
      "list_pull_requests",
      { owner, repo, state },
      (response) => response.pull_requests || response
    );
  }

  /**
   * Get a specific pull request
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubPullRequest> {
    return this.callTool<GitHubPullRequest>("get_pull_request", {
      owner,
      repo,
      pull_number: prNumber,
    });
  }

  /**
   * Create a new pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    data: CreatePullRequestData
  ): Promise<GitHubPullRequest> {
    return this.callTool<GitHubPullRequest>("create_pull_request", {
      owner,
      repo,
      ...data,
    });
  }

  /**
   * Update an existing pull request
   */
  async updatePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    data: UpdatePullRequestData
  ): Promise<GitHubPullRequest> {
    return this.callTool<GitHubPullRequest>("update_pull_request", {
      owner,
      repo,
      pull_number: prNumber,
      ...data,
    });
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    commitMessage?: string
  ): Promise<void> {
    await this.callTool("merge_pull_request", {
      owner,
      repo,
      pull_number: prNumber,
      commit_message: commitMessage,
    });
  }

  /**
   * List reviews for a pull request
   */
  async listPullRequestReviews(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubReview[]> {
    return this.fetchAllPages<GitHubReview>(
      "list_pull_request_reviews",
      { owner, repo, pull_number: prNumber },
      (response) => response.reviews || response
    );
  }

  // ============================================
  // Comment Management Methods
  // ============================================

  /**
   * List comments on an issue
   */
  async listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<GitHubComment[]> {
    return this.fetchAllPages<GitHubComment>(
      "list_issue_comments",
      { owner, repo, issue_number: issueNumber },
      (response) => response.comments || response
    );
  }

  /**
   * Create a comment on an issue
   */
  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<GitHubComment> {
    return this.callTool<GitHubComment>("create_issue_comment", {
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }

  /**
   * List comments on a pull request
   */
  async listPullRequestComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubComment[]> {
    return this.fetchAllPages<GitHubComment>(
      "list_pull_request_comments",
      { owner, repo, pull_number: prNumber },
      (response) => response.comments || response
    );
  }

  /**
   * Create a comment on a pull request
   */
  async createPullRequestComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<GitHubComment> {
    return this.callTool<GitHubComment>("create_pull_request_comment", {
      owner,
      repo,
      pull_number: prNumber,
      body,
    });
  }

  // ============================================
  // CI/CD & Workflow Methods
  // ============================================

  /**
   * List workflows in a repository
   */
  async listWorkflows(owner: string, repo: string): Promise<GitHubWorkflow[]> {
    const response: any = await this.callTool("list_workflows", {
      owner,
      repo,
    });
    return response.workflows || response;
  }

  /**
   * Get a specific workflow
   */
  async getWorkflow(
    owner: string,
    repo: string,
    workflowId: number | string
  ): Promise<GitHubWorkflow> {
    return this.callTool<GitHubWorkflow>("get_workflow", {
      owner,
      repo,
      workflow_id: workflowId,
    });
  }

  /**
   * List workflow runs
   */
  async listWorkflowRuns(
    owner: string,
    repo: string,
    workflowId?: number | string,
    status?: "queued" | "in_progress" | "completed"
  ): Promise<GitHubWorkflowRun[]> {
    const params: Record<string, any> = { owner, repo };
    if (workflowId) params.workflow_id = `${workflowId}`;
    if (status) params.status = status;

    return this.fetchAllPages<GitHubWorkflowRun>(
      "list_workflow_runs",
      params,
      (response) => response.workflow_runs || response
    );
  }

  /**
   * Get a specific workflow run
   */
  async getWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<GitHubWorkflowRun> {
    return this.callTool<GitHubWorkflowRun>("get_workflow_run", {
      owner,
      repo,
      run_id: runId,
    });
  }

  /**
   * List jobs for a workflow run
   */
  async listWorkflowJobs(
    owner: string,
    repo: string,
    runId: number
  ): Promise<GitHubWorkflowJob[]> {
    return this.fetchAllPages<GitHubWorkflowJob>(
      "list_workflow_jobs",
      { owner, repo, run_id: runId },
      (response) => response.jobs || response
    );
  }

  /**
   * Rerun a workflow
   */
  async rerunWorkflow(
    owner: string,
    repo: string,
    runId: number
  ): Promise<void> {
    await this.callTool("rerun_workflow", {
      owner,
      repo,
      run_id: runId,
    });
  }

  /**
   * Cancel a workflow run
   */
  async cancelWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<void> {
    await this.callTool("cancel_workflow_run", {
      owner,
      repo,
      run_id: runId,
    });
  }

  /**
   * Get workflow run logs
   */
  async getWorkflowRunLogs(
    owner: string,
    repo: string,
    runId: number
  ): Promise<string> {
    const response: any = await this.callTool("get_workflow_run_logs", {
      owner,
      repo,
      run_id: runId,
    });
    return response.logs || response;
  }

  // ============================================
  // Release Management Methods
  // ============================================

  /**
   * List releases in a repository
   */
  async listReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
    return this.fetchAllPages<GitHubRelease>(
      "list_releases",
      { owner, repo },
      (response) => response.releases || response
    );
  }

  /**
   * Get a specific release
   */
  async getRelease(
    owner: string,
    repo: string,
    releaseId: number
  ): Promise<GitHubRelease> {
    return this.callTool<GitHubRelease>("get_release", {
      owner,
      repo,
      release_id: releaseId,
    });
  }

  /**
   * Get the latest release
   */
  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease> {
    return this.callTool<GitHubRelease>("get_latest_release", {
      owner,
      repo,
    });
  }

  /**
   * Create a new release
   */
  async createRelease(
    owner: string,
    repo: string,
    data: CreateReleaseData
  ): Promise<GitHubRelease> {
    return this.callTool<GitHubRelease>("create_release", {
      owner,
      repo,
      ...data,
    });
  }

  // ============================================
  // Code Analysis & Security Methods
  // ============================================

  /**
   * List code scanning alerts
   */
  async listCodeScanningAlerts(
    owner: string,
    repo: string
  ): Promise<GitHubCodeScanningAlert[]> {
    const params: Record<string, any> = { owner, repo };

    return this.fetchAllPages<GitHubCodeScanningAlert>(
      "list_code_scanning_alerts",
      params,
      (response) => response.alerts || response
    );
  }

  /**
   * Get a specific code scanning alert
   */
  async getCodeScanningAlert(
    owner: string,
    repo: string,
    alertNumber: number
  ): Promise<GitHubCodeScanningAlert> {
    return this.callTool<GitHubCodeScanningAlert>("get_code_scanning_alert", {
      owner,
      repo,
      alert_number: alertNumber,
    });
  }

  /**
   * Update a code scanning alert
   */
  async updateCodeScanningAlert(
    owner: string,
    repo: string,
    alertNumber: number,
    state: "open" | "dismissed",
    dismissedReason?: "false positive" | "won't fix" | "used in tests"
  ): Promise<GitHubCodeScanningAlert> {
    return this.callTool<GitHubCodeScanningAlert>(
      "update_code_scanning_alert",
      {
        owner,
        repo,
        alert_number: alertNumber,
        state,
        dismissed_reason: dismissedReason,
      }
    );
  }

  /**
   * List Dependabot alerts
   */
  async listDependabotAlerts(
    owner: string,
    repo: string,
    state?: "auto_dismissed" | "dismissed" | "fixed" | "open"
  ): Promise<GitHubDependabotAlert[]> {
    const params: Record<string, any> = { owner, repo };
    if (state) params.state = state;

    return this.fetchAllPages<GitHubDependabotAlert>(
      "list_dependabot_alerts",
      params,
      (response) => response.alerts || response
    );
  }

  /**
   * Get a specific Dependabot alert
   */
  async getDependabotAlert(
    owner: string,
    repo: string,
    alertNumber: number
  ): Promise<GitHubDependabotAlert> {
    return this.callTool<GitHubDependabotAlert>("get_dependabot_alert", {
      owner,
      repo,
      alert_number: alertNumber,
    });
  }

  /**
   * Update a Dependabot alert
   */
  async updateDependabotAlert(
    owner: string,
    repo: string,
    alertNumber: number,
    state: "dismissed" | "open",
    dismissedReason?:
      | "fix_started"
      | "inaccurate"
      | "no_bandwidth"
      | "not_used"
      | "tolerable_risk"
  ): Promise<GitHubDependabotAlert> {
    return this.callTool<GitHubDependabotAlert>("update_dependabot_alert", {
      owner,
      repo,
      alert_number: alertNumber,
      state,
      dismissed_reason: dismissedReason,
    });
  }

  /**
   * List secret scanning alerts
   */
  async listSecretScanningAlerts(
    owner: string,
    repo: string,
    state?: "open" | "resolved"
  ): Promise<GitHubSecretScanningAlert[]> {
    const params: Record<string, any> = { owner, repo };
    if (state) params.state = state;

    return this.fetchAllPages<GitHubSecretScanningAlert>(
      "list_secret_scanning_alerts",
      params,
      (response) => response.alerts || response
    );
  }

  // ============================================
  // Team Collaboration Methods
  // ============================================

  /**
   * List discussions in a repository
   */
  async listDiscussions(
    owner: string,
    repo: string
  ): Promise<GitHubDiscussion[]> {
    return this.fetchAllPagesCursor<GitHubDiscussion>(
      "list_discussions",
      { owner, repo },
      (response) => response.discussions || response
    );
  }

  /**
   * Get a specific discussion
   */
  async getDiscussion(
    owner: string,
    repo: string,
    discussionNumber: number
  ): Promise<GitHubDiscussion> {
    return this.callTool<GitHubDiscussion>("get_discussion", {
      owner,
      repo,
      discussion_number: discussionNumber,
    });
  }

  /**
   * List notifications for the authenticated user
   */
  async listNotifications(
    all: boolean = false,
    participating: boolean = false
  ): Promise<GitHubNotification[]> {
    return this.fetchAllPages<GitHubNotification>(
      "list_notifications",
      { all, participating },
      (response) => response.notifications || response
    );
  }

  /**
   * Mark a notification as read
   */
  async markNotificationAsRead(notificationId: string): Promise<void> {
    await this.callTool("mark_notification_as_read", {
      notification_id: notificationId,
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsAsRead(): Promise<void> {
    await this.callTool("mark_all_notifications_as_read", {});
  }

  // ============================================
  // Commit & Code Methods
  // ============================================

  /**
   * List commits in a repository
   */
  async listCommits(
    owner: string,
    repo: string,
    sha?: string,
    path?: string
  ): Promise<GitHubCommit[]> {
    const params: Record<string, any> = { owner, repo };
    if (sha) params.sha = sha;
    if (path) params.path = path;

    return this.fetchAllPages<GitHubCommit>(
      "list_commits",
      params,
      (response) => response.commits || response
    );
  }

  /**
   * Get a specific commit
   */
  async getCommit(
    owner: string,
    repo: string,
    ref: string
  ): Promise<GitHubCommit> {
    return this.callTool<GitHubCommit>("get_commit", {
      owner,
      repo,
      ref,
    });
  }

  /**
   * Get file contents
   */
  async getFileContents(
    owner: string,
    repo: string,
    path: string,
    branch?: string
  ): Promise<string> {
    const params: Record<string, any> = { owner, repo, path };
    if (branch) params.branch = branch;

    const response: any = await this.callTool("get_file_contents", params);
    return response.content || response;
  }

  /**
   * Search code in repositories
   */
  async searchCode(query: string): Promise<any[]> {
    return this.fetchAllPages<any>(
      "search_code",
      { query },
      (response) => response.items || []
    );
  }

  // ============================================
  // User Methods
  // ============================================

  /**
   * Get authenticated user
   */
  async getAuthenticatedUser(): Promise<GitHubUser> {
    return this.callTool<GitHubUser>("get_authenticated_user", {});
  }

  /**
   * Get a specific user
   */
  async getUser(username: string): Promise<GitHubUser> {
    return this.callTool<GitHubUser>("search_users", {
      query: `user:${username}`,
    });
  }

  /**
   * Search users on GitHub
   */
  async searchUsers(query: string): Promise<GitHubUser[]> {
    return this.fetchAllPages<GitHubUser>(
      "search_users",
      { query },
      (response) => response.items || []
    );
  }

  /**
   * List organization members
   */
  async listOrganizationMembers(org: string): Promise<GitHubUser[]> {
    return this.fetchAllPages<GitHubUser>(
      "search_users",
      { query: `org:${org}` },
      (response) => response.items || []
    );
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Set custom rate limit delay
   */
  setRateLimitDelay(delayMs: number): void {
    this.rateLimitDelay = delayMs;
  }

  /**
   * Get current rate limit status
   */
  async getRateLimit(): Promise<any> {
    return this.callTool("get_rate_limit", {});
  }
}
