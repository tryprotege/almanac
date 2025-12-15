# @ebee-oss/benchmark

Functional benchmarking framework for eBee MCP server performance testing.

## Features

- 🚀 **Query Performance Testing** - Benchmark LightRAG query modes and parameters
- 🤖 **AI Agent Comparison** - Compare different AI agents (Claude, ChatGPT, etc.)
- ⚖️ **eBee vs Direct** - Compare eBee unified search vs direct source queries
- 📊 **Rich Metrics** - Timing, token usage, quality scores, and more
- 📈 **Multiple Export Formats** - JSON, CSV, YAML, and HTML reports

## Installation

```bash
pnpm install
```

## Usage

### Programmatic API

```typescript
import { runQueryBenchmarks, exportResults } from "@ebee-oss/benchmark";
import { lightragQuery } from "@ebee-oss/server";
import type { QueryBenchmarkConfig } from "@ebee-oss/benchmark";

// Define your benchmark configuration
const config: QueryBenchmarkConfig = {
  name: "My Benchmark",
  description: "Testing query performance",
  type: "query",
  iterations: 10,
  warmupRuns: 2,
  outputDir: "./results",
  queries: [
    {
      id: "test_query",
      query: "Who is working on authentication?",
      category: "entity_focused",
    },
  ],
  modes: ["naive", "local", "global", "hybrid", "mix"],
  parameters: {
    top_k: [20, 60],
    chunk_top_k: [10, 20],
    enable_rerank: [true, false],
    score_threshold: [0.6, 0.7],
  },
};

// Run benchmarks
const results = await runQueryBenchmarks(config, lightragQuery);

// Export results
exportResults(results, "./benchmark-results");
```

### Example Configurations

See `benchmarks/` directory for example YAML configurations:

- `query-performance.yaml` - Query performance testing
- `agent-comparison.yaml` - AI agent comparison (coming soon)
- `ebee-vs-direct.yaml` - eBee vs direct comparison (coming soon)

## Benchmark Types

### Query Performance Benchmark

Tests LightRAG query performance across different modes and parameters:

```yaml
name: "Query Performance Test"
type: query
iterations: 10
queries:
  - id: "entity_query"
    query: "Who is working on authentication?"
    category: "entity_focused"
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
```

**Metrics Collected:**

- Response time (mean, median, p95, p99)
- Token usage (embedding, reranking, total)
- Result quality (score, distribution)
- Retrieval breakdown (vector matches, graph expansion)

### Accuracy Evaluation Benchmark

Evaluate retrieval accuracy against ground truth data:

```yaml
name: "Accuracy Evaluation"
type: query
queries:
  - id: "entity_query"
    query: "Who is working on authentication?"
    category: "entity_focused"
    groundTruth:
      relevantDocuments: ["doc_123", "doc_456"]
      minRelevanceScore: 0.7
```

**Metrics Collected:**

- Precision, Recall, F1 Score
- NDCG (Normalized Discounted Cumulative Gain)
- MAP (Mean Average Precision)
- Hit Rate @ K (1, 3, 5, 10, 20)
- Coverage @ K

### Agent Comparison Benchmark

Compare different AI agents using eBee:

```yaml
name: "Agent Comparison"
type: agent
agents:
  - name: claude
    model: claude-sonnet-4-5
  - name: roo-code
    model: claude-sonnet-4-5
queries:
  - id: "complex_query"
    query: "Find all Notion pages about Q4 roadmap"
evalCriteria:
  metrics: [response_quality, answer_completeness]
```

**Metrics Collected:**

- Response quality scores (relevance, completeness, accuracy)
- Response time and token usage
- Agent rankings and comparisons

### eBee vs Direct Comparison

Compare eBee unified search vs querying source servers directly:

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

**Metrics Collected:**

- Speedup factor (direct time / eBee time)
- Token efficiency (% savings)
- Quality delta (difference in result quality)
- Recommendation based on trade-offs

## Functional Programming Approach

This framework follows functional programming principles:

### Pure Functions

All core functions are pure - same input always produces same output:

```typescript
// Pure statistical functions
const mean = (numbers: readonly number[]): number =>
  numbers.reduce((sum, n) => sum + n, 0) / numbers.length;

const calculateStatistics = (numbers: readonly number[]): Statistics => ({
  mean: mean(numbers),
  median: median(numbers),
  stdDev: stdDev(numbers),
  // ...
});
```

### Immutable Data

All types use `readonly` to ensure immutability:

```typescript
interface QueryMetrics {
  readonly queryId: string;
  readonly totalTime: number;
  readonly tokenUsage: TokenUsage;
  // ...
}
```

### Composable Utilities

Functions are designed to be composed:

```typescript
// Compose functions for complex operations
const analyzeResults = pipe(
  filterByMode("mix"),
  aggregateMetrics,
  calculateStatistics,
  formatReport
);
```

## Output Formats

### JSON

Complete benchmark results with all metrics and metadata.

### CSV

Tabular data for easy analysis in spreadsheets.

### YAML

Human-readable configuration and results.

## API Reference

### Core Functions

#### `runQueryBenchmarks(config, queryFn)`

Run query performance benchmarks.

**Parameters:**

- `config: QueryBenchmarkConfig` - Benchmark configuration
- `queryFn: (q: LightRAGQuery) => Promise<LightRAGResponse>` - Query function

**Returns:** `Promise<QueryBenchmarkResults>`

#### `exportResults(results, outputDir)`

Export benchmark results to multiple formats.

**Parameters:**

- `results: BenchmarkResults` - Benchmark results
- `outputDir: string` - Output directory path

### Utility Functions

#### Statistics

- `mean(numbers)` - Calculate mean
- `median(numbers)` - Calculate median
- `stdDev(numbers)` - Calculate standard deviation
- `percentile(numbers, p)` - Calculate percentile
- `calculateStatistics(numbers)` - Calculate full statistics

#### Metrics

- `estimateTokens(text)` - Estimate token count
- `estimateTokenUsage(response)` - Estimate token usage from response
- `calculateAverageScore(chunks)` - Calculate average relevance score
- `aggregateQueryMetrics(metrics)` - Aggregate multiple metrics

## Examples

### Basic Query Benchmark

```typescript
import { runQueryBenchmarks } from "@ebee-oss/benchmark";

const config = {
  name: "Basic Test",
  type: "query" as const,
  iterations: 5,
  outputDir: "./results",
  queries: [
    {
      id: "test",
      query: "test query",
      category: "exploratory" as const,
    },
  ],
  modes: ["mix" as const],
  parameters: {},
};

const results = await runQueryBenchmarks(config, myQueryFunction);
console.log(`Mean time: ${results.aggregated.overall.totalTime.mean}ms`);
```

### Find Best Mode

```typescript
import { findBestMode } from "@ebee-oss/benchmark";

const best = findBestMode(results, "speed");
console.log(`Best mode for speed: ${best.mode} (${best.score}ms)`);

const bestQuality = findBestMode(results, "quality");
console.log(`Best mode for quality: ${bestQuality.mode}`);
```

### Custom Analysis

```typescript
import { groupBy, calculateStatistics } from "@ebee-oss/benchmark";

// Group results by category
const byCategory = groupBy(results.queryResults, (r) => r.query.category);

// Analyze each category
Object.entries(byCategory).forEach(([category, results]) => {
  const times = results.flatMap((r) => r.runs.map((m) => m.totalTime));
  const stats = calculateStatistics(times);
  console.log(`${category}: ${stats.mean}ms avg`);
});
```

### Features

- **RAG Evaluation**: Hallucination detection, retrieval quality, Q&A scoring
- **LLM-as-Judge**: Advanced evaluation using LLM evaluators
- **Custom Evaluators**: Extensible evaluation framework

## Development

```bash
# Build
pnpm build

# Type check
pnpm type-check

# Run example
pnpm benchmark:query
```

## License

MIT
