import { BaseRecordAdapter } from "./base-adapter.js";
import { Record } from "../../../models/record.model.js";
import { EntityRelationship, FetchOptions } from "../../../types/index.js";
import {
  GitHubRecord,
  GitHubRepository,
  GitHubIssue,
  GitHubPullRequest,
  GitHubWorkflow,
  GitHubWorkflowRun,
  GitHubRelease,
  GitHubDiscussion,
  GitHubCodeScanningAlert,
  GitHubDependabotAlert,
  GitHubAdapterConfig,
} from "@ebee-oss/shared-util";
import { GitHubMCPClient } from "../../sources/github/mcpClient.js";
import pLimit from "p-limit";

const REPO_CONCURRENCY = 3; // Process 3 repositories concurrently

/**
 * GitHub adapter for syncing GitHub records
 * Supports: repositories, issues, PRs, workflows, releases, discussions, security alerts
 */
export class GitHubAdapter extends BaseRecordAdapter<Record> {
  readonly source = "github" as const;
  readonly supportedRecordTypes = [
    "repository",
    "issue",
    "pull_request",
    "release",
    "discussion",
    "code_scanning_alert",
    "user",
  ];

  constructor(
    private client: GitHubMCPClient,
    private config: GitHubAdapterConfig
  ) {
    super();
  }

  /**
   * Fetch all records from GitHub
   */
  async *fetchAll(options?: FetchOptions): AsyncIterable<Record[]> {
    const batchSize = options?.batchSize || 100;
    const user = await this.client.getMe();
    if (!user) {
      throw new Error("Failed to fetch authenticated user info from GitHub");
    }
    const repos = await this.getRepositoriesToSync(user.login);

    // Fetch repositories
    const transformedRepos = repos.map((repo) =>
      this.transformRepository(repo)
    );
    for (let i = 0; i < transformedRepos.length; i += batchSize) {
      yield transformedRepos.slice(i, i + batchSize);
    }

    // Process repositories in parallel with controlled concurrency
    const limit = pLimit(REPO_CONCURRENCY);
    const repoPromises = repos.map((repo) =>
      limit(async () => {
        const owner = repo.owner.login;
        const repoName = repo.name;
        const allRecords: Record[] = [];

        // Fetch issues
        try {
          const issues = await this.client.listIssues(owner, repoName);
          const transformedIssues = issues.map((issue) =>
            this.transformIssue(issue)
          );
          allRecords.push(...transformedIssues);
        } catch (error) {
          console.warn(
            `Failed to fetch issues for ${owner}/${repoName}:`,
            error
          );
        }

        // Fetch pull requests
        try {
          const prs = await this.client.listPullRequests(
            owner,
            repoName,
            "all"
          );
          const transformedPRs = prs.map((pr) => this.transformPullRequest(pr));
          allRecords.push(...transformedPRs);
        } catch (error) {
          console.warn(`Failed to fetch PRs for ${owner}/${repoName}:`, error);
        }

        // Fetch releases
        try {
          const releases = await this.client.listReleases(owner, repoName);
          const transformedReleases = releases.map((release) =>
            this.transformRelease(release)
          );
          allRecords.push(...transformedReleases);
        } catch (error) {
          console.warn(
            `Failed to fetch releases for ${owner}/${repoName}:`,
            error
          );
        }

        // Fetch discussions
        try {
          const discussions = await this.client.listDiscussions(
            owner,
            repoName
          );
          const transformedDiscussions = discussions.map((discussion) =>
            this.transformDiscussion(discussion)
          );
          allRecords.push(...transformedDiscussions);
        } catch (error) {
          console.warn(
            `Failed to fetch discussions for ${owner}/${repoName}:`,
            error
          );
        }

        return allRecords;
      })
    );

    // Wait for all repos and yield results in batches
    const allRepoRecords = await Promise.all(repoPromises);
    for (const repoRecords of allRepoRecords) {
      for (let i = 0; i < repoRecords.length; i += batchSize) {
        yield repoRecords.slice(i, i + batchSize);
      }
    }
  }

