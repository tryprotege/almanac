/**
 * Tool operation category for determining indexing behavior
 */
export type ToolCategory = "read" | "search" | "write";

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
  version: "1.0";
  source: string; // MCP server name
  displayName: string; // Human-readable name

  /**
   * Icon for the data source. Supports:
   * - Emoji: "💬", "📊", "🐙"
   * - Image URL: "https://cdn.example.com/logo.png"
   * - Inline SVG: "<svg>...</svg>"
   */
  icon?: string;

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
}

/**
 * FetcherConfig - Defines how to fetch data from an MCP tool
 */
export interface FetcherConfig {
  tool: string; // MCP tool name
  description?: string; // For GUI display
  params?: Record<string, any>; // Static params

  /**
   * Dynamic iteration over previous fetcher results
   * When specified, this fetcher will be called once per item from the source fetcher
   * Results from all calls are aggregated
   */
  forEach?: ForEachConfig;

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
}

export interface PaginationConfig {
  type: "cursor" | "offset" | "none";
  limitParam?: string; // e.g., "page_size"
  cursorParam?: string; // e.g., "start_cursor"
  cursorPath?: string; // JSONPath to next cursor in response
  offsetParam?: string; // e.g., "offset"
  hasMorePath?: string; // JSONPath to check if more pages exist
}

export interface IncrementalSyncConfig {
  sinceParam?: string; // e.g., "last_edited_time"
  sinceFormat?: "iso8601" | "unix" | "unix_ms";
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

  /**
   * Strategy for handling rate limits
   * - "respect_retry_after": Wait for Retry-After header from 429 responses (reactive)
   * - "exponential_backoff": Exponentially increase wait time on 429s (reactive)
   * - "token_bucket": Proactive rate limiting using token bucket algorithm (proactive)
   * Default: "token_bucket"
   */
  strategy?: "respect_retry_after" | "exponential_backoff" | "token_bucket";

  /**
   * Initial backoff delay in milliseconds (for exponential_backoff)
   * Default: 1000
   */
  initialBackoffMs?: number;

  /**
   * Maximum backoff delay in milliseconds
   * Default: 60000 (1 minute)
   */
  maxBackoffMs?: number;

  /**
   * Allow burst traffic beyond average rate
   * When true, uses token bucket with burst capacity
   * Default: true (mimics APIs like Notion that allow bursts)
   */
  allowBurst?: boolean;

  /**
   * Burst capacity multiplier (only for token_bucket strategy)
   * Allows burst up to maxRequests * burstMultiplier
   * Default: 1.5 (allows 50% burst capacity)
   */
  burstMultiplier?: number;
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
  name: string; // Record type name (e.g., "page", "task")
  fetcher: string; // Reference to fetcher name

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
  primaryDate?: FieldMapping;
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
  type: "path";
  path: string; // JSONPath: "$.properties.Name.title[0].text.content"
}

export interface PathsMapping {
  type: "paths";
  paths: string[]; // Multiple paths to combine
  join?: string; // Join string (default: ' ')
}

export interface TemplateMapping {
  type: "template";
  template: string; // Template: "${record.name} - ${record.id}"
}

export interface CodeMapping {
  type: "code";
  code: string; // Full TypeScript code
}

export interface ProcessorMapping {
  type: "processor";
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
   */
  strategy: "thread" | "llm_conversation" | "time_window" | "user_session";

  /**
   * Configuration specific to the strategy
   */
  config:
    | ThreadGroupingConfig
    | LLMGroupingConfig
    | TimeWindowGroupingConfig
    | SessionGroupingConfig;

  /**
   * Parent record to create for each group
   */
  parentRecord: ParentRecordConfig;

  /**
   * Minimum group size to create a parent (default: 2)
   * Groups smaller than this remain as standalone records
   */
  minGroupSize?: number;

  /**
   * Maximum group size before splitting (optional)
   */
  maxGroupSize?: number;
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
  sortOrder?: "asc" | "desc";
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
  sourceIdStrategy: "first_child" | "concatenate" | "hash" | "template";

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
}

/**
 * ParentFieldMappings - Field mappings for parent records
 */
export interface ParentFieldMappings {
  title: ParentFieldMapping;
  content: ParentFieldMapping;
  people?: ParentFieldMapping;
  primaryDate?: ParentFieldMapping;
  tags?: ParentFieldMapping;
}

/**
 * ParentFieldMapping - Field mapping for parent records
 */
export type ParentFieldMapping =
  | PathMapping
  | AggregateMapping
  | TemplateMapping
  | CodeMapping;

/**
 * AggregateMapping - Aggregate values from child records
 */
export interface AggregateMapping {
  type: "aggregate";
  /**
   * Aggregation function
   * - "concat": Concatenate from all children
   * - "merge": Merge arrays/objects
   * - "first": Take from first child
   * - "last": Take from last child
   * - "unique": Collect unique values
   */
  function: "concat" | "merge" | "first" | "last" | "unique";

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
 * IndexingConfig - Type alias for SyncConfig
 * This provides naming consistency with the server models
 */
export type IndexingConfig = SyncConfig;
