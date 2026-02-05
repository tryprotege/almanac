/**
 * Metadata utilities for tracking dataset state across runs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface DatasetMetadata {
  startDate: string; // ISO string
  lastRunDate: string; // ISO string
  totalDays: number;
  runs: Array<{
    date: string;
    daysGenerated: number;
    recordsAdded: {
      slackMessages: number;
      githubIssues: number;
      githubPRs: number;
      notionPages: number;
      fathomMeetings: number;
    };
  }>;
}

/**
 * Load metadata from file, or return null if it doesn't exist
 */
export function loadMetadata(outputDir: string): DatasetMetadata | null {
  const metadataPath = join(outputDir, 'metadata.json');

  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    const content = readFileSync(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('⚠️  Failed to load metadata, starting fresh:', error);
    return null;
  }
}

/**
 * Save metadata to file
 */
export function saveMetadata(outputDir: string, metadata: DatasetMetadata): void {
  const metadataPath = join(outputDir, 'metadata.json');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Create initial metadata for a new dataset
 */
export function createInitialMetadata(startDate: Date): DatasetMetadata {
  return {
    startDate: startDate.toISOString(),
    lastRunDate: startDate.toISOString(),
    totalDays: 0,
    runs: [],
  };
}

/**
 * Update metadata after a successful run
 * When appending backward, updates the start date
 */
export function updateMetadata(
  metadata: DatasetMetadata,
  daysGenerated: number,
  recordsAdded: DatasetMetadata['runs'][0]['recordsAdded'],
  newStartDate?: Date,
): DatasetMetadata {
  const now = new Date();

  return {
    ...metadata,
    startDate: newStartDate ? newStartDate.toISOString() : metadata.startDate,
    lastRunDate: now.toISOString(),
    totalDays: metadata.totalDays + daysGenerated,
    runs: [
      ...metadata.runs,
      {
        date: now.toISOString(),
        daysGenerated,
        recordsAdded,
      },
    ],
  };
}

/**
 * Calculate the date range for the next generation run
 */
export function calculateDateRange(
  metadata: DatasetMetadata | null,
  timelineDays: number,
): { startDate: Date; endDate: Date; isInitialRun: boolean } {
  if (!metadata) {
    // Initial run - generate from now going back timelineDays
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (timelineDays - 1));

    return {
      startDate,
      endDate,
      isInitialRun: true,
    };
  }

  // Subsequent run - generate backward from the original start date
  // New data will be BEFORE the existing dataset
  const existingStartDate = new Date(metadata.startDate);
  const newEndDate = new Date(existingStartDate);
  newEndDate.setDate(newEndDate.getDate() - 1); // End one day before existing start

  const newStartDate = new Date(newEndDate);
  newStartDate.setDate(newStartDate.getDate() - (timelineDays - 1));

  return {
    startDate: newStartDate,
    endDate: newEndDate,
    isInitialRun: false,
  };
}
