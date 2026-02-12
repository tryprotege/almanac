/**
 * Tool operation category for determining indexing behavior
 */
export type ToolCategory = 'read' | 'search' | 'write';

/**
 * LLM-generated classification for an MCP tool
 */
export interface ToolClassification {
  toolName: string;
  category: ToolCategory;
}

/**
 * SyncConfig - Configuration for MCP server data synchronization
 * This defines how to fetch, transform, and index data from MCP servers
 */

export interface SyncConfig {
  version: '1.0';
  source: string; // MCP server name
  displayName: string; // Human-readable name

  /**
   * Icon for the data source. Supports:
   * - Emoji: "💬", "📊", "🐙"
   * - Image URL: "https://cdn.example.com/logo.png"
   * - Inline SVG: "<svg>...</svg>"
   */
  icon?: string;

  /**
   * Starting points for indexing
   * Define entry points that seed the indexing process
   * Users can provide specific IDs/values to start crawling from
   */
  startingPoints?: StartingPointConfig[];

  fetchers: Record<string, FetcherConfig>;
  recordTypes: Record<string, RecordTypeConfig>;

  /**
   * Tool classifications from LLM analysis
   * Maps tool name -> classification
   */
  toolClassifications?: Record<string, ToolClassification>;

  /**
   * Sync order - defines the order in which fetchers should be executed
   * This is critical for handling data dependencies (e.g., sync users/teams before issues)
   * If not specified, fetchers will be executed in Object.entries() order
   */
  syncOrder?: string[];

  /**
   * Global rate limiting configuration
   * Can be overridden per-fetcher
   */
  rateLimit?: RateLimitConfig;

  /**
   * Post-processing configuration
   * Run after initial indexing to discover additional records
   */
  postProcessing?: PostProcessingConfig;
}

/**
 * StartingPointConfig - Defines a starting point for indexing
 * Starting points are entry points that users provide to seed the indexing process
 */
export interface StartingPointConfig {
  /** Unique name for this starting point (e.g., "teamIds", "pageIds") */
  name: string;

  /** Human-readable description */
  description: string;

  /** Whether this starting point is required (must have values) */
  required?: boolean;

  /** Whether user must provide values for this starting point */
  userProvided?: boolean;

  /** Example values to help users understand what to provide */
  examples?: string[];

  /** Discovery configuration for auto-populating starting points */
  discovery?: StartingPointDiscoveryConfig;
}

/**
 * StartingPointDiscoveryConfig - Configuration for discovering starting point values
 * Enables automatic discovery of starting points when user doesn't provide them
 */
export interface StartingPointDiscoveryConfig {
  /** Fetcher to run for discovery (must not require starting points itself) */
  fetcher: string;

  /** JSONPath to extract starting point values from discovery results */
  valuePath: string;

  /** Optional: Filter condition to identify valid starting points */
  filter?: string; // JS expression, e.g., "record.parent?.type === 'workspace'"

  /** Optional: Transform discovered values before using */
  transform?: string; // JSONPath or template, e.g., "$.id"

  /** Description of what's being discovered */
  description?: string;
}

/**
 * SeedFromConfig - Seed a fetcher from starting point values
 * Alternative to forEach - used when you want to iterate over user-provided starting values
 * instead of results from another fetcher
 */
export interface SeedFromConfig {
  /** Name of the starting point to use */
  startingPoint: string;

  /** Map starting point fields to tool parameters */
  paramMapping: Record<string, string>; // e.g., { "page_id": "$.id", "format": "markdown" }

  /** Max concurrent calls (default: 3) */
  concurrency?: number;

  /** Continue with partial results if some calls fail (default: true) */
  continueOnError?: boolean;

  /** Number of retries per failed call (default: 2) */
  retries?: number;
}

/**
 * FetcherConfig - Defines how to fetch data from an MCP tool
 */
export interface FetcherConfig {
  tool: string; // MCP tool name
  description?: string; // For GUI display
  params?: Record<string, any>; // Static params (can include "${startingPoint:name.field}" template syntax)

  /**
   * Seed this fetcher from a starting point
   * Alternative to forEach - used when you want to iterate over user-provided starting values
   * instead of results from another fetcher
   */
  seedFrom?: SeedFromConfig;

  /**
   * Dynamic iteration over previous fetcher results
   * When specified, this fetcher will be called once per item from the source fetcher
   * Results from all calls are aggregated
   */
  forEach?: ForEachConfig;

