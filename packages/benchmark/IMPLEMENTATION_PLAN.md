# eBee Benchmark Framework - Implementation Plan

## 1. Executive Summary

The `@ebee-oss/benchmark` package is a **functional programming-based benchmarking framework** designed to measure and compare the performance of the eBee MCP server's LightRAG search capabilities. This document outlines the complete implementation plan, architecture, and development roadmap.

### Key Objectives

1. **Query Performance Testing** - Benchmark LightRAG with auto-selected or custom modes and parameters
2. **Accuracy Evaluation** - Measure retrieval quality against ground truth using standard IR metrics
3. **Agent Comparison** - Compare Amp CLI, Claude CLI, and other AI agents using eBee
4. **eBee vs Direct** - Compare unified eBee search vs direct MCP server queries

### Design Principles

- **Functional Programming**: Pure functions, immutability, composability
- **Type Safety**: Comprehensive TypeScript types with `readonly` modifiers
- **Modularity**: Clear separation of concerns (runners, metrics, statistics, export)
- **Extensibility**: Plugin architecture for custom evaluators and metrics

---

## 2. Architecture Overview

### 2.1 Package Structure

```
packages/benchmark/
├── src/
│   ├── index.ts                    # Main exports
│   ├── cli.ts                      # Simplified CLI entry point
│   ├── types/
│   │   └── index.ts                # All TypeScript types
│   ├── configs/                    # TypeScript config examples
│   │   └── comparison.config.ts    # eBee vs Direct comparison
│   ├── runners/
│   │   ├── query-benchmark.ts      # Query performance runner
│   │   ├── accuracy-benchmark.ts   # Accuracy evaluation runner
│   │   ├── agent-benchmark.ts      # Agent comparison runner
│   │   ├── comparison-benchmark.ts # eBee vs Direct runner
│   │   └── cli-runner.ts           # Amp/Claude CLI integration
│   ├── utils/
│   │   ├── statistics.ts           # Statistical functions
│   │   ├── metrics.ts              # Metrics collection
│   │   ├── accuracy-metrics.ts     # IR accuracy metrics
│   │   └── export.ts               # Export to CSV only
│   └── evaluators/                 # (Future) Custom evaluators
├── examples/                       # Code examples
│   ├── basic-usage.ts
└── README.md
```

### 2.2 Type System Hierarchy

```typescript
BenchmarkConfig (Union Type)
├── QueryBenchmarkConfig
├── AgentBenchmarkConfig
├── ComparisonBenchmarkConfig
└── AccuracyBenchmarkConfig (extends QueryBenchmarkConfig)

BenchmarkResults (Union Type)
├── QueryBenchmarkResults
├── AgentBenchmarkResults
├── ComparisonBenchmarkResults
└── AccuracyBenchmarkResults

Metrics Types
├── QueryMetrics
├── AgentMetrics
├── ComparisonMetrics
└── AccuracyMetrics
```

---

## 3. Implementation Phases

### Phase 1: Core Query Benchmarking ✅ (Completed)

**Status**: Implementation complete

**Components**:

- ✅ `types/index.ts` - Complete type definitions
- ✅ `utils/statistics.ts` - Statistical functions (mean, median, stdDev, percentiles)
- ✅ `utils/metrics.ts` - Metrics collection and aggregation
- ✅ `runners/query-benchmark.ts` - Query performance runner
- ✅ `utils/export.ts` - Export to CSV
- ✅ `runners/cli-runner.ts` - Amp and Claude CLI integration

**Features Implemented**:

- Parameter combination generation (optional - supports auto-select)
- Mode auto-selection (uses "mix" mode when not specified)
- Parameter auto-selection (lets LLM choose optimal settings)
- Warmup runs for performance stability
- Multiple iterations per configuration
- Aggregation by mode and category
- Best mode finder (speed/quality/efficiency)
- Optimal parameter finder
- Rich console output with progress tracking

**Metrics Collected**:

```typescript
{
  totalTime: Statistics,
  tokenUsage: { mean, total },
  resultsQuality: { meanScore, meanResults },
  breakdown: { vectorSearch, graphTraversal, reranking },
  retrieval: { vectorMatches, graphExpanded, rerankingApplied }
}
```

---

### Phase 2: Accuracy Evaluation ✅ (Completed)

**Status**: Implementation complete

**Components**:

- ✅ `utils/accuracy-metrics.ts` - IR accuracy metrics
- ✅ `runners/accuracy-benchmark.ts` - Accuracy evaluation runner

**Metrics Implemented**:

- **Precision**: % of retrieved docs that are relevant
- **Recall**: % of relevant docs that were retrieved
- **F1 Score**: Harmonic mean of precision and recall
- **MRR** (Mean Reciprocal Rank): Rank of first relevant result
- **NDCG** (Normalized Discounted Cumulative Gain): Ranking quality
- **MAP** (Mean Average Precision): Average precision across queries
- **Hit Rate @ K**: % of queries with ≥1 relevant result in top K
- **Coverage @ K**: Avg % of relevant docs in top K
- **Semantic Similarity**: Jaccard similarity between retrieved/relevant

**Ground Truth Format**:

```yaml
queries:
  - id: "entity_query"
    query: "Who is working on authentication?"
    groundTruth:
      relevantDocuments: ["doc_123", "doc_456"]
      requiredEntities: ["Alice", "Bob"]
      requiredRelationships: ["works_on"]
      minRelevanceScore: 0.7
```

---

### Phase 3: Agent Comparison 🚧 (In Progress)

**Status**: Core implementation complete, needs integration testing

**Components**:

- ✅ `runners/agent-benchmark.ts` - Agent comparison runner
- ✅ `runners/cli-runner.ts` - CLI agent integration (Amp, Claude)

**Features**:

- Execute queries through different AI agents
- Track MCP tool calls made by each agent
- Measure response quality using LLM-as-Judge
- Compare speed, token usage, and quality
- Generate agent rankings

**Quality Evaluation**:

```typescript
{
  relevance: number,      // How relevant is the response?
  completeness: number,   // Does it answer fully?
  accuracy: number,       // Is information correct?
  coherence: number,      // Is response well-structured?
  overall: number         // Combined score
}
```

**Integration Points**:

- ✅ Amp Code CLI integration
- ✅ Claude Code CLI integration
- Need LLM-as-Judge evaluator implementation
- Need MCP call tracking mechanism (currently estimated)

---

### Phase 4: eBee vs Direct Comparison 🚧 (In Progress)

**Status**: Core implementation complete, needs integration testing

**Components**:

- ✅ `runners/comparison-benchmark.ts` - Comparison runner

**Comparison Metrics**:

```typescript
{
  speedup: number,              // directTime / ebeeTime
  tokenEfficiency: number,      // % token savings
  qualityDelta: number,         // quality difference
  recommendation: string        // Use eBee? Trade-offs?
}
```

**Scenarios Tested**:

- Single-source queries (eBee overhead)
- Multi-source queries (eBee advantage)
- Complex aggregation queries
- Real-time vs cached data

**Analysis**:

- When is eBee faster? (multi-source, graph traversal)
- When is direct better? (single source, simple queries)
- Token efficiency gains
- Quality trade-offs

---

### Phase 5: Enhanced Evaluators 🔮 (Planned)

**Status**: Not started

**Planned Components**:

```
src/evaluators/
├── index.ts
├── llm-judge.ts           # LLM-based evaluation
├── ragas.ts               # RAGAS metrics (faithfulness, etc.)
├── hallucination.ts       # Hallucination detection
└── custom-evaluator.ts    # Base class for custom evaluators
```

**RAGAS Metrics** (Retrieval Augmented Generation Assessment):

