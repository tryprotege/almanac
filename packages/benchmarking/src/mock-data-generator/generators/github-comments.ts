import type { GitHubIssue, GitHubUser } from "@ebee-oss/shared-util";
import type { GeneratorConfig } from "../types.js";
import { generateWithLLM } from "../utils/llm.js";
import { selectRandom } from "../utils/random.js";
import {
  generateRandomId,
  generateRandomNodeId,
  generateRandomHash,
} from "../utils/id-generator.js";

/**
 * GitHub comment interface (extends base comment type)
 */
export interface GitHubComment {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  issue_url: string;
  author_association: string;
}

/**
 * GitHub PR review interface
 */
export interface GitHubReview {
  id: number;
  node_id: string;
  user: GitHubUser;
  body: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";
  html_url: string;
  pull_request_url: string;
  submitted_at: string;
  commit_id: string;
  author_association: string;
}

/**
 * Generate comments for GitHub issues
 */
export async function generateGitHubIssueComments(
  issues: GitHubIssue[],
  users: GitHubUser[],
  config: GeneratorConfig
): Promise<Map<number, GitHubComment[]>> {
  const commentsMap = new Map<number, GitHubComment[]>();

  console.log(`Generating comments for ${issues.length} GitHub issues...`);

  for (const issue of issues) {
    // Skip if issue has 0 comments
    if (issue.comments === 0) continue;

    const comments: GitHubComment[] = [];
    const commentCount = Math.min(issue.comments, 10); // Cap at 10 comments

    for (let i = 0; i < commentCount; i++) {
      // Select a commenter (not the issue author for first comment)
      const availableUsers = users.filter((u) => u.id !== issue.user?.id);
      const commenter = selectRandom(i === 0 ? availableUsers : users);

      // Calculate comment timing (hours after issue creation)
      const baseTime = new Date(issue.created_at).getTime();
      const hoursDelay = i === 0 ? 1 + Math.random() * 24 : Math.random() * 168; // First comment: 1-25 hours, others: 0-7 days
      const commentTime = new Date(baseTime + hoursDelay * 3600000);

      // Determine comment type based on issue state and position
      let commentType: "question" | "suggestion" | "confirmation" | "context";
      if (i === 0) {
        commentType = Math.random() < 0.6 ? "question" : "context";
      } else if (i === commentCount - 1 && issue.state === "closed") {
        commentType = "confirmation";
      } else {
        commentType = selectRandom([
          "suggestion",
          "question",
          "context",
        ] as const);
      }

      const prompt = `Generate a realistic GitHub comment on this issue:

Issue: ${issue.title}
${issue.body?.substring(0, 300)}

Comment Type: ${commentType}
Commenter: ${commenter.name}

Write a brief technical comment (1-3 sentences) that:
${commentType === "question" ? "- Asks for clarification or more details" : ""}
${
  commentType === "suggestion"
    ? "- Suggests a fix or approach to solve the issue"
    : ""
}
${
  commentType === "confirmation"
    ? "- Confirms the issue is resolved or provides closure"
    : ""
}
${
  commentType === "context"
    ? "- Provides additional context or reproduction steps"
    : ""
}

Return ONLY the comment text (no JSON, no quotes):`;

      try {
        const body = await generateWithLLM(prompt, config);

        const commentId = generateRandomId(10000, 9999999);

        comments.push({
          id: commentId,
          node_id: generateRandomNodeId("MDEyOklzc3VlQ29tbWVudA"),
          url: `https://api.github.com/repos/gragger/repo/issues/comments/${commentId}`,
          html_url: `${issue.html_url}#issuecomment-${commentId}`,
          body: body.trim(),
          user: commenter,
          created_at: commentTime.toISOString(),
          updated_at: commentTime.toISOString(),
          issue_url: issue.repository_url + "/issues/" + issue.number,
          author_association: "CONTRIBUTOR",
        });
      } catch (error) {
        console.error(
          `Error generating comment ${i + 1} for issue #${issue.number}:`,
          error
        );
      }
    }

    if (comments.length > 0) {
      commentsMap.set(issue.number, comments);
    }
  }

  console.log(`  Generated comments for ${commentsMap.size} issues`);

  return commentsMap;
}

/**
 * Generate reviews for GitHub pull requests
 */
export async function generateGitHubPRReviews(
  pullRequests: any[],
  users: GitHubUser[],
  config: GeneratorConfig
): Promise<Map<number, GitHubReview[]>> {
  const reviewsMap = new Map<number, GitHubReview[]>();

  console.log(
    `Generating reviews for ${pullRequests.length} GitHub pull requests...`
  );

  for (const pr of pullRequests) {
    // Only generate reviews for merged PRs
    if (pr.state !== "closed" || !pr.merged) continue;

    const reviews: GitHubReview[] = [];
    const reviewCount = Math.floor(Math.random() * 3) + 1; // 1-3 reviews

    // Select reviewers (not the PR author)
    const availableReviewers = users.filter((u) => u.login !== pr.user?.login);
    if (availableReviewers.length === 0) continue;

    const reviewers = [];
    for (let i = 0; i < reviewCount && i < availableReviewers.length; i++) {
      reviewers.push(availableReviewers[i]);
    }

    for (let i = 0; i < reviewers.length; i++) {
      const reviewer = reviewers[i];
      const isApproval = i === reviewers.length - 1 || Math.random() > 0.3; // Last reviewer likely approves

      // Calculate review timing (after PR creation, before merge)
      const prCreated = new Date(pr.created_at).getTime();
      const prMerged = pr.merged_at
        ? new Date(pr.merged_at).getTime()
        : prCreated + 86400000;
      const timeRange = prMerged - prCreated;
      const reviewTime = new Date(
        prCreated + (timeRange * (i + 1)) / (reviewers.length + 1)
      );

      const prompt = `Generate a brief GitHub PR review comment for:

PR: ${pr.title}
${pr.body?.substring(0, 200)}

Review Type: ${isApproval ? "APPROVAL" : "CHANGES REQUESTED"}
Reviewer: ${reviewer.name}

Write 1-2 sentences. Examples:
${isApproval ? '- "LGTM! Nice cleanup of the error handling."' : ""}
${isApproval ? '- "Looks good, approved!"' : ""}
${!isApproval ? '- "Can we add a test for the edge case on line 42?"' : ""}
${
  !isApproval
    ? '- "Consider extracting this into a separate function for better testability."'
    : ""
}

Return ONLY the comment text (no JSON, no quotes):`;

      try {
        const body = await generateWithLLM(prompt, config);

        const reviewId = generateRandomId(10000, 9999999);

        reviews.push({
          id: reviewId,
          node_id: generateRandomNodeId("MDE3OlB1bGxSZXF1ZXN0UmV2aWV3"),
          user: reviewer,
          body: body.trim(),
          state: isApproval ? "APPROVED" : "CHANGES_REQUESTED",
          html_url: `${pr.html_url}#pullrequestreview-${reviewId}`,
          pull_request_url:
            pr.url ||
            `https://api.github.com/repos/gragger/repo/pulls/${pr.number}`,
          submitted_at: reviewTime.toISOString(),
          commit_id: pr.merge_commit_sha || generateRandomHash(40),
          author_association: "CONTRIBUTOR",
        });
      } catch (error) {
        console.error(
          `Error generating review ${i + 1} for PR #${pr.number}:`,
          error
        );
      }
    }

    if (reviews.length > 0) {
      reviewsMap.set(pr.number, reviews);
    }
  }

  console.log(`  Generated reviews for ${reviewsMap.size} pull requests`);

  return reviewsMap;
}
