# eBee Benchmark Framework - Implementation Plan

## 1. Executive Summary

The `@ebee-oss/benchmark` package is a **functional programming-based benchmarking framework** designed to measure and compare the performance of the eBee MCP server's LightRAG search capabilities. This document outlines the complete implementation plan, architecture, and development roadmap.

### Key Objectives

1. **Query Performance Testing** - Benchmark LightRAG across modes (naive, local, global, hybrid, mix) and parameters
2. **Accuracy Evaluation** - Measure retrieval quality against ground truth using standard IR metrics
3. **Agent Comparison** - Compare different AI agents (Claude, ChatGPT, etc.) using eBee
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
│   ├── cli.ts                      # CLI entry point
│   ├── types/
│   │   └── index.ts                # All TypeScript types
│   ├── runners/
│   │   ├── query-benchmark.ts      # Query performance runner
│   │   ├── accuracy-benchmark.ts   # Accuracy evaluation runner
│   │   ├── agent-benchmark.ts      # Agent comparison runner
│   │   └── comparison-benchmark.ts # eBee vs Direct runner
│   ├── utils/
│   │   ├── statistics.ts           # Statistical functions
│   │   ├── metrics.ts              # Metrics collection
│   │   ├── accuracy-metrics.ts     # IR accuracy metrics
│   │   └── export.ts               # Export to JSON/CSV/YAML/HTML
│   └── evaluators/                 # (Future) Custom evaluators
├── benchmarks/                     # Example YAML configs
│   ├── query-performance.yaml
│   ├── accuracy-evaluation.yaml
│   ├── agent-comparison.yaml
│   └── ebee-vs-direct.yaml
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
- ✅ `utils/export.ts` - Export to JSON, CSV, YAML, HTML

**Features Implemented**:

- Parameter combination generation
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

- Need agent API integration (Claude, ChatGPT, Gemini)
- Need LLM-as-Judge evaluator implementation
- Need MCP call tracking mechanism

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

### 5.1 Export Formats

**JSON** (Machine-readable):

```json
{
  "config": { ... },
  "queryResults": [ ... ],
  "aggregated": {
    "byMode": { ... },
    "byCategory": { ... },
    "overall": { ... }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**CSV** (Spreadsheet analysis):

```csv
queryId,mode,totalTime,tokens,results,avgScore
entity_query,mix,245,1250,15,0.823
relationship_query,hybrid,312,1420,12,0.756
```

**YAML** (Human-readable):

```yaml
config:
  name: "Query Performance Test"
  type: query
aggregated:
  overall:
    totalTime:
      mean: 278.5
      p95: 450.2
```

**HTML** (Visual reports):

- Interactive dashboard
- Charts and graphs
- Mode comparison tables
- Detailed drill-down

### 5.2 Report Components

**Summary Section**:

- Benchmark name and description
- Timestamp and configuration
- Key metrics overview
- Best performers

**Mode Comparison**:

- Side-by-side comparison
- Performance rankings
- Trade-off analysis

**Detailed Results**:

- Per-query breakdown
- Parameter sensitivity analysis
- Error analysis

**Recommendations**:

- Optimal mode selection
- Parameter tuning suggestions
- Performance improvement opportunities

---

## 6. Configuration System

### 6.1 YAML Configuration Format

**Query Benchmark**:

```yaml
name: "Query Performance Test"
description: "Testing LightRAG modes"
type: query
iterations: 10
warmupRuns: 2
outputDir: "./results"

queries:
  - id: "entity_query"
    query: "Who is working on authentication?"
    category: "entity_focused"
    expectedEntities: ["Alice", "Bob"]

modes:
  - naive
  - local
  - global
  - hybrid
  - mix

parameters:
  top_k: [20, 60, 100]
  chunk_top_k: [10, 20, 30]
  enable_rerank: [true, false]
  score_threshold: [0.6, 0.7, 0.8]
```

**Accuracy Benchmark**:

```yaml
name: "Accuracy Evaluation"
type: query
queries:
  - id: "entity_query"
    query: "Who is working on authentication?"
    groundTruth:
      relevantDocuments: ["doc_123", "doc_456", "doc_789"]
      minRelevanceScore: 0.7
```

**Agent Comparison**:

```yaml
name: "Agent Comparison"
type: agent
iterations: 5

agents:
  - name: claude
    model: claude-sonnet-4-5
    apiKey: ${ANTHROPIC_API_KEY}
  - name: chatgpt
    model: gpt-4
    apiKey: ${OPENAI_API_KEY}

queries:
  - id: "complex_query"
    query: "Find all Notion pages about Q4 roadmap"

evalCriteria:
  metrics: [response_quality, answer_completeness]
  judgeModel: claude-sonnet-4-5
```

**Comparison Benchmark**:

```yaml
name: "eBee vs Direct"
type: comparison

scenarios:
  - id: "multi_source_query"
    query: "Find recent updates across Notion and Slack"
    sourceServers: ["notion", "slack"]
    expectedDifference:
      speedup: 2.0
      accuracyDelta: 0.05
```

### 6.2 Programmatic API

```typescript
import { runQueryBenchmarks } from "@ebee-oss/benchmark";

const config: QueryBenchmarkConfig = {
  name: "My Benchmark",
  type: "query",
  iterations: 10,
  outputDir: "./results",
  queries: [...],
  modes: ["mix"],
  parameters: { top_k: [60] }
};

const results = await runQueryBenchmarks(config, lightragQuery);
```

---

## 7. Development Roadmap

### 7.1 Completed ✅

- [x] Core type system
- [x] Statistical utilities
- [x] Query benchmark runner
- [x] Accuracy evaluation
- [x] Agent comparison (core)
- [x] eBee vs Direct comparison (core)
- [x] Export to JSON/CSV/YAML/HTML
- [x] CLI interface
- [x] Example configurations

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
