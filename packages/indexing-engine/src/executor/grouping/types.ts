/**
 * Grouping engine types and interfaces
 */

import type { TransformedRecord } from '../../types/execution.js';
import type {
  GroupingConfig,
  ThreadGroupingConfig,
  LLMGroupingConfig,
  TimeWindowGroupingConfig,
  SessionGroupingConfig,
  HybridGroupingConfig,
  ParentRecordConfig,
} from '../../types/config.js';

// Re-export config types for convenience
export type {
  GroupingConfig,
  ThreadGroupingConfig,
  LLMGroupingConfig,
  TimeWindowGroupingConfig,
  SessionGroupingConfig,
  HybridGroupingConfig,
  ParentRecordConfig,
  TransformedRecord,
};

/**
 * Statistics about grouping operation
 */
export interface GroupingStats {
  totalRecords: number;
  groupsCreated: number;
  standaloneRecords: number;
  parentRecordsCreated: number;
}

/**
 * A group of related records
 */
export interface RecordGroup {
  /** Unique group identifier */
  groupId: string;
  /** Records in this group */
  records: TransformedRecord[];
  /** Group metadata */
  metadata?: Record<string, any>;
}

/**
 * Grouping strategy type (from config)
 */
export type GroupingStrategy =
  | 'thread'
  | 'llm_conversation'
  | 'time_window'
  | 'user_session'
  | 'hybrid';

/**
 * Base interface for grouping strategy implementations
 */
export interface IGroupingStrategy {
  /**
   * Group records according to strategy
   * @param records Records to group
   * @param config Strategy-specific configuration
   * @returns Grouped records
   */
  group(
    records: TransformedRecord[],
    config:
      | ThreadGroupingConfig
      | LLMGroupingConfig
      | TimeWindowGroupingConfig
      | SessionGroupingConfig
      | HybridGroupingConfig,
  ): Promise<RecordGroup[]>;
}

/**
 * Result from grouping operation
 */
export interface GroupingResult {
  /** All records (parents + children or just children) */
  records: TransformedRecord[];
  /** Statistics about the grouping operation */
  statistics: GroupingStatistics;
}

/**
 * Statistics from grouping operation
 */
export interface GroupingStatistics {
  /** Total input records */
  totalRecords: number;
  /** Number of groups created */
  groupsCreated: number;
  /** Number of parent records created */
  parentRecordsCreated: number;
  /** Number of child records grouped */
  childRecordsGrouped: number;
  /** Number of records that remained ungrouped */
  ungroupedRecords: number;
  /** Average group size */
  averageGroupSize: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Batch for LLM processing
 */
export interface Batch {
  /** Records in this batch */
  records: TransformedRecord[];
  /** Start index in original array */
  startIndex: number;
  /** End index in original array */
  endIndex: number;
}

/**
 * Result from processing a batch
 */
export interface BatchResult {
  /** Start index of batch */
  startIndex: number;
  /** End index of batch */
  endIndex: number;
  /** Grouping assignments */
  grouping: Array<{ messageIndex: number; groupId: number }>;
}