  /**
   * Aggregate content from other fetchers into the parent record
   * Enables merging data from child tool calls before creating the record
   * Useful for including related data inline (e.g., page blocks within a page)
   */
  aggregateContent?: Record<string, AggregationConfig>;

  /**
   * Extract specific fields from aggregated data
   * Applied after content aggregation to pull out specific values
   * Maps field name -> JMESPath expression
   */
  extractFromAggregation?: Record<string, string>;

  /**
   * Parameters that reference the parent record in aggregation scenarios
   * Used when this fetcher is called as part of content aggregation
   * Example: { "block_id": "$parent.id" }
   */
  paramsFromParent?: Record<string, string>;

  /**
   * Transform the result using JMESPath expressions
   * Maps field name -> JMESPath expression to extract/transform data
   * Applied after tool call but before record creation
   */
  transformResult?: Record<string, string>;

  pagination?: PaginationConfig;
  incrementalSync?: IncrementalSyncConfig;

  resultPath: string; // JSONPath to records array in response

  /**
   * Optional JSONPath to extract individual records from nested arrays
   * Applied after initial response parsing to extract items from wrapper objects
   * Example: "$.items[*]" to extract items from {items: [...], next_cursor: "..."}
   */
  arrayPath?: string;

  /**
   * Rate limiting for this specific fetcher
   * Overrides global rateLimit config if specified
   */
  rateLimit?: RateLimitConfig;

  /**
   * Cutoff date configuration for filtering records by date
   * When SYNC_CUTOFF_DATE environment variable is set, records older than this date will be filtered
   */
  cutoffDate?: CutoffDateConfig;

  /**
   * Format processor configuration
   * Transforms raw response data (e.g., CSV to JSON) before processing
   */
  formatProcessor?: {
    name: string; // Processor name (e.g., "csv-to-json")
    options?: Record<string, any>; // Processor-specific options
  };
}

export interface PaginationConfig {
  type: 'cursor' | 'offset' | 'none';
  limitParam?: string; // e.g., "page_size"
  cursorParam?: string; // e.g., "start_cursor"
  cursorPath?: string; // JSONPath to next cursor in response
  offsetParam?: string; // e.g., "offset"
  hasMorePath?: string; // JSONPath to check if more pages exist
}

export interface IncrementalSyncConfig {
  sinceParam?: string; // e.g., "last_edited_time"
  sinceFormat?: 'iso8601' | 'unix' | 'unix_ms';
}

/**
 * CutoffDateConfig - Configuration for filtering records by cutoff date
 * Enables filtering of old records using SYNC_CUTOFF_DATE environment variable
 */
export interface CutoffDateConfig {
  /**
   * Where to apply the cutoff filter
   * - "api": Use API parameter (preferred, most efficient)
   * - "post_fetch": Filter after fetching (fallback)
   * - "both": Use API param + validate after fetching (safest)
   */
  strategy: 'api' | 'post_fetch' | 'both';

  /**
   * For API strategy: parameter name in the tool
   * Example: "oldest" for Slack, "since" for GitHub
   */
  apiParam?: string;

  /**
   * For API strategy: date format required by API
   */
  apiFormat?: 'unix' | 'unix_ms' | 'iso8601';

  /**
   * For post_fetch strategy: JSONPath to date field in record
   * Example: "$.last_edited_time" for Notion, "$.ts" for Slack
   */
  dateFieldPath: string;

  /**
   * Whether to use SYNC_CUTOFF_DATE from env by default
   * Default: true
   */
  useEnvDefault?: boolean;
}

/**
 * RateLimitConfig - Rate limiting configuration for API calls
 */
export interface RateLimitConfig {
  /**
   * Maximum requests per time window
   * Example: 60 for "60 requests per 60 seconds"
   */
  maxRequests: number;

  /**
   * Time window in seconds
   * Example: 60 for "60 requests per 60 seconds"
   */
  windowSeconds: number;
}

/**
 * ForEachConfig - Iterate over previous fetcher results
 * Allows calling a tool once per record from a source fetcher
 * This enables dynamic parameter generation based on earlier fetcher results
 */
export interface ForEachConfig {
  /** Reference to a fetcher that runs earlier (per syncOrder) */
  source: string;

  /** JSONPath to iterate over source records, e.g., "$[*]" for all */
  path: string;

  params?: Record<string, any>; // Static params (can include "${startingPoint:name.field}" template syntax)

