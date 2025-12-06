// GitHub entity types for the indexer

// ============================================
// Core User & Organization Types
// ============================================

export interface GitHubUser {
  id: number;
  login: string;
  node_id: string;
  avatar_url: string;
  html_url: string;
  type: "User" | "Bot" | "Organization";
  site_admin: boolean;
  name?: string;
  email?: string;
  bio?: string;
  company?: string;
  location?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GitHubOrganization {
  id: number;
  login: string;
  node_id: string;
  url: string;
  description: string | null;
  name: string;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Repository Types
// ============================================

export interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: GitHubUser;
  description: string | null;
  private: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string | null;
  topics: string[];
  default_branch: string;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  forks_count: number;
  open_issues_count: number;
  license?: {
    key: string;
    name: string;
    spdx_id: string;
    url: string | null;
  };
}

export interface GitHubBranch {
  label: string;
  ref: string;
  sha: string;
  user: GitHubUser;
  repo: GitHubRepository;
}

// ============================================
// Issue & Pull Request Types
// ============================================

export interface GitHubLabel {
  id: number;
  node_id: string;
  name: string;
  description: string | null;
  color: string;
  default: boolean;
}

export interface GitHubMilestone {
  id: number;
  node_id: string;
  number: number;
  title: string;
  description: string | null;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  due_on: string | null;
  closed_at: string | null;
  creator: GitHubUser;
  open_issues: number;
  closed_issues: number;
}

export interface GitHubIssue {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  state_reason: string | null;
  user: GitHubUser;
  labels: GitHubLabel[];
  assignees?: GitHubUser[];
  milestone: GitHubMilestone | null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by?: GitHubUser | null;
  html_url: string;
  repository_url: string;
  author_association: string;
  locked: boolean;
  pull_request?: {
    url: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
  };
}

export interface GitHubPullRequest {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  user: GitHubUser;
  labels: GitHubLabel[];
  assignees?: GitHubUser[];
  requested_reviewers?: GitHubUser[];
  requested_teams: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  milestone: GitHubMilestone | null;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
  merged_at: string | null;
  merged_by: GitHubUser | null;
  merge_commit_sha: string | null;
  head: GitHubBranch;
  base: GitHubBranch;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  diff_url: string;
  patch_url: string;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
  author_association: string;
  locked: boolean;
}

export interface GitHubComment {
  id: number;
  node_id: string;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  html_url: string;
  issue_url?: string;
  pull_request_url?: string;
  author_association: string;
}

export interface GitHubReview {
  id: number;
  node_id: string;
  user: GitHubUser;
  body: string;
  state:
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "COMMENTED"
    | "DISMISSED"
    | "PENDING";
  html_url: string;
  pull_request_url: string;
  submitted_at: string;
  commit_id: string;
  author_association: string;
}

// ============================================
// CI/CD & Workflow Types
// ============================================

export interface GitHubWorkflow {
  id: number;
  node_id: string;
  name: string;
  path: string;
  state:
    | "active"
    | "deleted"
    | "disabled_fork"
    | "disabled_inactivity"
    | "disabled_manually";
  created_at: string;
  updated_at: string;
  url: string;
  html_url: string;
  badge_url: string;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  node_id: string;
  head_branch: string;
  head_sha: string;
  run_number: number;
  run_attempt: number;
  event: string;
  status: "queued" | "in_progress" | "completed" | "waiting";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | null;
  workflow_id: number;
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at: string;
  jobs_url: string;
  logs_url: string;
  check_suite_url: string;
  artifacts_url: string;
  cancel_url: string;
  rerun_url: string;
  workflow_url: string;
  head_commit: {
    id: string;
    tree_id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
    committer: {
      name: string;
      email: string;
    };
  };
  repository: GitHubRepository;
  head_repository: GitHubRepository;
  actor: GitHubUser;
  triggering_actor: GitHubUser;
}

export interface GitHubWorkflowStep {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface GitHubWorkflowJob {
  id: number;
  run_id: number;
  run_url: string;
  node_id: string;
  head_sha: string;
  url: string;
  html_url: string;
  status: "queued" | "in_progress" | "completed" | "waiting";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | null;
  started_at: string;
  completed_at: string | null;
  name: string;
  steps: GitHubWorkflowStep[];
  check_run_url: string;
  labels: string[];
  runner_id: number | null;
  runner_name: string | null;
  runner_group_id: number | null;
  runner_group_name: string | null;
}

// ============================================
// Release Types
// ============================================

export interface GitHubReleaseAsset {
  id: number;
  node_id: string;
  name: string;
  label: string | null;
  content_type: string;
  state: "uploaded" | "open";
  size: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  browser_download_url: string;
  uploader: GitHubUser;
}

export interface GitHubRelease {
  id: number;
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  author: GitHubUser;
  assets: GitHubReleaseAsset[];
  html_url: string;
  tarball_url: string;
  zipball_url: string;
}

// ============================================
// Code Analysis & Security Types
// ============================================

export interface GitHubCodeScanningAlert {
  number: number;
  created_at: string;
  updated_at: string;
  url: string;
  html_url: string;
  state: "open" | "dismissed" | "fixed";
  fixed_at: string | null;
  dismissed_by: GitHubUser | null;
  dismissed_at: string | null;
  dismissed_reason: "false positive" | "won't fix" | "used in tests" | null;
  dismissed_comment: string | null;
  rule: {
    id: string;
    severity: "none" | "note" | "warning" | "error";
    security_severity_level: "low" | "medium" | "high" | "critical" | null;
    description: string;
    name: string;
    full_description: string;
    tags: string[];
    help: string | null;
    help_uri: string | null;
  };
  tool: {
    name: string;
    guid: string | null;
    version: string | null;
  };
  most_recent_instance: {
    ref: string;
    analysis_key: string;
    environment: string;
    category: string;
    state: "open" | "dismissed" | "fixed";
    commit_sha: string;
    message: {
      text: string;
    };
    location: {
      path: string;
      start_line: number;
      end_line: number;
      start_column: number;
      end_column: number;
    };
    classifications: string[];
  };
  instances_url: string;
}

export interface GitHubDependabotAlert {
  number: number;
  state: "auto_dismissed" | "dismissed" | "fixed" | "open";
  dependency: {
    package: {
      ecosystem: string;
      name: string;
    };
    manifest_path: string;
    scope: "development" | "runtime" | null;
  };
  security_advisory: {
    ghsa_id: string;
    cve_id: string | null;
    summary: string;
    description: string;
    severity: "low" | "medium" | "high" | "critical";
    identifiers: Array<{
      type: string;
      value: string;
    }>;
    references: Array<{
      url: string;
    }>;
    published_at: string;
    updated_at: string;
    withdrawn_at: string | null;
    vulnerabilities: Array<{
      package: {
        ecosystem: string;
        name: string;
      };
      severity: "low" | "medium" | "high" | "critical";
      vulnerable_version_range: string;
      first_patched_version: {
        identifier: string;
      } | null;
    }>;
    cvss: {
      vector_string: string | null;
      score: number;
    };
    cwes: Array<{
      cwe_id: string;
      name: string;
    }>;
  };
  security_vulnerability: {
    package: {
      ecosystem: string;
      name: string;
    };
    severity: "low" | "medium" | "high" | "critical";
    vulnerable_version_range: string;
    first_patched_version: {
      identifier: string;
    } | null;
  };
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  dismissed_at: string | null;
  dismissed_by: GitHubUser | null;
  dismissed_reason:
    | "fix_started"
    | "inaccurate"
    | "no_bandwidth"
    | "not_used"
    | "tolerable_risk"
    | null;
  dismissed_comment: string | null;
  fixed_at: string | null;
  auto_dismissed_at: string | null;
}

export interface GitHubSecretScanningAlert {
  number: number;
  created_at: string;
  updated_at: string | null;
  url: string;
  html_url: string;
  locations_url: string;
  state: "open" | "resolved";
  resolution:
    | "false_positive"
    | "wont_fix"
    | "revoked"
    | "used_in_tests"
    | null;
  resolved_at: string | null;
  resolved_by: GitHubUser | null;
  secret_type: string;
  secret_type_display_name: string;
  secret: string;
  push_protection_bypassed: boolean | null;
  push_protection_bypassed_by: GitHubUser | null;
  push_protection_bypassed_at: string | null;
  resolution_comment: string | null;
}

// ============================================
// Team Collaboration Types
// ============================================

export interface GitHubDiscussionCategory {
  id: string;
  node_id: string;
  repository_id: number;
  emoji: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  slug: string;
  is_answerable: boolean;
}

export interface GitHubDiscussion {
  id: string;
  node_id: string;
  number: number;
  title: string;
  body: string;
  user: GitHubUser;
  state: "open" | "closed" | "locked";
  locked: boolean;
  comments: number;
  created_at: string;
  updated_at: string;
  author_association: string;
  active_lock_reason: string | null;
  category: GitHubDiscussionCategory;
  answer_html_url: string | null;
  answer_chosen_at: string | null;
  answer_chosen_by: GitHubUser | null;
  html_url: string;
  repository_url: string;
}

export interface GitHubNotification {
  id: string;
  repository: {
    id: number;
    node_id: string;
    name: string;
    full_name: string;
    owner: GitHubUser;
    private: boolean;
    html_url: string;
    description: string | null;
    fork: boolean;
    url: string;
  };
  subject: {
    title: string;
    url: string;
    latest_comment_url: string;
    type:
      | "Issue"
      | "PullRequest"
      | "Commit"
      | "Release"
      | "Discussion"
      | "RepositoryVulnerabilityAlert";
  };
  reason: string;
  unread: boolean;
  updated_at: string;
  last_read_at: string | null;
  url: string;
  subscription_url: string;
}

// ============================================
// Commit & Code Types
// ============================================

export interface GitHubCommit {
  sha: string;
  node_id: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    url: string;
    comment_count: number;
    verification: {
      verified: boolean;
      reason: string;
      signature: string | null;
      payload: string | null;
    };
  };
  url: string;
  html_url: string;
  comments_url: string;
  author: GitHubUser | null;
  committer: GitHubUser | null;
  parents: Array<{
    sha: string;
    url: string;
    html_url: string;
  }>;
}

// ============================================
// Union Types for Adapters
// ============================================

export type GitHubRecord =
  | GitHubRepository
  | GitHubIssue
  | GitHubPullRequest
  | GitHubWorkflow
  | GitHubWorkflowRun
  | GitHubRelease
  | GitHubDiscussion
  | GitHubCodeScanningAlert
  | GitHubDependabotAlert
  | GitHubUser
  | GitHubCommit;

// ============================================
// Input Types for Creating/Updating
// ============================================

export interface CreateIssueData {
  title: string;
  body?: string;
  assignees?: string[];
  milestone?: number;
  labels?: string[];
}

export interface UpdateIssueData {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  assignees?: string[];
  milestone?: number | null;
  labels?: string[];
}

export interface CreatePullRequestData {
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
  maintainer_can_modify?: boolean;
}

export interface UpdatePullRequestData {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  base?: string;
  maintainer_can_modify?: boolean;
}

export interface CreateReleaseData {
  tag_name: string;
  target_commitish?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  generate_release_notes?: boolean;
}

// ============================================
// Configuration Types
// ============================================

export interface GitHubAdapterConfig {
  repos?: string[]; // If not provided, fetch all accessible repos
  includeArchived?: boolean;
  includeForks?: boolean;
  includePrivate?: boolean;
}
