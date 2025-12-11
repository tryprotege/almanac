import type {
  GitHubIssue,
  GitHubPullRequest,
  GitHubUser,
  GitHubRepository,
} from "@ebee-oss/shared-util";
import type {
  GeneratorConfig,
  GenerationContext,
  RelationshipContext,
} from "../types.js";
import { COMPANY_DATA } from "../data/company.js";
import { generateWithLLM } from "../utils/llm.js";
import { selectRandom, selectRandomMultiple } from "../utils/random.js";
import { generateRandomDate } from "../utils/dates.js";

/**
 * Generate GitHub issues and pull requests (functional approach - no classes)
 */

const ISSUE_LABELS = [
  ["bug", "p1"],
  ["bug", "p2"],
  ["feature", "enhancement"],
  ["documentation"],
  ["performance"],
  ["security"],
  ["refactor"],
  ["testing"],
];
``;
const ISSUE_STATES = ["open", "closed"] as const;

export async function generateGitHubIssues(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: any
): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];
  const users = generateGitHubUsers();
  const repos = COMPANY_DATA.githubRepos;

  console.log(`Generating ${count} GitHub issues...`);

  for (let i = 0; i < count; i++) {
    const repo = selectRandom(repos);
    const author = selectRandom(users);
    const labels = selectRandom(ISSUE_LABELS);
    const state = Math.random() > 0.3 ? "closed" : "open"; // 70% closed
    const createdAt = generateRandomDate(dates[0], dates[dates.length - 1]);
    const closedAt =
      state === "closed"
        ? new Date(
            createdAt.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000
          ) // Closed within 7 days
        : undefined;

    // Generate realistic issue content with LLM
    const prompt = `Generate a realistic GitHub issue for a ${
      repo.description
    } repository.

Company: ${COMPANY_DATA.name} - ${COMPANY_DATA.githubOrg}
Repository: ${repo.name} (${repo.language})
Labels: ${labels.join(", ")}
Author: ${author.name}

Return ONLY a JSON object with this exact structure (no markdown, no extra text):
{
  "title": "Brief issue title (max 80 chars)",
  "body": "Detailed issue description with technical details, steps to reproduce if bug, or requirements if feature"
}
`;

    try {
      const response = await generateWithLLM(prompt, config);
      const parsed = JSON.parse(response);

      issues.push({
        id: 1000 + i,
        node_id: `MDU6SXNzdWU${1000 + i}`,
        number: i + 1,
        title: parsed.title,
        body: parsed.body,
        state,
        state_reason: state === "closed" ? "completed" : null,
        user: {
          login: author.login,
          id: author.id,
          node_id: author.node_id,
          avatar_url: author.avatar_url,
          html_url: author.html_url,
          type: author.type,
          site_admin: false,
          name: author.name,
          email: author.email,
        },
        labels: labels.map((label) => ({
          id: Math.floor(Math.random() * 1000000),
          node_id: `MDU6TGFiZWw${Math.floor(Math.random() * 1000000)}`,
          name: label,
          description: null,
          color: "0e8a16",
          default: false,
        })),
        assignees: [],
        milestone: null,
        comments: Math.floor(Math.random() * 10),
        created_at: createdAt.toISOString(),
        updated_at: (closedAt || createdAt).toISOString(),
        closed_at: closedAt?.toISOString() || null,
        author_association: "CONTRIBUTOR",
        locked: false,
        repository_url: `https://api.github.com/repos/${COMPANY_DATA.githubOrg}/${repo.name}`,
        html_url: `https://github.com/${COMPANY_DATA.githubOrg}/${
          repo.name
        }/issues/${i + 1}`,
      });

      if ((i + 1) % 10 === 0) {
        console.log(`  Generated ${i + 1}/${count} issues`);
      }
    } catch (error) {
      console.error(`Error generating issue ${i + 1}:`, error);
    }
  }

  return issues;
}

