import type { MockData } from "../types.js";

/**
 * Get all repositories
 */
export function getRepositories(data: MockData): any[] {
  return data.github?.repositories || [];
}

/**
 * Get all issues
 */
export function getIssues(
  data: MockData,
  options?: {
    repo?: string;
    state?: "open" | "closed" | "all";
    limit?: number;
  }
): any[] {
  if (!data.github) return [];

  let issues = data.github.issues;

  // Filter by state
  if (options?.state && options.state !== "all") {
    issues = issues.filter((i) => i.state === options.state);
  }

  // Filter by repo
  if (options?.repo) {
    issues = issues.filter((i) => i.repository?.name === options.repo);
  }

  // Apply limit
  if (options?.limit && options.limit > 0) {
    issues = issues.slice(0, options.limit);
  }

  return issues;
}

/**
 * Get all pull requests
 */
export function getPullRequests(
  data: MockData,
  options?: {
    repo?: string;
    state?: "open" | "closed" | "all";
    limit?: number;
  }
): any[] {
  if (!data.github) return [];

  let prs = data.github.pullRequests;

  // Filter by state
  if (options?.state && options.state !== "all") {
    prs = prs.filter((pr) => pr.state === options.state);
  }

  // Filter by repo
  if (options?.repo) {
    prs = prs.filter((pr) => pr.repository?.name === options.repo);
  }

  // Apply limit
  if (options?.limit && options.limit > 0) {
    prs = prs.slice(0, options.limit);
  }

  return prs;
}

/**
 * Get issue by number
 */
export function getIssueByNumber(
  data: MockData,
  issueNumber: number
): any | undefined {
  return data.github?.issues.find((i) => i.number === issueNumber);
}

/**
 * Get pull request by number
 */
export function getPullRequestByNumber(
  data: MockData,
  prNumber: number
): any | undefined {
  return data.github?.pullRequests.find((pr) => pr.number === prNumber);
}

/**
 * Get organization members
 */
export function getOrganizationMembers(data: MockData): any[] {
  return data.github?.organizationMembers || [];
}

/**
 * Get authenticated user (current user)
 */
export function getMe(data: MockData): any | undefined {
  return data.github?.user;
}

/**
 * Search repositories by name or description
 */
export function searchRepositories(
  data: MockData,
  query: string,
  options?: {
    limit?: number;
  }
): any[] {
  if (!data.github) return [];

  const lowerQuery = query.toLowerCase();
  let repos = data.github.repositories.filter((repo) => {
    return (
      repo.name.toLowerCase().includes(lowerQuery) ||
      repo.description?.toLowerCase().includes(lowerQuery) ||
      lowerQuery.includes(repo.owner?.login)
    );
  });

  // Apply limit
  if (options?.limit && options.limit > 0) {
    repos = repos.slice(0, options.limit);
  }

  return repos;
}

/**
 * Search users by login or name
 */
export function searchUsers(
  data: MockData,
  query: string,
  options?: {
    limit?: number;
  }
): any[] {
  if (!data.github) return [];

  const lowerQuery = query.toLowerCase();
  let users = data.github.organizationMembers.filter(
    (user) =>
      user.login?.toLowerCase().includes(lowerQuery) ||
      user.name?.toLowerCase().includes(lowerQuery)
  );

  // Apply limit
  if (options?.limit && options.limit > 0) {
    users = users.slice(0, options.limit);
  }

  return users;
}