- **Faithfulness**: Is response grounded in retrieved context?
- **Answer Relevance**: Does answer address the question?
- **Context Precision**: Are relevant chunks ranked higher?
- **Context Recall**: Are all relevant contexts retrieved?
- **Context Relevance**: Are retrieved contexts relevant?

**Hallucination Detection**:

- Claim extraction from response
- Claim verification against retrieved chunks
- Confidence scoring
- False information detection

**LLM-as-Judge**:

- Use GPT-4/Claude as evaluator
- Custom evaluation prompts
- Multi-aspect scoring
- Comparative evaluation

---

## 4. Metrics Collection Strategy

### 4.1 Performance Metrics

**Timing Metrics**:

```typescript
{
  totalTime: number,              // End-to-end query time
  breakdown: {
    keywordExtraction: number,    // Keyword extraction time
    vectorSearch: number,          // Vector DB search time
    graphTraversal: number,        // Graph traversal time
    reranking: number,             // Reranking time
    resultFormatting: number       // Result formatting time
  }
}
```

**Token Metrics**:

```typescript
{
  embedding: number,    // Tokens for embeddings
  reranking: number,    // Tokens for reranking
  llm: number,          // Tokens for LLM calls
  total: number         // Total tokens
}
```

**Retrieval Metrics**:

```typescript
{
  resultsReturned: number,
  uniqueDocuments: number,
  vectorMatches: number,
  graphExpanded: number,
  rerankingApplied: boolean
}
```

**Quality Metrics**:

```typescript
{
  averageScore: number,
  scoreDistribution: {
    high: number,    // > 0.8
    medium: number,  // 0.6 - 0.8
    low: number      // < 0.6
  }
}
```

### 4.2 Statistical Aggregation

For each metric, calculate:

- **Mean**: Average value
- **Median**: Middle value
- **Min/Max**: Range
- **Std Dev**: Variability
- **P95/P99**: 95th and 99th percentiles

### 4.3 Grouping Strategies

**By Mode**:

```typescript
{
  naive: QueryStatistics,
  local: QueryStatistics,
  global: QueryStatistics,
  hybrid: QueryStatistics,
  mix: QueryStatistics
}
```

**By Category**:

```typescript
{
  entity_focused: QueryStatistics,
  relationship: QueryStatistics,
  temporal: QueryStatistics,
  aggregation: QueryStatistics,
  exploratory: QueryStatistics
}
```

**By Parameter**:

```typescript
{
  "top_k=20": QueryStatistics,
  "top_k=60": QueryStatistics,
  "enable_rerank=true": QueryStatistics,
  "enable_rerank=false": QueryStatistics
}
```

---

## 5. Export and Reporting

### 5.1 Export Format

**CSV** (Spreadsheet and data analysis):

```csv
queryId,mode,totalTime,tokens,results,avgScore
entity_query,mix,245,1250,15,0.823
relationship_query,hybrid,312,1420,12,0.756
```

**Benefits**:

- Universal compatibility with spreadsheets (Excel, Google Sheets)
- Easy import into data science tools (Python, R)
- Simple visualization in BI tools
- Lightweight and portable

### 5.2 CSV Report Structure

**Query Benchmarks**:

- Per-run metrics with timing, tokens, quality scores
- Aggregated statistics (mean, median, p95, etc.)
- Mode and category breakdowns

**Agent Benchmarks**:

- Agent name, query ID, response times
- Token usage and quality scores
- Rankings and comparisons

**Comparison Benchmarks**:

- Scenario ID, agent, eBee vs Direct metrics
- Speedup factors, token efficiency
- Quality deltas and recommendations

---

## 6. Configuration System

### 6.1 TypeScript Configuration Format

**Query Benchmark** (with auto-select):