  /**
   * Fetch records modified since timestamp
   */
  async *fetchIncremental(
    since: Date,
    _cursor?: string
  ): AsyncIterable<Record[]> {
    const user = await this.client.getMe();
    const repos = await this.getRepositoriesToSync(user.login);

    // Process repositories in parallel
    const limit = pLimit(REPO_CONCURRENCY);
    const repoPromises = repos.map((repo) =>
      limit(async () => {
        const owner = repo.owner.login;
        const repoName = repo.name;
        const allRecords: Record[] = [];

        // Fetch recently updated issues
        try {
          const issues = await this.client.listIssues(owner, repoName);
          const recentIssues = issues.filter(
            (issue) => new Date(issue.updated_at) > since
          );
          const transformedIssues = recentIssues.map((issue) =>
            this.transformIssue(issue)
          );
          allRecords.push(...transformedIssues);
        } catch (error) {
          console.warn(
            `Failed to fetch recent issues for ${owner}/${repoName}:`,
            error
          );
        }

        // Fetch recently updated PRs
        try {
          const prs = await this.client.listPullRequests(
            owner,
            repoName,
            "all"
          );
          const recentPRs = prs.filter((pr) => new Date(pr.updated_at) > since);
          const transformedPRs = recentPRs.map((pr) =>
            this.transformPullRequest(pr)
          );
          allRecords.push(...transformedPRs);
        } catch (error) {
          console.warn(
            `Failed to fetch recent PRs for ${owner}/${repoName}:`,
            error
          );
        }

        return allRecords;
      })
    );

    // Wait for all repos and yield results
    const allResults = await Promise.all(repoPromises);
    for (const records of allResults) {
      if (records.length > 0) {
        yield records;
      }
    }
  }

  /**
   * Transform GitHub record to unified format
   */
  async transform(sourceRecord: Record): Promise<Record> {
    // Transform is now done in fetchAll/fetchIncremental
    // This method just passes through the already-transformed record
    return sourceRecord;
  }

