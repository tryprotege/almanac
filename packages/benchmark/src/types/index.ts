/**
 * Benchmark Types - Functional Programming Approach
 * All types are immutable and composable
 */

import { McpStdioServerConfig } from "@anthropic-ai/claude-agent-sdk";

// Import types from server package (defined locally to avoid dependency issues)
export type LightRAGMode = "naive" | "local" | "global" | "hybrid" | "mix";

export interface LightRAGQuery {
  query: string;
  mode?: LightRAGMode;
  response_format?: "compact" | "full";
  top_k?: number;
  chunk_top_k?: number;
  enable_rerank?: boolean;
  score_threshold?: number;
}

export interface LightRAGChunk {
  id: string;
  document_id: string;
  title: string;
  source: string;
  source_id: string;
  snippet: string;
  score: number;
  type?: string;
  people?: string[];
}

export interface LightRAGResponse {
  query: string;
  mode: LightRAGMode;
  processing_time_ms: number;
  chunks: LightRAGChunk[];
  stats: {
    total_chunks: number;
    unique_documents: number;
    processing_time_ms: number;
    retrieval_breakdown?: {
      vector_matches: number;
      graph_expanded: number;
      reranked: boolean;
    };
  };
  metadata?: {
    keywords_extracted?: {
      high_level: string[];
      low_level: string[];
    };
    filters_applied?: boolean;
  };
}

// ============================================
// Core Configuration Types
// ============================================

export type BenchmarkType =
  | "query"
  | "agent"
  | "comparison"
  | "accuracy"
  | "matrix";

export type QueryCategory =
  | "entity_focused" // Who, What, Where
  | "relationship" // How, Why
  | "temporal" // When
  | "aggregation" // Count, Sum
  | "exploratory"; // Open-ended

export type AgentName =
  | "claude"
  | "claude-cli"
  | "amp"
  | "roo-code"
  | "chatgpt"
  | "gemini"
  | "cline"
  | string; // Allow any string for custom agent names

export type EvaluationMetric =
  | "response_quality"
  | "answer_completeness"
  | "factual_accuracy"
  | "reasoning_depth"
  | "token_efficiency";

// ============================================
// Base Configuration
// ============================================

export interface BaseBenchmarkConfig {
  readonly name: string;
  readonly description: string;
  readonly type: BenchmarkType;
  readonly iterations: number;
  readonly warmupRuns?: number;
  readonly timeout?: number;
  readonly outputDir: string;
}

// ============================================
// Query Benchmark Types
// ============================================

export interface BenchmarkQuery {
  readonly id: string;
  readonly query: string;
  readonly category: QueryCategory;
  readonly expectedEntities?: readonly string[];
  readonly expectedConcepts?: readonly string[];
  readonly groundTruth?: GroundTruth;
}

export interface GroundTruth {
  readonly relevantDocuments: readonly string[];
  readonly requiredEntities?: readonly string[];
  readonly requiredRelationships?: readonly string[];
  readonly minRelevanceScore?: number;
}

export interface QueryBenchmarkConfig extends BaseBenchmarkConfig {
  readonly type: "query";
  readonly queries: readonly BenchmarkQuery[];
  readonly modes?: readonly LightRAGMode[]; // Optional - let LLM auto-select if not provided
  readonly parameters?: {
    readonly top_k?: readonly number[];
    readonly chunk_top_k?: readonly number[];
    readonly enable_rerank?: readonly boolean[];
    readonly score_threshold?: readonly number[];
  };
}

// ============================================
// Agent Benchmark Types
// ============================================

export interface AgentConfig {
  readonly name: string; // Any string allowed for agent names
  readonly model: string;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly systemPrompt?: string;
  readonly command?: string; // For CLI-based agents (amp, claude-cli, cline)
  readonly mcpConfig?: Record<string, McpStdioServerConfig>; // MCP server configuration
}

export interface EvaluationCriteria {
  readonly metrics: readonly EvaluationMetric[];
  readonly judgeModel?: string;
}

export interface AgentBenchmarkConfig extends BaseBenchmarkConfig {
  readonly type: "agent";
  readonly agents: readonly AgentConfig[];
  readonly queries: readonly BenchmarkQuery[];
  readonly evalCriteria: EvaluationCriteria;
}

// ============================================
// Comparison Benchmark Types
// ============================================

export interface ComparisonScenario {
  readonly id: string;
  readonly query: string;
  readonly sourceServers: readonly string[];
}

export interface ComparisonBenchmarkConfig extends BaseBenchmarkConfig {
  readonly type: "comparison";
  readonly agents: readonly AgentConfig[];
  readonly scenarios: readonly ComparisonScenario[];
  readonly sourceServers: Readonly<Record<string, string>>;
}

// ============================================
// Metrics Types (Immutable)
// ============================================

export interface TimingBreakdown {
  readonly keywordExtraction?: number;
  readonly vectorSearch?: number;
  readonly graphTraversal?: number;
  readonly reranking?: number;
  readonly resultFormatting?: number;
}