```typescript
import type { QueryBenchmarkConfig } from "@ebee-oss/benchmark";

export const queryConfig: QueryBenchmarkConfig = {
  name: "Query Performance Test",
  description: "Testing LightRAG with auto-selected parameters",
  type: "query",
  iterations: 10,
  warmupRuns: 2,
  outputDir: "./results",
  queries: [
    {
      id: "entity_query",
      query: "Who is working on authentication?",
      category: "entity_focused",
      expectedEntities: ["Alice", "Bob"],
    },
  ],
  // Optional: modes and parameters will auto-select if not provided
  // modes: ["naive", "local", "global", "hybrid", "mix"],
  // parameters: {
  //   top_k: [20, 60, 100],
  //   chunk_top_k: [10, 20, 30],
  //   enable_rerank: [true, false],
  // },
};
```

**CLI Agent Comparison**:

```typescript
import type { ComparisonBenchmarkConfig } from "@ebee-oss/benchmark";

export const comparisonConfig: ComparisonBenchmarkConfig = {
  name: "eBee vs Direct with CLI Agents",
  description: "Compare Amp and Claude CLI",
  type: "comparison",
  iterations: 3,
  outputDir: "./results",
  agents: [
    {
      name: "amp",
      model: "claude-sonnet-4-20250514",
      command: "amp",
      mcpConfig: {
        ebee: {
          url: "http://localhost:3000/.api/mcp/v1",
        },
      },
    },
    {
      name: "claude-cli",
      model: "claude-sonnet-4-20250514",
      command: "claude",
      mcpConfig: {
        ebee: {
          command: "node",
          args: ["../server/dist/mcp/index.js"],
        },
      },
    },
  ],
  scenarios: [
    {
      id: "multi_source_query",
      query: "Find recent updates across Notion and Fathom",
      sourceServers: ["notion", "fathom"],
      expectedDifference: {
        speedup: 2.0,
        accuracyDelta: 0.05,
      },
    },
  ],
  sourceServers: {
    notion: "notion-mcp-server",
    fathom: "fathom-mcp-server",
  },
};
```

### 6.2 Programmatic API

```typescript
import { runQueryBenchmarks } from "@ebee-oss/benchmark";
import { lightragQuery } from "@ebee-oss/server";

const config: QueryBenchmarkConfig = {
  name: "My Benchmark",
  description: "Test with auto-select",
  type: "query",
  iterations: 10,
  outputDir: "./results",
  queries: [
    {
      id: "test",
      query: "test query",
      category: "exploratory",
    },
  ],
  // No modes or parameters - LLM will auto-select
};

const results = await runQueryBenchmarks(config, lightragQuery);
```

---

## 7. Development Roadmap

### 7.1 Completed ✅

- [x] Core type system with optional modes/parameters
- [x] Statistical utilities
- [x] Query benchmark runner with auto-select support
- [x] Accuracy evaluation
- [x] Agent comparison (core)
- [x] eBee vs Direct comparison (core)
- [x] Amp Code CLI integration
- [x] Claude Code CLI integration
- [x] Export to CSV
- [x] Simplified CLI interface
- [x] TypeScript configuration examples

### 7.2 In Progress 🚧

- [ ] Integration testing with real eBee server
- [ ] Agent API integrations (Claude, ChatGPT)
- [ ] MCP call tracking
- [ ] CLI improvements (interactive mode)
- [ ] Documentation improvements

### 7.3 Planned 🔮

**Phase 1: Enhanced Evaluators**

- [ ] LLM-as-Judge implementation
- [ ] RAGAS metrics integration
- [ ] Hallucination detection
- [ ] Custom evaluator framework

**Phase 2: Advanced Features**

- [ ] Real-time benchmarking
- [ ] Continuous benchmarking (CI/CD)
- [ ] Benchmark regression detection
- [ ] Performance profiling integration

**Phase 3: Visualization**

- [ ] Interactive web dashboard
- [ ] Real-time charts
- [ ] Comparison visualizations
- [ ] Historical trend analysis

**Phase 4: Advanced Analysis**

- [ ] Parameter sensitivity analysis
- [ ] Multi-objective optimization
- [ ] Cost-performance analysis
- [ ] Quality-speed trade-off explorer