export async function generateGitHubPRs(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: any
): Promise<GitHubPullRequest[]> {
  const prs: GitHubPullRequest[] = [];
  const users = generateGitHubUsers();
  const repos = COMPANY_DATA.githubRepos;
  const dependabotCount = Math.floor(count * 0.3); // 30% from Dependabot

  console.log(
    `Generating ${count} GitHub PRs (${dependabotCount} from Dependabot)...`
  );

  for (let i = 0; i < count; i++) {
    const repo = selectRandom(repos);
    const isDependabot = i < dependabotCount;
    const author = isDependabot
      ? { login: "dependabot[bot]", name: "Dependabot", id: 49699333 }
      : selectRandom(users);
    const state = Math.random() > 0.2 ? "closed" : "open"; // 80% merged/closed
    const merged = state === "closed" && Math.random() > 0.1; // 90% of closed are merged
    const createdAt = generateRandomDate(dates[0], dates[dates.length - 1]);
    const mergedAt = merged
      ? new Date(createdAt.getTime() + Math.random() * 3 * 24 * 60 * 60 * 1000) // Merged within 3 days
      : undefined;

    // Generate realistic PR content with LLM
    let prompt = "";

    if (isDependabot) {
      prompt = `Generate a realistic Dependabot PR for updating a dependency in a ${repo.description} repository.

Repository: ${repo.name} (${repo.language})

Return ONLY a JSON object with this exact structure (no markdown, no extra text):
{
  "title": "Bump [package-name] from [old-version] to [new-version]",
  "body": "Bumps [package-name] from [old-version] to [new-version].\\n\\nRelease notes and changelog details."
}`;
    } else {
      prompt = `Generate a realistic GitHub PR for a ${repo.description} repository.

Company: ${COMPANY_DATA.name}
Repository: ${repo.name} (${repo.language})
Author: ${author.name}
`;

      // 70% chance to reference an issue from context
      if (
        context &&
        context.issues &&
        context.issues.length > 0 &&
        Math.random() < 0.7
      ) {
        const issue = selectRandom(context.issues) as GitHubIssue;
        prompt += `\nThis PR fixes Issue #${issue.number}: ${issue.title}
Include "Fixes #${issue.number}" in the PR body to link it to the issue.
`;
      }

      prompt += `\nReturn ONLY a JSON object with this exact structure (no markdown, no extra text):
{
  "title": "Brief PR title describing the change (max 80 chars)",
  "body": "Detailed PR description with what changed, why, and any relevant context"
}`;
    }

    try {
      const response = await generateWithLLM(prompt, config);
      const parsed = JSON.parse(response);

      const mockRepo: GitHubRepository = {
        id: 5000 + Math.floor(Math.random() * 100),
        node_id: `MDEwOlJlcG9zaXRvcnk1MDAw`,
        name: repo.name,
        full_name: `${COMPANY_DATA.githubOrg}/${repo.name}`,
        owner: users[0],
        description: repo.description,
        private: false,
        html_url: `https://github.com/${COMPANY_DATA.githubOrg}/${repo.name}`,
        created_at: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
        pushed_at: new Date().toISOString(),
        size: Math.floor(Math.random() * 10000),
        stargazers_count: Math.floor(Math.random() * 100),
        watchers_count: Math.floor(Math.random() * 100),
        language: repo.language,
        topics: repo.topics,
        default_branch: "main",
        archived: false,
        disabled: false,
        fork: false,
        forks_count: Math.floor(Math.random() * 10),
        open_issues_count: Math.floor(Math.random() * 20),
      };

      prs.push({
        id: 2000 + i,
        node_id: `MDExOlB1bGxSZXF1ZXN0${2000 + i}`,
        number: i + 1,
        title: parsed.title,
        body: parsed.body,
        state,
        user: {
          login: author.login,
          id: author.id,
          node_id: `MDQ6VXNlcjEyMzQ1Njc4${author.id}`,
          avatar_url: `https://avatars.githubusercontent.com/u/${author.id}?v=4`,
          html_url: `https://github.com/${author.login}`,
          type: isDependabot ? "Bot" : "User",
          site_admin: false,
          name: author.name,
        },
        labels: [],
        assignees: [],
        requested_reviewers: [],
        requested_teams: [],
        milestone: null,
        draft: false,
        merged: merged,
        mergeable: state === "open" ? true : null,
        mergeable_state: state === "open" ? "clean" : "unknown",
        merged_at: mergedAt?.toISOString() || null,
        merged_by: merged ? selectRandom(users) : null,
        merge_commit_sha: merged
          ? `abc${Math.random().toString(36).substring(7)}`
          : null,
        head: {
          label: `${COMPANY_DATA.githubOrg}:feature-branch-${i}`,
          ref: `feature-branch-${i}`,
          sha: `def${Math.random().toString(36).substring(7)}`,
          user: users[0],
          repo: mockRepo,
        },
        base: {
          label: `${COMPANY_DATA.githubOrg}:main`,
          ref: "main",
          sha: `ghi${Math.random().toString(36).substring(7)}`,
          user: users[0],
          repo: mockRepo,
        },
        created_at: createdAt.toISOString(),
        updated_at: (mergedAt || createdAt).toISOString(),
        closed_at:
          state === "closed" ? (mergedAt || createdAt).toISOString() : null,
        html_url: `https://github.com/${COMPANY_DATA.githubOrg}/${
          repo.name
        }/pull/${i + 1}`,
        diff_url: `https://github.com/${COMPANY_DATA.githubOrg}/${
          repo.name
        }/pull/${i + 1}.diff`,
        patch_url: `https://github.com/${COMPANY_DATA.githubOrg}/${
          repo.name
        }/pull/${i + 1}.patch`,
        commits: Math.floor(Math.random() * 5) + 1,
        additions: Math.floor(Math.random() * 500) + 10,
        deletions: Math.floor(Math.random() * 200) + 5,
        changed_files: Math.floor(Math.random() * 10) + 1,
        author_association: isDependabot ? "NONE" : "CONTRIBUTOR",
        locked: false,
      });

      if ((i + 1) % 10 === 0) {
        console.log(`  Generated ${i + 1}/${count} PRs`);
      }
    } catch (error) {
      console.error(`Error generating PR ${i + 1}:`, error);
    }
  }

  return prs;
}