export interface TokenUsage {
  readonly embedding?: number;
  readonly reranking?: number;
  readonly llm?: number;
  readonly thinking?: number; // Extended thinking tokens
  readonly cacheCreation?: number; // Cache creation tokens
  readonly cacheRead?: number; // Cache read tokens
  readonly total: number;
}

export interface ScoreDistribution {
  readonly high: number; // > 0.8
  readonly medium: number; // 0.6 - 0.8
  readonly low: number; // < 0.6
}

export interface QueryMetrics {
  readonly queryId: string;
  readonly mode: LightRAGMode;
  readonly timestamp: string;

  // Timing
  readonly totalTime: number;
  readonly breakdown: TimingBreakdown;

  // Resources
  readonly tokenUsage: TokenUsage;

  // Retrieval
  readonly resultsReturned: number;
  readonly uniqueDocuments: number;
  readonly vectorMatches: number;
  readonly graphExpanded: number;
  readonly rerankingApplied: boolean;

  // Quality
  readonly averageScore: number;
  readonly scoreDistribution: ScoreDistribution;
}

export interface MCPCall {
  readonly toolName: string;
  readonly arguments: unknown;
  readonly result: unknown;
  readonly duration: number;
  readonly tokensUsed: number;
}

export interface AgentInput {
  readonly query: string;
  readonly timestamp: string;
  readonly tokensUsed: number;
}

export interface AgentOutput {
  readonly response: string;
  readonly timestamp: string;
  readonly tokensUsed: number;
  readonly thinkingTokens?: number; // Extended thinking tokens
  readonly cacheCreationTokens?: number; // Cache creation tokens
  readonly cacheReadTokens?: number; // Cache read tokens
  readonly responseTime: number;
}

export interface QualityScores {
  readonly relevance: number;
  readonly completeness: number;
  readonly accuracy: number;
  readonly coherence: number;
  readonly overall: number;
}

export interface AgentMetrics {
  readonly agentName: string;
  readonly queryId: string;
  readonly input: AgentInput;
  readonly output: AgentOutput;
  readonly mcpCalls: readonly MCPCall[];
  readonly scores: QualityScores;
}

export interface ComparisonMetrics {
  readonly scenarioId: string;
  readonly agentName: string;

  readonly ebeeQuery: {
    readonly totalTime: number;
    readonly mcpCalls: number;
    readonly tokensUsed: number;
    readonly resultQuality: number;
  };

  readonly directQuery: {
    readonly totalTime: number;
    readonly mcpCalls: number;
    readonly tokensUsed: number;
    readonly resultQuality: number;
  };

  readonly speedup: number;
  readonly tokenEfficiency: number;
  readonly qualityDelta: number;
}

export interface AccuracyMetrics {
  readonly queryId: string;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly mrr: number; // Mean Reciprocal Rank
  readonly ndcg: number; // Normalized Discounted Cumulative Gain
  readonly semanticSimilarity: number;
}

// ============================================
// Statistics Types
// ============================================

export interface Statistics {
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly stdDev: number;
  readonly p95: number;
  readonly p99: number;
}

export interface QueryStatistics {
  readonly totalTime: Statistics;
  readonly tokenUsage: {
    readonly mean: number;
    readonly total: number;
  };
  readonly resultsQuality: {
    readonly meanScore: number;
    readonly meanResults: number;
  };
}

// ============================================
// Result Types
// ============================================

export interface QueryBenchmarkResult {
  readonly query: BenchmarkQuery;
  readonly mode: LightRAGMode;
  readonly params: Partial<LightRAGQuery>;
  readonly runs: readonly QueryMetrics[];
  readonly statistics: QueryStatistics;
}

export interface AgentBenchmarkResult {
  readonly agent: AgentConfig;
  readonly query: BenchmarkQuery;
  readonly runs: readonly AgentMetrics[];
  readonly statistics: {
    readonly responseTime: Statistics;
    readonly tokenUsage: Statistics;
    readonly qualityScores: {
      readonly relevance: Statistics;
      readonly completeness: Statistics;
      readonly accuracy: Statistics;
      readonly overall: Statistics;
    };
  };
}

export interface ScenarioComparison {
  readonly scenario: ComparisonScenario;
  readonly agent: AgentConfig;
  readonly metrics: ComparisonMetrics;
  readonly analysis: {
    readonly speedupAchieved: boolean;
    readonly tokenSavings: number;
    readonly qualityMaintained: boolean;
    readonly recommendation: string;
  };
}

// ============================================
// Final Results
// ============================================

export interface QueryBenchmarkResults {
  readonly config: QueryBenchmarkConfig;
  readonly queryResults: readonly QueryBenchmarkResult[];
  readonly aggregated: {
    readonly byMode: Readonly<Record<LightRAGMode, QueryStatistics>>;
    readonly byCategory: Readonly<Record<QueryCategory, QueryStatistics>>;
    readonly overall: QueryStatistics;
  };
  readonly timestamp: string;
}

