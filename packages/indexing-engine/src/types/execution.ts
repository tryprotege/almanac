/**
 * Runtime execution types for the indexing engine
 */

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