  /** Map source record fields to tool parameters */
  paramMapping: Record<string, string>; // e.g., { "team": "$.name" }

  /**
   * Batch mode - call tool with array of values instead of one-by-one
   * Use when the tool accepts an array parameter (e.g., teams: string[])
   */
  batchMode?: {
    /** The parameter name that accepts an array */
    batchParam: string; // e.g., "teams"
    /** JSONPath to extract the value from each item, e.g., "$.name" */
    valueMapping: string;
    /** Max items per batch (default: 100). Split into multiple batches if exceeded */
    batchSize?: number;
  };

  /** Max concurrent tool calls (default: 3) - applies to individual or batch calls */
  concurrency?: number;

  /** Continue with partial results if some calls fail (default: true) */
  continueOnError?: boolean;

  /** Number of retries per failed call (default: 2) */
  retries?: number;
}

/**
 * RecordTypeConfig - Defines how to detect and transform a record type
 */
export interface RecordTypeConfig {
  name: string; // Record type name (e.g., "page", "task"). Falls back to the key in recordTypes if not provided
  fetcher: string; // Reference to fetcher name

  /**
   * JSONPath to the ID field in the record
   * If not specified, falls back to common ID patterns: id, _id, sourceId, etc.
   * Example: "$.ID" for uppercase ID field from CSV processors
   */
  idField?: string;

  detection: DetectionConfig;
  enrichments?: EnrichmentConfig[]; // Additional fetches per record
  entities?: EntityExtractionConfig[]; // Extract entities to build graph (NEW)

  fields: FieldMappings;
  relationships?: RelationshipConfig[]; // Enhanced to create graph edges

  /**
   * Post-fetch grouping configuration
   * Enables grouping related records (e.g., messages into threads/conversations)
   * and creating parent records to represent those groups
   */
  grouping?: GroupingConfig;
}

export interface DetectionConfig {
  condition?: string; // JS expression: "record.object === 'page'"
  always?: boolean; // If true, all records match this type
}

/**
 * EnrichmentConfig - Fetch additional data for each record
 */
export interface EnrichmentConfig {
  name: string; // For debugging
  fetcher?: string; // Reference to existing fetcher
  tool?: string; // If inline fetcher definition
  paramMapping: Record<string, any>; // { "block_id": "$.id" } - strings starting with $ are JSONPath, others are literals
  resultPath: string; // JSONPath to extract from response
  attachTo: string; // Where to store: "enrichments.blocks"
  condition?: string; // Optional: "record.object === 'page'"
}

/**
 * EntityExtractionConfig - Extract entities from records to build graph
 */
export interface EntityExtractionConfig {
  name: string; // Field name for debugging (e.g., "status", "assignee")
  type: string; // Entity type in graph (e.g., "Status", "User", "Team")
  idPath: string; // JSONPath to entity ID: "$.status.id"
  titlePath: string; // JSONPath to entity title: "$.status.name"
  condition?: string; // Optional: "record.status && record.status.id"
  properties?: Record<string, string>; // Additional paths: { "color": "$.status.color" }
}

/**
 * FieldMappings - Map source data to unified record fields
 */
export interface FieldMappings {
  title: FieldMapping;
  content: FieldMapping;
  people?: FieldMapping;
  sourceCreatedAt?: FieldMapping;
  sourceUpdatedAt?: FieldMapping;
  tags?: FieldMapping;
  parentId?: FieldMapping;
}

/**
 * FieldMapping - Different ways to extract/transform field values
 */
export type FieldMapping =
  | PathMapping
  | PathsMapping
  | TemplateMapping
  | CodeMapping
  | ProcessorMapping;

export interface PathMapping {
  type: 'path';
  path: string; // JSONPath: "$.properties.Name.title[0].text.content"
}

export interface PathsMapping {
  type: 'paths';
  paths: string[]; // Multiple paths to combine
  join?: string; // Join string (default: ' ')
}

export interface TemplateMapping {
  type: 'template';
  template: string; // Template: "${record.name} - ${record.id}"
}

export interface CodeMapping {
  type: 'code';
  code: string; // Full TypeScript code
}

export interface ProcessorMapping {
  type: 'processor';
  processor: string; // Format processor name
  input: string; // JSONPath to input data
  options?: Record<string, any>; // Processor-specific options
}

/**
 * RelationshipConfig - Extract relationships between records
 */
