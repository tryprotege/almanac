/**
 * Runtime execution types for the indexing engine
 */

/**
 * ExtractedEntity - Entity extracted from a record for graph indexing
 */
export interface ExtractedEntity {
  id: string;
  type: string;
  title: string;
  properties?: Record<string, any>;
}

/**
 * ExtractedRelationship - Relationship extracted from a record for graph indexing
 */
export interface ExtractedRelationship {
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  type: string;
  confidence: number;
}

/**
 * TransformedRecord - Unified record format after transformation
 */
export interface TransformedRecord {
  _id: string; // Format: "{source}_{recordType}_{sourceId}"
  source: string;
  sourceId: string;
  recordType: string;

  title: string;
  content: string;
  people?: string[];
  primaryDate?: Date | null;
  tags?: string[];
  parentId?: string | null;

  rawData: any;
  enrichments?: Record<string, any>;

  checksum?: string;
  version?: number;

  // Graph data extracted from record
  extractedEntities?: ExtractedEntity[];
  extractedRelationships?: ExtractedRelationship[];

  // Grouping fields - added for thread/conversation grouping
  isParentRecord?: boolean; // True if this is a parent record created by grouping
  groupId?: string; // Group identifier for records that belong to a group
  childIds?: string[]; // For parent records, IDs of child records
}

/**
 * EnrichedRecord - Record with enrichment data attached
 */
export interface EnrichedRecord {
  record: any;
  enrichments: Record<string, any>;
}

/**
 * IndexProgress - Progress updates during indexing
 */
export interface IndexProgress {
  phase: "fetching" | "enriching" | "transforming" | "storing" | "indexed";
  recordType: string;
  count?: number;
  cursor?: string;
  error?: string;
}

/**
 * Test result from config validation
 */
export interface TestResult {
  status: "pass" | "fail" | "partial";
  recordsTested: number;
  recordsPassed: number;
  issues: TestIssue[];
  suggestions: string[];
  sampleOutputs: TransformedRecord[];
}

export interface TestIssue {
  severity: "error" | "warning" | "info";
  field: string;
  message: string;
  recordId: string;
  expected?: any;
  actual?: any;
}

/**
 * LLM evaluation result
 */
export interface LLMEvaluation {
  status: "pass" | "fail" | "partial";
  additionalIssues: TestIssue[];
  suggestions: string[];
  confidence?: number;
}

/**
 * Fix iteration result
 */
export interface FixIteration {
  iteration: number;
  previousIssues: number;
  newIssues: number;
  changes: ConfigChange[];
  status: "pass" | "fail" | "partial";
}

export interface ConfigChange {
  path: string;
  before: any;
  after: any;
  reason: string;
}
