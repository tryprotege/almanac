/**
 * Accuracy Metrics - Pure Functional Approach
 * Functions for evaluating retrieval and ranking quality
 */

import type { AccuracyMetrics } from '../types/index.js';
import { mean } from './statistics.js';

/**
 * Calculate precision: % of retrieved documents that are relevant
 */
export const calculatePrecision = (
  retrieved: readonly string[],
  relevant: readonly string[],
): number => {
  if (retrieved.length === 0) return 0;
  const relevantRetrieved = retrieved.filter((doc) => relevant.includes(doc));
  return relevantRetrieved.length / retrieved.length;
};

/**
 * Calculate recall: % of relevant documents that were retrieved
 */
export const calculateRecall = (
  retrieved: readonly string[],
  relevant: readonly string[],
): number => {
  if (relevant.length === 0) return 0;
  const relevantRetrieved = retrieved.filter((doc) => relevant.includes(doc));
  return relevantRetrieved.length / relevant.length;
};

/**
 * Calculate F1 score: harmonic mean of precision and recall
 */
export const calculateF1 = (precision: number, recall: number): number => {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
};

/**
 * Calculate Mean Reciprocal Rank (MRR)
 * Measures how early the first relevant document appears
 */
export const calculateMRR = (retrieved: readonly string[], relevant: readonly string[]): number => {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.includes(retrieved[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
};

/**
 * Calculate Normalized Discounted Cumulative Gain (NDCG)
 * Measures ranking quality with position-based discounting
 */
export const calculateNDCG = (
  retrieved: readonly string[],
  relevant: readonly string[],
  relevanceScores?: Readonly<Record<string, number>>,
): number => {
  // Calculate DCG (Discounted Cumulative Gain)
  const dcg = retrieved.reduce((sum, doc, index) => {
    const relevance = relevanceScores ? relevanceScores[doc] || 0 : relevant.includes(doc) ? 1 : 0;
    const position = index + 1;
    return sum + relevance / Math.log2(position + 1);
  }, 0);

  // Calculate ideal DCG (IDCG) - best possible ranking
  const sortedRelevance = relevant
    .map((doc) => (relevanceScores ? relevanceScores[doc] || 1 : 1))
    .sort((a, b) => b - a);

  const idcg = sortedRelevance.reduce((sum, relevance, index) => {
    const position = index + 1;
    return sum + relevance / Math.log2(position + 1);
  }, 0);

  return idcg === 0 ? 0 : dcg / idcg;
};

/**
 * Calculate semantic similarity between two text arrays
 * Uses simple Jaccard similarity (can be enhanced with embeddings)
 */
export const calculateJaccardSimilarity = (
  setA: readonly string[],
  setB: readonly string[],
): number => {
  const a = new Set(setA);
  const b = new Set(setB);

  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);

  return union.size === 0 ? 0 : intersection.size / union.size;
};

/**
 * Calculate semantic similarity using token overlap
 */
export const calculateTokenOverlap = (textA: string, textB: string): number => {
  const tokensA = textA.toLowerCase().split(/\s+/);
  const tokensB = textB.toLowerCase().split(/\s+/);

  return calculateJaccardSimilarity(tokensA, tokensB);
};

/**
 * Evaluate full accuracy metrics
 */
export const evaluateAccuracy = (
  retrieved: readonly string[],
  relevant: readonly string[],
  relevanceScores?: Readonly<Record<string, number>>,
): AccuracyMetrics => {
  const precision = calculatePrecision(retrieved, relevant);
  const recall = calculateRecall(retrieved, relevant);

  return {
    queryId: '', // Will be filled by caller
    precision,
    recall,
    f1: calculateF1(precision, recall),
    mrr: calculateMRR(retrieved, relevant),
    ndcg: calculateNDCG(retrieved, relevant, relevanceScores),
    semanticSimilarity: calculateJaccardSimilarity(retrieved, relevant),
  };
};

/**
 * Calculate average precision across multiple queries
 */
export const calculateMAP = (
  queries: readonly {
    retrieved: readonly string[];
    relevant: readonly string[];
  }[],
): number => {
  if (queries.length === 0) return 0;

  const avgPrecisions = queries.map(({ retrieved, relevant }) => {
    let relevantCount = 0;
    let sumPrecision = 0;

    retrieved.forEach((doc, index) => {
      if (relevant.includes(doc)) {
        relevantCount++;
        sumPrecision += relevantCount / (index + 1);
      }
    });

    return relevant.length === 0 ? 0 : sumPrecision / relevant.length;
  });

  return mean(avgPrecisions);
};

/**
 * Calculate Hit Rate @ K
 * Percentage of queries that have at least one relevant result in top K
 */
export const calculateHitRate = (
  queries: readonly {
    retrieved: readonly string[];
    relevant: readonly string[];
  }[],
  k: number,
): number => {
  if (queries.length === 0) return 0;

  const hits = queries.filter(({ retrieved, relevant }) => {
    const topK = retrieved.slice(0, k);
    return topK.some((doc) => relevant.includes(doc));
  }).length;

  return hits / queries.length;
};

/**
 * Calculate Coverage @ K
 * Average percentage of relevant documents found in top K
 */
export const calculateCoverage = (
  queries: readonly {
    retrieved: readonly string[];
    relevant: readonly string[];
  }[],
  k: number,
): number => {
  if (queries.length === 0) return 0;

  const coverages = queries.map(({ retrieved, relevant }) => {
    const topK = retrieved.slice(0, k);
    const found = topK.filter((doc) => relevant.includes(doc)).length;
    return relevant.length === 0 ? 0 : found / relevant.length;
  });

  return mean(coverages);
};

/**
 * Format accuracy metrics for display
 */
export const formatAccuracyMetrics = (metrics: AccuracyMetrics): string => {
  return `
Accuracy Metrics
================
Precision:  ${(metrics.precision * 100).toFixed(1)}% (${metrics.precision.toFixed(3)})
Recall:     ${(metrics.recall * 100).toFixed(1)}% (${metrics.recall.toFixed(3)})
F1 Score:   ${metrics.f1.toFixed(3)}
MRR:        ${metrics.mrr.toFixed(3)}
NDCG:       ${metrics.ndcg.toFixed(3)}
Similarity: ${(metrics.semanticSimilarity * 100).toFixed(1)}%
  `.trim();
};