export function generateGitHubUsers(): GitHubUser[] {
  return COMPANY_DATA.teamMembers.map((member, index) => ({
    id: index + 1,
    login: member.githubHandle,
    node_id: `MDQ6VXNlcjEyMzQ1Njc4${index}`,
    avatar_url: `https://avatars.githubusercontent.com/u/${index + 1}?v=4`,
    html_url: `https://github.com/${member.githubHandle}`,
    type: "User",
    site_admin: false,
    name: member.name,
    email: member.email,
  }));
}

export function generateGitHubRepositories(): GitHubRepository[] {
  const owner = generateGitHubUsers()[0]; // Sarah Chen as owner

  return COMPANY_DATA.githubRepos.map((repo, index) => ({
    id: 5000 + index,
    node_id: `MDEwOlJlcG9zaXRvcnk1MDAw${index}`,
    name: repo.name,
    full_name: `${COMPANY_DATA.githubOrg}/${repo.name}`,
    owner,
    description: repo.description,
    private: false,
    html_url: `https://github.com/${COMPANY_DATA.githubOrg}/${repo.name}`,
    created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    pushed_at: new Date().toISOString(),
    size: Math.floor(Math.random() * 50000) + 10000,
    stargazers_count: Math.floor(Math.random() * 200) + 10,
    watchers_count: Math.floor(Math.random() * 200) + 10,
    language: repo.language,
    topics: repo.topics,
    default_branch: "main",
    archived: false,
    disabled: false,
    fork: false,
    forks_count: Math.floor(Math.random() * 20) + 1,
    open_issues_count: Math.floor(Math.random() * 30) + 5,
  }));
}
