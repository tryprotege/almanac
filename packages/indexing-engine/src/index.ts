/**
 * @almanac/indexing-engine
 * Config-based indexing engine for MCP servers
 */

// Export types
export * from './types/index.js';

// Export executor components
export { transformRecord } from './executor/transformer.js';
export { executeSandboxCode, executeProcessor } from './executor/sandbox.js';

// Export grouping functionality
export {
  GroupingEngine,
  ParentRecordBuilder,
  ThreadGrouper,
  TimeWindowGrouper,
  UserSessionGrouper,
  LLMConversationGrouper,
  extractValue,
  extractValues,
} from './executor/grouping/index.js';

export type {
  GroupingConfig,
  GroupingStrategy,
  IGroupingStrategy,
  RecordGroup,
  GroupingResult,
  GroupingStatistics,
  ThreadGroupingConfig,
  LLMGroupingConfig,
  TimeWindowGroupingConfig,
  SessionGroupingConfig,
  ParentRecordConfig,
} from './executor/grouping/index.js';
export {
  formatProcessors,
  getFormatProcessor,
  registerFormatProcessor,
} from './executor/format-processors.js';