export interface AgentBenchmarkResults {
  readonly config: AgentBenchmarkConfig;
  readonly agentResults: readonly AgentBenchmarkResult[];
  readonly comparison: {
    readonly ranking: readonly {
      readonly agent: string;
      readonly overallScore: number;
      readonly avgResponseTime: number;
      readonly avgTokenUsage: number;
    }[];
    readonly bestForSpeed: string;
    readonly bestForQuality: string;
    readonly bestForEfficiency: string;
  };
  readonly timestamp: string;
}

export interface ComparisonBenchmarkResults {
  readonly config: ComparisonBenchmarkConfig;
  readonly scenarios: readonly ScenarioComparison[];
  readonly summary: {
    readonly avgSpeedup: number;
    readonly avgTokenSavings: number;
    readonly avgQualityDelta: number;
    readonly scenariosWhereEbeeBetter: number;
    readonly totalScenarios: number;
  };
  readonly timestamp: string;
}

// ============================================
// Utility Types
// ============================================

// ============================================
// Matrix Benchmark Types (Agent × MCP Setup)
// ============================================

export interface MatrixScenario {
  readonly id: string;
  readonly query: string;
  readonly category?: QueryCategory;
  readonly targetServers: readonly string[];
  readonly evaluationCriteria?: {
    readonly mustInclude: readonly string[];
  };
}

export interface MCPSetupConfig {
  readonly name: string;
  readonly url?: string;
  readonly servers?: readonly string[];
  readonly packages?: Readonly<
    Record<
      string,
      { command: string; args?: string[]; env?: Record<string, string> }
    >
  >;
}

export interface MatrixBenchmarkConfig extends BaseBenchmarkConfig {
  readonly type: "matrix";
  readonly agents: readonly AgentConfig[];
  readonly mcpSetups: readonly MCPSetupConfig[];
  readonly queriesSource: QuerySource;
  readonly scenarios?: readonly MatrixScenario[]; // Optional for hardcoded mode
  readonly verbose: boolean;
}

export interface MatrixCellResult {
  readonly time: number;
  readonly tokens: number;
  readonly thinkingTokens?: number; // Extended thinking tokens
  readonly cost: number;
  readonly quality: number;
  readonly evaluation?: EvaluationResult; // For generated queries
}

export interface MatrixAgentResult {
  readonly ebee: MatrixCellResult;
  readonly direct: MatrixCellResult;
}

export type MatrixResult = Readonly<Record<string, MatrixAgentResult>>;

export interface MatrixAnalysis {
  readonly bestCombination: string;
  readonly fastestWithEbee: string;
  readonly fastestWithDirect: string;
  readonly mostEfficient: string;
  readonly speedupByAgent: Readonly<Record<string, number>>;
  readonly tokenSavingsByAgent: Readonly<Record<string, number>>;
  readonly costSavingsByAgent: Readonly<Record<string, number>>;
}

export interface MatrixBenchmarkResults {
  readonly config: MatrixBenchmarkConfig;
  readonly matrix: MatrixResult;
  readonly analysis: MatrixAnalysis;
  readonly timestamp: string;
}

// ============================================
// Generated Query Types (from generate-queries.ts)
// ============================================

export interface GeneratedTestCase {
  readonly query: string;
  readonly evaluationCriteria: {
    readonly mustInclude: readonly string[];
  };
}

export interface GeneratedWorkflow {
  readonly workflow: { groupId: string };
  readonly testCases: readonly GeneratedTestCase[];
}

// ============================================
// Evaluation Types
// ============================================

export interface EvaluationResult {
  readonly passed: boolean;
  readonly score: number; // 0-1 semantic similarity
  readonly matchedCount: number;
  readonly totalRequired: number;
  readonly matches: readonly string[]; // Items that matched
  readonly missing: readonly string[]; // Items that didn't match
}

// ============================================
// Query Source Configuration
// ============================================

export type QuerySource =
  | {
      readonly type: "generated";
      readonly file: string;
      readonly skipWorkflows?: readonly string[];
    }
  | {
      readonly type: "hardcoded";
    };

export type BenchmarkConfig =
  | QueryBenchmarkConfig
  | AgentBenchmarkConfig
  | ComparisonBenchmarkConfig
  | MatrixBenchmarkConfig;

export type BenchmarkResults =
  | QueryBenchmarkResults
  | AgentBenchmarkResults
  | ComparisonBenchmarkResults
  | MatrixBenchmarkResults;

// ============================================
// Function Types (for functional composition)
// ============================================

export type MetricsCollector<T> = (metrics: T) => void;
export type MetricsAggregator<T, R> = (metrics: readonly T[]) => R;
export type BenchmarkRunner<
  C extends BenchmarkConfig,
  R extends BenchmarkResults
> = (config: C) => Promise<R>;
export type Evaluator<I, O> = (input: I) => Promise<O>;
