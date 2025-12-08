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
  GitHubUser,
  GitHubAdapterConfig,
} from "../../sources/github/types.js";
import { GitHubMCPClient } from "../../sources/github/mcpClient.js";

/**
 * GitHub adapter for syncing GitHub records
 * Supports: repositories, issues, PRs, workflows, releases, discussions, security alerts
 */
export class GitHubAdapter extends BaseRecordAdapter<GitHubRecord> {
  readonly source = "github" as const;
  readonly supportedRecordTypes = [
    "repository",
    "issue",
    "pull_request",
    "workflow",
    "workflow_run",
    "release",
    "discussion",
    "code_scanning_alert",
    "dependabot_alert",
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
  async *fetchAll(options?: FetchOptions): AsyncIterable<GitHubRecord[]> {
    const batchSize = options?.batchSize || 100;
    const user = await this.client.getMe();
    // Determine which repositories to sync
    if (!user) {
      throw new Error("Failed to fetch authenticated user info from GitHub");
    }
    const repos = await this.getRepositoriesToSync(user.login);

    // Fetch users (organization members)
    try {
      const users = await this.client.listOrganizationMembers(user.login);
      yield users as GitHubRecord[];
    } catch (error) {
      console.warn("Failed to fetch organization members:", error);
    }

    // Fetch repositories
    for (let i = 0; i < repos.length; i += batchSize) {
      yield repos.slice(i, i + batchSize) as GitHubRecord[];
    }

    // For each repository, fetch related entities
    for (const repo of repos) {
      const owner = repo.owner.login;

      const repoName = repo.name;
      // // Fetch issues
      try {
        const issues = await this.client.listIssues(owner, repoName);
        for (let i = 0; i < issues.length; i += batchSize) {
          yield issues.slice(i, i + batchSize) as GitHubRecord[];
        }
      } catch (error) {
        console.warn(`Failed to fetch issues for ${owner}/${repoName}:`, error);
      }

      // Fetch pull requests
      try {
        const prs = await this.client.listPullRequests(owner, repoName, "all");
        for (let i = 0; i < prs.length; i += batchSize) {
          yield prs.slice(i, i + batchSize) as GitHubRecord[];
        }
      } catch (error) {
        console.warn(`Failed to fetch PRs for ${owner}/${repoName}:`, error);
      }

      // Fetch workflows
      try {
        const workflows = await this.client.listWorkflows(owner, repoName);

        if (workflows.length > 0) {
          yield workflows as GitHubRecord[];

          for (const workflow of workflows) {
            // Fetch recent workflow runs
            const runs = await this.client.listWorkflowRuns(
              owner,
              repoName,
              workflow.id
            );
            for (let i = 0; i < runs.length; i += batchSize) {
              yield runs.slice(i, i + batchSize) as GitHubRecord[];
            }
          }
        }
      } catch (error) {
        console.warn(
          `Failed to fetch workflows for ${owner}/${repoName}:`,
          error
        );
      }

      // Fetch releases
      try {
        const releases = await this.client.listReleases(owner, repoName);
        for (let i = 0; i < releases.length; i += batchSize) {
          yield releases.slice(i, i + batchSize) as GitHubRecord[];
        }
      } catch (error) {
        console.warn(
          `Failed to fetch releases for ${owner}/${repoName}:`,
          error
        );
      }

      // Fetch discussions
      try {
        const discussions = await this.client.listDiscussions(owner, repoName);
        for (let i = 0; i < discussions.length; i += batchSize) {
          yield discussions.slice(i, i + batchSize) as GitHubRecord[];
        }
      } catch (error) {
        console.warn(
          `Failed to fetch discussions for ${owner}/${repoName}:`,
          error
        );
      }

      // Fetch security alerts
      try {
        const codeScanningAlerts = await this.client.listCodeScanningAlerts(
          owner,
          repoName
        );

        for (let i = 0; i < codeScanningAlerts.length; i += batchSize) {
          yield codeScanningAlerts.slice(i, i + batchSize) as GitHubRecord[];
        }
      } catch (error) {
        console.warn(
          `Failed to fetch code scanning alerts for ${owner}/${repoName}:`,
          error
        );
      }

      try {
        const dependabotAlerts = await this.client.listDependabotAlerts(
          owner,
          repoName
        );

        for (let i = 0; i < dependabotAlerts.length; i += batchSize) {
          yield dependabotAlerts.slice(i, i + batchSize) as GitHubRecord[];
        }
      } catch (error) {
        console.warn(
          `Failed to fetch Dependabot alerts for ${owner}/${repoName}:`,
          error
        );
      }
    }
  }

  /**
   * Fetch records modified since timestamp
   */
  async *fetchIncremental(
    since: Date,
    _cursor?: string
  ): AsyncIterable<GitHubRecord[]> {
    const user = await this.client.getMe();

    const repos = await this.getRepositoriesToSync(user.login);

    for (const repo of repos) {
      const owner = repo.owner.login;
      const repoName = repo.name;

      // Fetch recently updated issues
      try {
        const issues = await this.client.listIssues(owner, repoName);
        const recentIssues = issues.filter(
          (issue) => new Date(issue.updated_at) > since
        );
        if (recentIssues.length > 0) {
          yield recentIssues as GitHubRecord[];
        }
      } catch (error) {
        console.warn(
          `Failed to fetch recent issues for ${owner}/${repoName}:`,
          error
        );
      }

      // Fetch recently updated PRs
      try {
        const prs = await this.client.listPullRequests(owner, repoName, "all");
        const recentPRs = prs.filter((pr) => new Date(pr.updated_at) > since);
        if (recentPRs.length > 0) {
          yield recentPRs as GitHubRecord[];
        }
      } catch (error) {
        console.warn(
          `Failed to fetch recent PRs for ${owner}/${repoName}:`,
          error
        );
      }

      // Fetch recent workflow runs
      try {
        const runs = await this.client.listWorkflowRuns(owner, repoName);
        const recentRuns = runs.filter(
          (run) => new Date(run.updated_at) > since
        );
        if (recentRuns.length > 0) {
          yield recentRuns as GitHubRecord[];
        }
      } catch (error) {
        console.warn(
          `Failed to fetch recent workflow runs for ${owner}/${repoName}:`,
          error
        );
      }
    }
  }

  /**
   * Fetch single record by ID
   */
  async fetchById(id: string): Promise<GitHubRecord | null> {
    // Parse ID format: github_<type>_<owner>_<repo>_<number/id>
    const parts = id.split("_");
    if (parts.length < 4) return null;

    const [, type, owner, repo, ...rest] = parts;
    const identifier = rest.join("_");

    try {
      switch (type) {
        case "repository":
          return (await this.client.getRepository(owner, repo)) as GitHubRecord;

        case "issue": {
          const issueNumber = parseInt(identifier, 10);
          return (await this.client.getIssue(
            owner,
            repo,
            issueNumber
          )) as GitHubRecord;
        }

        case "pull_request": {
          const prNumber = parseInt(identifier, 10);
          return (await this.client.getPullRequest(
            owner,
            repo,
            prNumber
          )) as GitHubRecord;
        }

        case "workflow": {
          const workflowId = parseInt(identifier, 10);
          return (await this.client.getWorkflow(
            owner,
            repo,
            workflowId
          )) as GitHubRecord;
        }

        case "workflow_run": {
          const runId = parseInt(identifier, 10);
          return (await this.client.getWorkflowRun(
            owner,
            repo,
            runId
          )) as GitHubRecord;
        }

        case "release": {
          const releaseId = parseInt(identifier, 10);
          return (await this.client.getRelease(
            owner,
            repo,
            releaseId
          )) as GitHubRecord;
        }

        case "user":
          return (await this.client.getUser(identifier)) as GitHubRecord;

        default:
          return null;
      }
    } catch (error) {
      console.warn(`Failed to fetch record ${id}:`, error);
      return null;
    }
  }

  /**
   * Transform GitHub record to unified format
   */
  async transform(sourceRecord: GitHubRecord): Promise<Record> {
    const recordType = this.getRecordType(sourceRecord);
    const sourceId = this.getSourceId(sourceRecord);
    const _id = this.generateRecordId(recordType, sourceId);

    const title = this.extractTitle(sourceRecord);
    const content = this.extractTextContent(sourceRecord);
    const people = this.extractPeople(sourceRecord);
    const primaryDate = this.extractPrimaryDate(sourceRecord);
    const tags = this.extractTags(sourceRecord);
    return {
      _id,
      source: this.source,
      sourceId,
      recordType,
      title,
      content,
      people,
      primaryDate,
      tags,
      rawData: sourceRecord,
      checksum: this.computeChecksum(sourceRecord),
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: this.getUpdatedAt(sourceRecord),
      deletedAt: this.isDeleted(sourceRecord) ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Extract relationships from GitHub record
   */
  async extractRelationships(
    sourceRecord: GitHubRecord
  ): Promise<EntityRelationship[]> {
    const relationships: EntityRelationship[] = [];
    const recordType = this.getRecordType(sourceRecord);
    const sourceId = this.getSourceId(sourceRecord);
    const recordId = this.generateRecordId(recordType, sourceId);

    // Repository relationships
    if (recordType === "repository") {
      const repo = sourceRecord as GitHubRepository;
      // Owner relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", repo.owner.login),
        type: "OWNED_BY",
        confidence: 1.0,
        extractedBy: "explicit",
      });
    }

    // Issue relationships
    if (recordType === "issue") {
      const issue = sourceRecord as GitHubIssue;
      const repoId = this.extractRepoIdFromUrl(issue.repository_url);

      // Repository relationship
      if (repoId) {
        relationships.push({
          sourceId: recordId,
          targetId: repoId,
          type: "ISSUE_IN_REPO",
          confidence: 1.0,
          extractedBy: "explicit",
        });
      }

      // Author relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", issue.user.login),
        type: "CREATED_BY",
        confidence: 1.0,
        extractedBy: "explicit",
      });

      // Assignee relationships
      issue.assignees?.forEach((assignee) => {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId("user", assignee.login),
          type: "ASSIGNED_TO",
          confidence: 1.0,
          extractedBy: "explicit",
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
          extractedBy: "explicit",
        });
      }
    }

    // Pull Request relationships
    if (recordType === "pull_request") {
      const pr = sourceRecord as GitHubPullRequest;
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
        extractedBy: "explicit",
      });

      // Author relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", pr.user.login),
        type: "CREATED_BY",
        confidence: 1.0,
        extractedBy: "explicit",
      });

      // Assignee relationships
      pr.assignees?.forEach((assignee) => {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId("user", assignee.login),
          type: "ASSIGNED_TO",
          confidence: 1.0,
          extractedBy: "explicit",
        });
      });

      // Reviewer relationships
      pr.requested_reviewers?.forEach((reviewer) => {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId("user", reviewer.login),
          type: "REVIEWED_BY",
          confidence: 0.8,
          extractedBy: "explicit",
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
            extractedBy: "heuristic",
            metadata: { pattern: "fixes_keyword" },
          });
        }
      }
    }

    // Workflow relationships
    if (recordType === "workflow") {
      const workflow = sourceRecord as GitHubWorkflow;
      const repoId = this.extractRepoIdFromUrl(workflow.url);

      if (repoId) {
        relationships.push({
          sourceId: recordId,
          targetId: repoId,
          type: "WORKFLOW_IN_REPO",
          confidence: 1.0,
          extractedBy: "explicit",
        });
      }
    }

    // Workflow Run relationships
    if (recordType === "workflow_run") {
      const run = sourceRecord as GitHubWorkflowRun;

      // Workflow relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId(
          "workflow",
          `${run.repository.owner.login}_${run.repository.name}_${run.workflow_id}`
        ),
        type: "RUN_OF_WORKFLOW",
        confidence: 1.0,
        extractedBy: "explicit",
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
        extractedBy: "explicit",
      });

      // Actor relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", run.actor.login),
        type: "TRIGGERED_BY",
        confidence: 1.0,
        extractedBy: "explicit",
      });
    }

    // Security Alert relationships
    if (
      recordType === "code_scanning_alert" ||
      recordType === "dependabot_alert"
    ) {
      const alert = sourceRecord as
        | GitHubCodeScanningAlert
        | GitHubDependabotAlert;
      const repoId = this.extractRepoIdFromUrl(alert.url);

      if (repoId) {
        relationships.push({
          sourceId: recordId,
          targetId: repoId,
          type: "ALERT_IN_REPO",
          confidence: 1.0,
          extractedBy: "explicit",
        });
      }
    }

    // Discussion relationships
    if (recordType === "discussion") {
      const discussion = sourceRecord as GitHubDiscussion;
      const repoId = this.extractRepoIdFromUrl(discussion.repository_url);

      if (repoId) {
        relationships.push({
          sourceId: recordId,
          targetId: repoId,
          type: "DISCUSSION_IN_REPO",
          confidence: 1.0,
          extractedBy: "explicit",
        });
      }

      // Author relationship
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", discussion.user.login),
        type: "CREATED_BY",
        confidence: 1.0,
        extractedBy: "explicit",
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
          extractedBy: "explicit",
        });
      }
    }

    return relationships;
  }

  /**
   * Check if record is deleted
   */
  isDeleted(sourceRecord: GitHubRecord): boolean {
    const recordType = this.getRecordType(sourceRecord);

    if (recordType === "repository") {
      return (sourceRecord as GitHubRepository).archived;
    }

    if (recordType === "issue" || recordType === "pull_request") {
      return (
        (sourceRecord as GitHubIssue | GitHubPullRequest).state === "closed"
      );
    }

    if (recordType === "workflow") {
      return (sourceRecord as GitHubWorkflow).state !== "active";
    }

    return false;
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
  // Protected Helper Methods
  // ============================================

  /**
   * Extract text content from record
   */
  protected extractTextContent(sourceRecord: GitHubRecord): string {
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "repository": {
        const repo = sourceRecord as GitHubRepository;
        return [
          repo.description || "",
          `Language: ${repo.language || "N/A"}`,
          `Topics: ${repo.topics?.length ? repo.topics.join(", ") : ""}`,
        ]
          .filter(Boolean)
          .join("\n");
      }

      case "issue": {
        const issue = sourceRecord as GitHubIssue;
        return [issue.title, issue.body || ""].filter(Boolean).join("\n\n");
      }

      case "pull_request": {
        const pr = sourceRecord as GitHubPullRequest;
        return [pr.title, pr.body || ""].filter(Boolean).join("\n\n");
      }

      case "workflow_run": {
        const run = sourceRecord as GitHubWorkflowRun;
        return `Workflow: ${run.name}\nBranch: ${run.head_branch}\nStatus: ${
          run.status
        }\nConclusion: ${run.conclusion || "N/A"}`;
      }

      case "release": {
        const release = sourceRecord as GitHubRelease;
        return [release.name, release.body || ""].filter(Boolean).join("\n\n");
      }

      case "discussion": {
        const discussion = sourceRecord as GitHubDiscussion;
        return [discussion.title, discussion.body].filter(Boolean).join("\n\n");
      }

      case "code_scanning_alert": {
        const alert = sourceRecord as GitHubCodeScanningAlert;
        return `${alert.rule.name}: ${alert.rule.description}`;
      }

      case "dependabot_alert": {
        const alert = sourceRecord as GitHubDependabotAlert;
        return `${alert.security_advisory.summary}\n${alert.security_advisory.description}`;
      }

      case "user": {
        const user = sourceRecord as GitHubUser;
        return [user.bio || "", user.company || "", user.location || ""]
          .filter(Boolean)
          .join(" | ");
      }

      default:
        return "";
    }
  }

  /**
   * Extract title from record
   */
  protected extractTitle(sourceRecord: GitHubRecord): string {
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "repository":
        return (sourceRecord as GitHubRepository).full_name;

      case "issue":
        return `#${(sourceRecord as GitHubIssue).number}: ${
          (sourceRecord as GitHubIssue).title
        }`;

      case "pull_request":
        return `PR #${(sourceRecord as GitHubPullRequest).number}: ${
          (sourceRecord as GitHubPullRequest).title
        }`;

      case "workflow":
        return (sourceRecord as GitHubWorkflow).name;

      case "workflow_run":
        return `${(sourceRecord as GitHubWorkflowRun).name} #${
          (sourceRecord as GitHubWorkflowRun).run_number
        }`;

      case "release":
        return (
          (sourceRecord as GitHubRelease).name ||
          (sourceRecord as GitHubRelease).tag_name
        );

      case "discussion":
        return (sourceRecord as GitHubDiscussion).title;

      case "code_scanning_alert":
        return `Security Alert #${
          (sourceRecord as GitHubCodeScanningAlert).number
        }`;

      case "dependabot_alert":
        return `Dependabot Alert #${
          (sourceRecord as GitHubDependabotAlert).number
        }`;

      case "user":
        return (
          (sourceRecord as GitHubUser).name ||
          (sourceRecord as GitHubUser).login
        );

      default:
        return "Unknown";
    }
  }

  /**
   * Extract people from record
   */
  protected extractPeople(sourceRecord: GitHubRecord): string[] {
    const people: string[] = [];
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "repository": {
        const repo = sourceRecord as GitHubRepository;
        people.push(repo.owner.login);
        break;
      }

      case "issue": {
        const issue = sourceRecord as GitHubIssue;
        people.push(issue.user.login);
        issue.assignees?.forEach((a) => people.push(a.login));
        break;
      }

      case "pull_request": {
        const pr = sourceRecord as GitHubPullRequest;
        people.push(pr.user.login);
        pr.assignees?.forEach((a) => people.push(a.login));
        pr.requested_reviewers?.forEach((r) => people.push(r.login));
        if (pr.merged_by) people.push(pr.merged_by.login);
        break;
      }

      case "workflow_run": {
        const run = sourceRecord as GitHubWorkflowRun;
        people.push(run.actor.login);
        people.push(run.triggering_actor.login);
        break;
      }

      case "release": {
        const release = sourceRecord as GitHubRelease;
        people.push(release.author.login);
        break;
      }

      case "discussion": {
        const discussion = sourceRecord as GitHubDiscussion;
        people.push(discussion.user.login);
        if (discussion.answer_chosen_by) {
          people.push(discussion.answer_chosen_by.login);
        }
        break;
      }

      case "code_scanning_alert": {
        const alert = sourceRecord as GitHubCodeScanningAlert;
        if (alert.dismissed_by) people.push(alert.dismissed_by.login);
        break;
      }

      case "dependabot_alert": {
        const alert = sourceRecord as GitHubDependabotAlert;
        if (alert.dismissed_by) people.push(alert.dismissed_by.login);
        break;
      }
    }

    return [...new Set(people)]; // Remove duplicates
  }

  /**
   * Extract primary date from record
   */
  protected extractPrimaryDate(sourceRecord: GitHubRecord): Date | null {
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "repository":
        return new Date((sourceRecord as GitHubRepository).created_at);

      case "issue":
        return new Date((sourceRecord as GitHubIssue).created_at);

      case "pull_request":
        return new Date((sourceRecord as GitHubPullRequest).created_at);

      case "workflow":
        return new Date((sourceRecord as GitHubWorkflow).created_at);

      case "workflow_run":
        return new Date((sourceRecord as GitHubWorkflowRun).created_at);

      case "release":
        return new Date((sourceRecord as GitHubRelease).published_at);

      case "discussion":
        return new Date((sourceRecord as GitHubDiscussion).created_at);

      case "code_scanning_alert":
        return new Date((sourceRecord as GitHubCodeScanningAlert).created_at);

      case "dependabot_alert":
        return new Date((sourceRecord as GitHubDependabotAlert).created_at);

      case "user":
        return (sourceRecord as GitHubUser).created_at
          ? new Date((sourceRecord as GitHubUser).created_at!)
          : null;

      default:
        return null;
    }
  }

  /**
   * Extract tags from record
   */
  protected extractTags(sourceRecord: GitHubRecord): string[] {
    const tags: string[] = [];
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "repository": {
        const repo = sourceRecord as GitHubRepository;
        if (repo.topics?.length) {
          tags.push(...repo.topics);
        }
        if (repo.language) tags.push(repo.language);
        if (repo.private) tags.push("private");
        if (repo.archived) tags.push("archived");
        if (repo.fork) tags.push("fork");
        break;
      }

      case "issue": {
        const issue = sourceRecord as GitHubIssue;
        tags.push(...issue.labels?.map((l) => l.name));
        tags.push(issue.state);
        break;
      }

      case "pull_request": {
        const pr = sourceRecord as GitHubPullRequest;
        tags.push(...pr.labels?.map((l) => l.name));
        tags.push(pr.state);
        if (pr.draft) tags.push("draft");
        if (pr.merged) tags.push("merged");
        break;
      }

      case "workflow": {
        const workflow = sourceRecord as GitHubWorkflow;
        tags.push(workflow.state);
        break;
      }

      case "workflow_run": {
        const run = sourceRecord as GitHubWorkflowRun;
        tags.push(run.status);
        if (run.conclusion) tags.push(run.conclusion);
        tags.push(run.event);
        break;
      }

      case "release": {
        const release = sourceRecord as GitHubRelease;
        if (release.draft) tags.push("draft");
        if (release.prerelease) tags.push("prerelease");
        break;
      }

      case "discussion": {
        const discussion = sourceRecord as GitHubDiscussion;
        tags.push(discussion.state);
        tags.push(discussion.category.name);
        break;
      }

      case "code_scanning_alert": {
        const alert = sourceRecord as GitHubCodeScanningAlert;
        tags.push(alert.state);
        tags.push(alert.rule.severity);
        tags.push(...alert.rule.tags);
        break;
      }

      case "dependabot_alert": {
        const alert = sourceRecord as GitHubDependabotAlert;
        tags.push(alert.state);
        tags.push(alert.security_advisory.severity);
        tags.push(alert.dependency.package.ecosystem);
        break;
      }
    }

    return tags;
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
   * Get record type from source record
   */
  private getRecordType(record: GitHubRecord): string {
    if ("full_name" in record && "owner" in record) return "repository";
    if ("pull_request" in record) return "issue";
    if ("head" in record && "base" in record) return "pull_request";
    if ("path" in record && "badge_url" in record) return "workflow";
    if ("workflow_id" in record && "run_number" in record)
      return "workflow_run";
    if ("tag_name" in record && "assets" in record) return "release";
    if ("category" in record && "answer_html_url" in record)
      return "discussion";
    if ("rule" in record && "tool" in record) return "code_scanning_alert";
    if ("security_advisory" in record && "dependency" in record)
      return "dependabot_alert";
    if ("login" in record && "avatar_url" in record) return "user";
    return "unknown";
  }

  /**
   * Get source ID from record
   */
  private getSourceId(record: GitHubRecord): string {
    const recordType = this.getRecordType(record);

    switch (recordType) {
      case "repository": {
        const repo = record as GitHubRepository;
        return `${repo.owner.login}_${repo.name}`;
      }

      case "issue": {
        const issue = record as GitHubIssue;
        const repoUrl = issue.repository_url;
        const repoParts = repoUrl.split("/");
        const owner = repoParts[repoParts.length - 2];
        const repo = repoParts[repoParts.length - 1];
        return `${owner}_${repo}_${issue.number}`;
      }

      case "pull_request": {
        const pr = record as GitHubPullRequest;
        return `${pr.base.repo.owner.login}_${pr.base.repo.name}_${pr.number}`;
      }

      case "workflow": {
        const workflow = record as GitHubWorkflow;
        const urlParts = workflow.url.split("/");
        const owner = urlParts[urlParts.length - 4];
        const repo = urlParts[urlParts.length - 3];
        return `${owner}_${repo}_${workflow.id}`;
      }

      case "workflow_run": {
        const run = record as GitHubWorkflowRun;
        return `${run.repository.owner.login}_${run.repository.name}_${run.id}`;
      }

      case "release": {
        const release = record as GitHubRelease;
        const urlParts = release.html_url.split("/");
        const owner = urlParts[urlParts.length - 4];
        const repo = urlParts[urlParts.length - 3];
        return `${owner}_${repo}_${release.id}`;
      }

      case "discussion": {
        const discussion = record as GitHubDiscussion;
        const urlParts = discussion.repository_url.split("/");
        const owner = urlParts[urlParts.length - 2];
        const repo = urlParts[urlParts.length - 1];
        return `${owner}_${repo}_${discussion.number}`;
      }

      case "code_scanning_alert": {
        const alert = record as GitHubCodeScanningAlert;
        const urlParts = alert.url.split("/");
        const owner = urlParts[urlParts.length - 4];
        const repo = urlParts[urlParts.length - 3];
        return `${owner}_${repo}_${alert.number}`;
      }

      case "dependabot_alert": {
        const alert = record as GitHubDependabotAlert;
        const urlParts = alert.url.split("/");
        const owner = urlParts[urlParts.length - 4];
        const repo = urlParts[urlParts.length - 3];
        return `${owner}_${repo}_${alert.number}`;
      }

      case "user":
        return (record as GitHubUser).login;

      default:
        return (record as any).id?.toString() || "unknown";
    }
  }

  /**
   * Get updated_at timestamp from record
   */
  private getUpdatedAt(record: GitHubRecord): Date {
    const recordType = this.getRecordType(record);

    switch (recordType) {
      case "repository":
        return new Date((record as GitHubRepository).updated_at);
      case "issue":
        return new Date((record as GitHubIssue).updated_at);
      case "pull_request":
        return new Date((record as GitHubPullRequest).updated_at);
      case "workflow":
        return new Date((record as GitHubWorkflow).updated_at);
      case "workflow_run":
        return new Date((record as GitHubWorkflowRun).updated_at);
      case "release":
        return new Date((record as GitHubRelease).published_at);
      case "discussion":
        return new Date((record as GitHubDiscussion).updated_at);
      case "code_scanning_alert":
        return new Date((record as GitHubCodeScanningAlert).updated_at);
      case "dependabot_alert":
        return new Date((record as GitHubDependabotAlert).updated_at);
      case "user":
        return (record as GitHubUser).updated_at
          ? new Date((record as GitHubUser).updated_at!)
          : new Date();
      default:
        return new Date();
    }
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
