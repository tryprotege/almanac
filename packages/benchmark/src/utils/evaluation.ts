/**
 * Response Evaluation - Semantic Matching for Generated Queries
 * Evaluates agent responses against mustInclude criteria
 */

import type { EvaluationResult } from "../types/index.js";

/**
 * Normalize text for semantic matching
 * - Lowercase
 * - Remove extra whitespace
 * - Remove common punctuation
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}'\"]/g, " ") // Replace punctuation with space
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/**
 * Check if a required item appears in the response
 * Uses fuzzy matching with normalization
 */
function isItemMatched(response: string, item: string): boolean {
  const normalizedResponse = normalizeText(response);
  const normalizedItem = normalizeText(item);

  // Direct substring match
  if (normalizedResponse.includes(normalizedItem)) {
    return true;
  }

  // Check if all significant words from the item appear
  const itemWords = normalizedItem.split(" ").filter((w) => w.length > 2);
  const responseWords = new Set(normalizedResponse.split(" "));

  if (itemWords.length === 0) {
    return normalizedResponse.includes(normalizedItem);
  }

  // Consider it a match if most words are present (>= 70%)
  const matchedWords = itemWords.filter((word) => responseWords.has(word));
  const matchRate = matchedWords.length / itemWords.length;

  return matchRate >= 0.7;
}

/**
 * Calculate semantic similarity score
 * Based on Jaccard similarity of normalized tokens
 */
function calculateSemanticScore(
  response: string,
  mustInclude: readonly string[]
): number {
  if (mustInclude.length === 0) return 1.0;

  const normalizedResponse = normalizeText(response);
  const responseTokens = new Set(normalizedResponse.split(" "));

  // Collect all tokens from mustInclude items
  const requiredTokens = new Set<string>();
  for (const item of mustInclude) {
    const itemTokens = normalizeText(item).split(" ");
    itemTokens.forEach((token) => {
      if (token.length > 2) {
        // Only significant words
        requiredTokens.add(token);
      }
    });
  }

  if (requiredTokens.size === 0) return 1.0;

  // Calculate intersection
  const intersection = new Set(
    [...requiredTokens].filter((token) => responseTokens.has(token))
  );

  // Jaccard similarity
  const union = new Set([...requiredTokens, ...responseTokens]);
  return intersection.size / union.size;
}

/**
 * Evaluate response against mustInclude criteria
 * Returns detailed evaluation with matches and missing items
 */
export function evaluateResponse(
  response: string,
  mustInclude: readonly string[]
): EvaluationResult {
  if (mustInclude.length === 0) {
    return {
      passed: true,
      score: 1.0,
      matchedCount: 0,
      totalRequired: 0,
      matches: [],
      missing: [],
    };
  }

  const matches: string[] = [];
  const missing: string[] = [];

  // Check each required item
  for (const item of mustInclude) {
    if (isItemMatched(response, item)) {
      matches.push(item);
    } else {
      missing.push(item);
    }
  }

  const matchedCount = matches.length;
  const totalRequired = mustInclude.length;
  const passed = matchedCount === totalRequired;

  // Calculate semantic score
  const score = calculateSemanticScore(response, mustInclude);

  return {
    passed,
    score,
    matchedCount,
    totalRequired,
    matches,
    missing,
  };
}

/**
 * Format evaluation result for display
 */
export function formatEvaluationResult(result: EvaluationResult): string {
  const status = result.passed ? "✅ PASSED" : "❌ FAILED";
  const scorePercent = (result.score * 100).toFixed(1);

  let output = `${status} (${result.matchedCount}/${result.totalRequired} required items, ${scorePercent}% semantic similarity)\n`;

  if (result.matches.length > 0) {
    output += `  ✓ Matched: ${result.matches.join(", ")}\n`;
  }

  if (result.missing.length > 0) {
    output += `  ✗ Missing: ${result.missing.join(", ")}\n`;
  }

  return output.trim();
}