export interface RelationshipConfig {
  name: string; // For debugging
  condition?: string; // When to create: "record.project != null"
  type: string; // Edge type: "HAS_STATUS", "BELONGS_TO", "ASSIGNED_TO"

  // Source entity (the current record becomes a document node)
  sourceType?: string; // Optional: "Issue", default is record type
  sourceIdPath?: string; // Optional: override source ID

  // Target entity
  targetType: string; // Required: "Status", "Project", "User"
  targetIdPath: string; // Required: "$.status.id", "$.project.id"

  confidence?: number; // Default 1.0
}

/**
 * GroupingConfig - Post-fetch record grouping configuration
 * Enables grouping related records and creating parent records
 */
export interface GroupingConfig {
  /**
   * Strategy for grouping records
   * - "thread": Group by thread identifier (e.g., thread_ts in Slack)
   * - "llm_conversation": Use LLM to analyze and group related messages
   * - "time_window": Group by time proximity
   * - "user_session": Group by user activity sessions
   * - "hybrid": Combine thread and LLM grouping intelligently
   */
  strategy: 'thread' | 'llm_conversation' | 'time_window' | 'user_session' | 'hybrid';

  /**
   * Configuration specific to the strategy
   */
  config:
    | ThreadGroupingConfig
    | LLMGroupingConfig
    | TimeWindowGroupingConfig
    | SessionGroupingConfig
    | HybridGroupingConfig;

  /**
   * Minimum number of records required to form a group
   * Groups with fewer records will be filtered out
   */
  minGroupSize?: number;

  /**
   * Configuration for creating parent records from groups
   * If specified, parent records will be created for each group
   */
  parentRecord?: ParentRecordConfig;
}

/**
 * ThreadGroupingConfig - Group records by thread identifier
 */
export interface ThreadGroupingConfig {
  /**
   * JSONPath to thread identifier in record
   * Example: "$.thread_ts" for Slack
   */
  threadIdPath: string;

  /**
   * JSONPath to parent message indicator
   * Example: "$.reply_count" (if exists and > 0, it's a parent)
   */
  parentIndicatorPath?: string;
}

/**
 * LLMGroupingConfig - Use LLM to group related records into conversations
 */
export interface LLMGroupingConfig {
  /**
   * Model to use for grouping analysis
   */
  model?: string; // defaults to env.LLM_CHAT_MODEL

  /**
   * System prompt for the LLM (can include variables)
   */
  systemPrompt: string;

  /**
   * Fields to include in the grouping analysis
   * Example: ["$.text", "$.user", "$.ts"]
   */
  analysisFields: string[];

  /**
   * Batch size for processing (default: 50)
   */
  batchSize?: number;

  /**
   * Overlap between batches for context (default: 10)
   */
  batchOverlap?: number;

  /**
   * Max concurrent LLM calls (default: 3)
   */
  concurrency?: number;

  /**
   * Sorting before grouping
   */
  sortBy?: string; // JSONPath, e.g., "$.ts"
  sortOrder?: 'asc' | 'desc';
}

/**
 * TimeWindowGroupingConfig - Group records by time proximity
 */
export interface TimeWindowGroupingConfig {
  /**
   * JSONPath to timestamp field
   */
  timestampPath: string;

  /**
   * Window size in seconds
   */
  windowSeconds: number;

  /**
   * Optional: Group only if same user
   */
  sameUserPath?: string;

  /**
   * Optional: Group only if same channel/context
   */
  sameContextPath?: string;
}

/**
 * SessionGroupingConfig - Group records by user session
 */
export interface SessionGroupingConfig {
  /**
   * JSONPath to user identifier
   */
  userIdPath: string;

  /**
   * JSONPath to timestamp
   */
  timestampPath: string;

  /**
   * Session timeout in seconds (default: 1800 = 30 min)
   */
  sessionTimeoutSeconds?: number;

  /**
   * Optional: Additional context matching
   */
  contextPath?: string;
}

/**
 * HybridGroupingConfig - Combine thread and LLM grouping
 * First groups by explicit threads, then applies LLM to ungrouped records
 */
export interface HybridGroupingConfig {
  /**
   * Configuration for thread-based grouping (Phase 1)
   */
  threadConfig: ThreadGroupingConfig;

  /**
   * Configuration for LLM-based grouping (Phase 2)
   */
  llmConfig: LLMGroupingConfig;

  /**
   * Minimum conversation size for LLM-grouped records
   * Records in smaller groups become standalone
   */
  minConversationSize?: number;
}

