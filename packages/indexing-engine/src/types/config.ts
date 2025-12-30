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
  confidence: number; // 0-1 scale
  reasoning: string;
}

/**
 * IndexingConfig - Configuration for MCP server data indexing
 * This defines how to fetch, transform, and index data from MCP servers
 */

export interface IndexingConfig {
  version: "1.0";
  source: string; // MCP server name
  displayName: string; // Human-readable name

  fetchers: Record<string, FetcherConfig>;
  recordTypes: Record<string, RecordTypeConfig>;

  /**
   * Tool classifications from LLM analysis
   * Maps tool name -> classification
   */
  toolClassifications?: Record<string, ToolClassification>;
}

/**
 * FetcherConfig - Defines how to fetch data from an MCP tool
 */
export interface FetcherConfig {
  tool: string; // MCP tool name
  description?: string; // For GUI display
  params?: Record<string, any>; // Static params

  pagination?: PaginationConfig;
  incrementalSync?: IncrementalSyncConfig;

  resultPath: string; // JSONPath to records array in response
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
 * RecordTypeConfig - Defines how to detect and transform a record type
 */
export interface RecordTypeConfig {
  name: string; // Record type name (e.g., "page", "task")
  fetcher: string; // Reference to fetcher name

  detection: DetectionConfig;
  enrichments?: EnrichmentConfig[]; // Additional fetches per record

  fields: FieldMappings;
  relationships?: RelationshipConfig[];
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
  paramMapping: Record<string, string>; // { "block_id": "$.id" }
  resultPath: string; // JSONPath to extract from response
  attachTo: string; // Where to store: "enrichments.blocks"
  condition?: string; // Optional: "record.object === 'page'"
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
  condition?: string; // When to extract: "record.parent?.type === 'page_id'"
  type: string; // Relationship type: "CHILD_OF"
  targetType: string; // Target record type
  targetIdPath: string; // JSONPath to target ID
  confidence?: number; // Default 1.0
}

/**
 * Generated config result from LLM
 */
export interface GeneratedConfigResult {
  config: IndexingConfig;
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