  /**
   * Extract relationships from GitHub record
   */
  async extractRelationships(
    sourceRecord: Record
  ): Promise<EntityRelationship[]> {
    // Extract from rawData which contains the original GitHub record
    const githubRecord = sourceRecord.rawData as GitHubRecord;
    const relationships: EntityRelationship[] = [];
    const recordType = sourceRecord.recordType;
    const sourceId = sourceRecord.sourceId;
    const recordId = this.generateRecordId(recordType, sourceId);

    // Repository relationships
    if (recordType === "repository") {
      const repo = githubRecord as GitHubRepository;
      // Owner relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", repo.owner.login),
        type: "OWNED_BY",
        confidence: 1.0,
      });
    }

    // Issue relationships
    if (recordType === "issue") {
      const issue = githubRecord as GitHubIssue;
      const repoId = this.extractRepoIdFromUrl(issue.repository_url);

      // Repository relationship
      if (repoId) {
        relationships.push({
          sourceId: recordId,
          targetId: repoId,
          type: "ISSUE_IN_REPO",
          confidence: 1.0,
        });
      }

      // Author relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", issue.user.login),
        type: "CREATED_BY",
        confidence: 1.0,
      });

      // Assignee relationships
      issue.assignees?.forEach((assignee) => {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId("user", assignee.login),
          type: "ASSIGNED_TO",
          confidence: 1.0,
        });
      });

      // Milestone relationship
      if (issue.milestone) {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId(
            "milestone",
            issue.milestone.id.toString()
          ),
          type: "MILESTONE_OF",
          confidence: 1.0,
        });
      }
    }

    // Pull Request relationships
    if (recordType === "pull_request") {
      const pr = githubRecord as GitHubPullRequest;
      const repoId = this.generateRecordId(
        "repository",
        `${pr.base.repo.owner.login}_${pr.base.repo.name}`
      );

      // Repository relationship
      relationships.push({
        sourceId: recordId,
        targetId: repoId,
        type: "PR_IN_REPO",
        confidence: 1.0,
      });

      // Author relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", pr.user.login),
        type: "CREATED_BY",
        confidence: 1.0,
      });

      // Assignee relationships
      pr.assignees?.forEach((assignee) => {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId("user", assignee.login),
          type: "ASSIGNED_TO",
          confidence: 1.0,
        });
      });

      // Reviewer relationships
      pr.requested_reviewers?.forEach((reviewer) => {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId("user", reviewer.login),
          type: "REVIEWED_BY",
          confidence: 0.8,
        });
      });

      // Extract "fixes #123" from PR body
      if (pr.body) {
        const fixesPattern =
          /(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+#(\d+)/gi;
        let match;
        while ((match = fixesPattern.exec(pr.body)) !== null) {
          const issueNumber = match[1];
          relationships.push({
            sourceId: recordId,
            targetId: this.generateRecordId(
              "issue",
              `${pr.base.repo.owner.login}_${pr.base.repo.name}_${issueNumber}`
            ),
            type: "FIXES",
            confidence: 0.9,
          });
        }
      }
    }

    // Workflow relationships
    if (recordType === "workflow") {
      const workflow = githubRecord as GitHubWorkflow;
      const repoId = this.extractRepoIdFromUrl(workflow.url);

      if (repoId) {
        relationships.push({
          sourceId: recordId,
          targetId: repoId,
          type: "WORKFLOW_IN_REPO",
          confidence: 1.0,
        });
      }
    }

    // Workflow Run relationships
    if (recordType === "workflow_run") {
      const run = githubRecord as GitHubWorkflowRun;

      // Workflow relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId(
          "workflow",
          `${run.repository.owner.login}_${run.repository.name}_${run.workflow_id}`
        ),
        type: "RUN_OF_WORKFLOW",
        confidence: 1.0,
      });

      // Repository relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId(
          "repository",
          `${run.repository.owner.login}_${run.repository.name}`
        ),
        type: "RUN_IN_REPO",
        confidence: 1.0,
      });

      // Actor relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", run.actor.login),
        type: "TRIGGERED_BY",
        confidence: 1.0,
      });
    }

    // Security Alert relationships
    if (
      recordType === "code_scanning_alert" ||
      recordType === "dependabot_alert"
    ) {
      const alert = githubRecord as
        | GitHubCodeScanningAlert
        | GitHubDependabotAlert;
      const repoId = this.extractRepoIdFromUrl(alert.url);

      if (repoId) {
        relationships.push({
          sourceId: recordId,
          targetId: repoId,
          type: "ALERT_IN_REPO",
          confidence: 1.0,
        });
      }
    }

    // Discussion relationships
    if (recordType === "discussion") {
      const discussion = githubRecord as GitHubDiscussion;
      const repoId = this.extractRepoIdFromUrl(discussion.repository_url);

      if (repoId) {
        relationships.push({
          sourceId: recordId,
          targetId: repoId,
          type: "DISCUSSION_IN_REPO",
          confidence: 1.0,
        });
      }

      // Author relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", discussion.user.login),
        type: "CREATED_BY",
        confidence: 1.0,
      });

      // Answer relationship
      if (discussion.answer_chosen_by) {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId(
            "user",
            discussion.answer_chosen_by.login
          ),
          type: "ANSWERED_BY",
          confidence: 1.0,
        });
      }
    }

    return relationships;
  }

  /**
   * Get deleted records (GitHub doesn't provide this directly)
   */
  async *getDeletedRecords(_since: Date): AsyncIterable<string[]> {
    // GitHub doesn't have a direct API for deleted records
    // We would need to track this ourselves or fetch all and compare
    yield [];
  }

  // ============================================
  // Private Transform Methods
  // ============================================

  /**
   * Transform GitHub repository to unified Record format
   */
  private transformRepository(repo: GitHubRepository): Record {
    const sourceId = repo.id.toString() || repo.name;
    const _id = this.generateRecordId("repository", sourceId);

    const title = repo.full_name;
    const content = [
      title,
      repo.description || "",
      `Language: ${repo.language || "N/A"}`,
      `Topics: ${repo.topics?.length ? repo.topics.join(", ") : ""}`,
    ]
      .filter(Boolean)
      .join("\n");

    const people = [repo.owner.login];
    const primaryDate = new Date(repo.created_at);

    const tags: string[] = [];
    if (repo.topics?.length) tags.push(...repo.topics);
    if (repo.language) tags.push(repo.language);
    if (repo.private) tags.push("private");
    if (repo.archived) tags.push("archived");
    if (repo.fork) tags.push("fork");

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType: "repository",
      title,
      content,
      people,
      primaryDate,
      tags,
      rawData: repo,
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: new Date(repo.updated_at),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  /**
   * Transform GitHub issue to unified Record format
   */
  private transformIssue(issue: GitHubIssue): Record {
    const sourceId = issue.id.toString() || issue.number.toString();
    const _id = this.generateRecordId("issue", sourceId);

    const title = `#${issue.number}: ${issue.title}`;
    const content = [title, issue.body || ""].filter(Boolean).join("\n\n");

    const people = [issue.user.login];
    issue.assignees?.forEach((a) => people.push(a.login));

    const primaryDate = new Date(issue.created_at);

    const tags = [...(issue.labels?.map((l) => l.name) || []), issue.state];

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType: "issue",
      title,
      content,
      people: [...new Set(people)],
      primaryDate,
      tags,
      rawData: issue,
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: new Date(issue.updated_at),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  /**
   * Transform GitHub pull request to unified Record format
   */
  private transformPullRequest(pr: GitHubPullRequest): Record {
    const sourceId = pr.id.toString() || pr.number.toString();
    const _id = this.generateRecordId("pull_request", sourceId);

    const title = `PR #${pr.number}: ${pr.title}`;
    const content = [title, pr.body || ""].filter(Boolean).join("\n\n");

    const people = [pr.user.login];
    pr.assignees?.forEach((a) => people.push(a.login));
    pr.requested_reviewers?.forEach((r) => people.push(r.login));
    if (pr.merged_by) people.push(pr.merged_by.login);

    const primaryDate = new Date(pr.created_at);

    const tags = [...(pr.labels?.map((l) => l.name) || []), pr.state];
    if (pr.draft) tags.push("draft");
    if (pr.merged) tags.push("merged");

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType: "pull_request",
      title,
      content,
      people: [...new Set(people)],
      primaryDate,
      tags,
      rawData: pr,
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: new Date(pr.updated_at),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  /**
   * Transform GitHub release to unified Record format
   */
  private transformRelease(release: GitHubRelease): Record {
    const sourceId = (release as any).id?.toString() || "unknown";
    const _id = this.generateRecordId("release", sourceId);

    const title = release.name || release.tag_name;
    const content = [title, release.body || ""].filter(Boolean).join("\n\n");

    const people = [release.author.login];
    const primaryDate = new Date(release.published_at);

    const tags: string[] = [];
    if (release.draft) tags.push("draft");
    if (release.prerelease) tags.push("prerelease");

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType: "release",
      title,
      content,
      people,
      primaryDate,
      tags,
      rawData: release,
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: new Date(release.published_at),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  /**
   * Transform GitHub discussion to unified Record format
   */
  private transformDiscussion(discussion: GitHubDiscussion): Record {
    const sourceId = discussion.id.toString() || discussion.number.toString();
    const _id = this.generateRecordId("discussion", sourceId);

    const title = discussion.title;
    const content = [discussion.title, discussion.body]
      .filter(Boolean)
      .join("\n\n");

    const people = [discussion.user.login];
    if (discussion.answer_chosen_by) {
      people.push(discussion.answer_chosen_by.login);
    }

    const primaryDate = new Date(discussion.created_at);

    const tags = [discussion.state, discussion.category.name];

    const record: Record = {
      _id,
      source: this.source,
      sourceId,
      recordType: "discussion",
      title,
      content,
      people: [...new Set(people)],
      primaryDate,
      tags,
      rawData: discussion,
      checksum: "",
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: new Date(discussion.updated_at),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    record.checksum = this.computeChecksum(record);
    return record;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Get repositories to sync based on configuration
   */
  private async getRepositoriesToSync(
    user: string
  ): Promise<GitHubRepository[]> {
    // Fetch all repositories for the owner
    const allRepos = await this.client.listRepositories(user);

    // Filter based on configuration
    return allRepos.filter((repo) => {
      if (!this.config.includeArchived && repo.archived) return false;
      if (!this.config.includeForks && repo.fork) return false;
      if (!this.config.includePrivate && repo.private) return false;
      return true;
    });
  }

  /**
   * Extract repository ID from GitHub API URL
   */
  private extractRepoIdFromUrl(url: string): string | null {
    try {
      const parts = url.split("/");
      const reposIndex = parts.indexOf("repos");
      if (reposIndex >= 0 && parts.length > reposIndex + 2) {
        const owner = parts[reposIndex + 1];
        const repo = parts[reposIndex + 2];
        return this.generateRecordId("repository", `${owner}_${repo}`);
      }
    } catch (error) {
      console.warn("Failed to extract repo ID from URL:", url, error);
    }
    return null;
  }
}