/**
 * ParentRecordConfig - Configuration for creating parent records
 */
export interface ParentRecordConfig {
  /**
   * Record type name for the parent (e.g., "thread", "conversation")
   */
  recordType: string;

  /**
   * How to generate the parent's sourceId
   * - "first_child": Use first child's sourceId with prefix
   * - "concatenate": Concatenate child IDs
   * - "hash": Hash of child IDs
   * - "template": Use template with variables
   */
  sourceIdStrategy: 'first_child' | 'concatenate' | 'hash' | 'template';

  /**
   * Template or prefix for sourceId (if applicable)
   * Example: "thread-${firstChild.sourceId}"
   */
  sourceIdTemplate?: string;

  /**
   * Field mappings for parent record
   * Can reference: firstChild, lastChild, allChildren, groupId
   */
  fields: ParentFieldMappings;

  /**
   * Store child IDs in parent's rawData (default: true)
   */
  storeChildIds?: boolean;

  /**
   * Child ID field name in rawData (default: "childIds")
   */
  childIdsField?: string;

  /**
   * Entity extraction configurations for parent record
   * Entities extracted from children will be aggregated (deduplicated)
   */
  entities?: EntityExtractionConfig[];

  /**
   * Relationship extraction configurations for parent record
   * Relationships extracted from children will be aggregated
   */
  relationships?: RelationshipConfig[];
}

/**
 * ParentFieldMappings - Field mappings for parent records
 */
export interface ParentFieldMappings {
  title: ParentFieldMapping;
  content: ParentFieldMapping;
  people?: ParentFieldMapping;
  sourceCreatedAt?: ParentFieldMapping;
  sourceUpdatedAt?: ParentFieldMapping;
  tags?: ParentFieldMapping;
}

/**
 * ParentFieldMapping - Field mapping for parent records
 */
export type ParentFieldMapping = PathMapping | AggregateMapping | TemplateMapping | CodeMapping;

/**
 * AggregateMapping - Aggregate values from child records
 */
export interface AggregateMapping {
  type: 'aggregate';
  /**
   * Aggregation function
   * - "concat": Concatenate from all children
   * - "merge": Merge arrays/objects
   * - "first": Take from first child
   * - "last": Take from last child
   * - "unique": Collect unique values
   */
  function: 'concat' | 'merge' | 'first' | 'last' | 'unique';

  /**
   * JSONPath to extract from each child
   */
  path: string;

  /**
   * Separator for concat (default: "\n")
   */
  separator?: string;

  /**
   * Template for each item (optional)
   * Example: "[${child.ts}] ${child.user}: ${child.text}"
   */
  itemTemplate?: string;
}

/**
 * Generated config result from LLM
 */
export interface GeneratedSyncConfigResult {
  config: SyncConfig;
  validation: ValidationResult;
  samples: Record<string, any>; // Sample data used for generation
  toolsUsed: string[]; // MCP tools analyzed
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

/**
 * AggregationConfig - Configuration for aggregating content from another fetcher
 */
export interface AggregationConfig {
  /** Name of the fetcher to execute for aggregation */
  fetcher: string;

  /**
   * How to merge the aggregated data with the parent record
   * - "replace": Replace parent field entirely
   * - "merge": Deep merge objects/arrays
   * - "append": Append to parent field (for arrays)
   */
  mergeStrategy?: 'replace' | 'merge' | 'append';

  /** Whether this aggregation is required (fail if it fails) */
  required?: boolean;
}

/**
 * PostProcessingConfig - Configuration for post-processing after initial indexing
 * Enables discovering and fetching additional records based on relationships
 */
export interface PostProcessingConfig {
  /** Whether post-processing is enabled */
  enabled: boolean;

  /**
   * Relationship types to follow for discovering new records
   * Example: ["CHILD_OF", "PARENT_OF", "REFERENCES"]
   */
  followRelationships: string[];

  /**
   * Maximum iterations of relationship following
   * Prevents infinite loops in circular references
   * Default: 5
   */
  maxIterations?: number;

  /**
   * Continue processing even if some records fail to fetch
   * Default: true
   */
  continueOnError?: boolean;

  /**
   * Description for documentation/UI purposes
   */
  description?: string;
}

/**
 * IndexingConfig - Type alias for SyncConfig
 * This provides naming consistency with the server models
 */
export type IndexingConfig = SyncConfig;
