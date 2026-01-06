import { mcpClientManager } from "../../../mcp/client.js";
import logger from "../../../utils/logger.js";
import {
  GitHubRepository,
  GitHubIssue,
  GitHubPullRequest,
  GitHubRelease,
  GitHubCodeScanningAlert,
  GitHubDependabotAlert,
  GitHubSecretScanningAlert,
  GitHubDiscussion,
  GitHubComment,
  GitHubUser,
  GitHubReview,
} from "@ebee-oss/shared-util";

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

    if (response && response.content && Array.isArray(response.content)) {
      const textContent = response.content.find((c: any) => c.type === "text");
      if (response.isError) {
        console.warn(`MCP tool ${toolName} returned an error:`, textContent);
        throw new Error(
          "MCP tool error: " + (textContent?.text || "Unknown error")
        );
      } else if (textContent && textContent.text) {
        try {
          return JSON.parse(textContent.text) as T;
        } catch (err) {
          logger.error({ err }, "Failed to parse MCP response:");
          throw new Error(
            `Invalid JSON in MCP response: ${textContent.text.substring(
              0,
              100
            )}...`
          );
        }
      }
    }

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

    let results: T[] = [];
    do {
      const response: any = await this.callTool(toolName, {
        ...params,
        page,
        perPage,
      });

      results = extractResults(response);

      if (results.length === 0 || (results as any)?.total_count === 0) break;

      allResults.push(...results);

      if (results.length < perPage) break;

      page++;
    } while (results.length === 0 || results.length < perPage);

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

      if (response.pageInfo && response.pageInfo.hasNextPage) {
        after = response.pageInfo.endCursor;
      } else {
        break;
      }

      if (results.length === 0) break;
    }

    return allResults;
  }

  // ============================================
  // Repository & Organization Methods
  // ============================================

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
}
