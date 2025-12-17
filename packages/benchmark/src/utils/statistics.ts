/**
 * Statistical Functions - Pure Functional Approach
 * All functions are pure and composable
 */

import type { Statistics } from "../types/index.js";

/**
 * Calculate mean of numbers
 */
export const mean = (numbers: readonly number[]): number => {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
};

/**
 * Calculate median of numbers
 */
export const median = (numbers: readonly number[]): number => {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

/**
 * Calculate standard deviation
 */
export const stdDev = (numbers: readonly number[]): number => {
  if (numbers.length === 0) return 0;
  const avg = mean(numbers);
  const squareDiffs = numbers.map((n) => Math.pow(n - avg, 2));
  return Math.sqrt(mean(squareDiffs));
};

/**
 * Calculate percentile
 */
export const percentile = (numbers: readonly number[], p: number): number => {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, index)];
};

/**
 * Calculate min value
 */
export const min = (numbers: readonly number[]): number => {
  if (numbers.length === 0) return 0;
  return Math.min(...numbers);
};

/**
 * Calculate max value
 */
export const max = (numbers: readonly number[]): number => {
  if (numbers.length === 0) return 0;
  return Math.max(...numbers);
};

/**
 * Calculate full statistics for a dataset
 */
export const calculateStatistics = (
  numbers: readonly number[]
): Statistics => ({
  mean: mean(numbers),
  median: median(numbers),
  min: min(numbers),
  max: max(numbers),
  stdDev: stdDev(numbers),
  p95: percentile(numbers, 0.95),
  p99: percentile(numbers, 0.99),
});

/**
 * Sum of numbers
 */
export const sum = (numbers: readonly number[]): number =>
  numbers.reduce((acc, n) => acc + n, 0);

/**
 * Count occurrences
 */
export const count = <T>(
  items: readonly T[],
  predicate: (item: T) => boolean
): number => items.filter(predicate).length;

/**
 * Group by key
 */
export const groupBy = <T, K extends string | number>(
  items: readonly T[],
  keyFn: (item: T) => K
): Record<K, T[]> => {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {} as Record<K, T[]>);
};

/**
 * Calculate average with custom extractor
 */
export const averageBy = <T>(
  items: readonly T[],
  extractor: (item: T) => number
): number => {
  if (items.length === 0) return 0;
  return mean(items.map(extractor));
};

/**
 * Calculate statistics by group
 */
export const statisticsByGroup = <T, K extends string | number>(
  items: readonly T[],
  keyFn: (item: T) => K,
  valueFn: (item: T) => number
): Record<K, Statistics> => {
  const grouped = groupBy(items, keyFn);
  return Object.entries(grouped).reduce((acc, [key, group]) => {
    acc[key as K] = calculateStatistics((group as T[]).map(valueFn));
    return acc;
  }, {} as Record<K, Statistics>);
};
