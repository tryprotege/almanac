# Benchmark Usage Examples

This document provides comprehensive examples for using the eBee benchmark framework to evaluate input/output accuracy, query performance, and compare eBee vs Direct MCP server queries.

## Table of Contents

1. [Accuracy Benchmark](#accuracy-benchmark)
2. [Comparison Benchmark (eBee vs Direct)](#comparison-benchmark)
3. [Agent Comparison Benchmark](#agent-comparison-benchmark)
4. [Running from CLI](#running-from-cli)

---

## Accuracy Benchmark

Evaluate retrieval accuracy against ground truth data to measure precision, recall, F1, NDCG, and other metrics.

### Configuration File

Create `benchmarks/accuracy-evaluation.yaml`:

```yaml
name: "Accuracy Evaluation"
description: "Evaluate retrieval accuracy against ground truth"
type: query
iterations: 10
outputDir: "./benchmark-results/accuracy"

queries:
  - id: "entity_query"
    query: "Who is working on authentication?"
    category: "entity_focused"
    groundTruth:
      relevantDocuments: ["doc_123", "doc_456"]
      minRelevanceScore: 0.7

modes: [mix]
parameters:
  top_k: [60]
  enable_rerank: [true]
```

### Programmatic Usage

```typescript
import {
  runAccuracyBenchmark,
  generateAccuracyReport,
} from "@ebee-oss/benchmark";
import { lightragQuery } from "@ebee-oss/server";

// Run accuracy benchmark
const results = await runAccuracyBenchmark(config, lightragQuery);

// Generate report
const report = generateAccuracyReport(results);
console.log(report);

// Access metrics
console.log(`Precision: ${results.aggregated.precision}`);
console.log(`Recall: ${results.aggregated.recall}`);
console.log(`F1 Score: ${results.aggregated.f1}`);
console.log(`NDCG: ${results.aggregated.ndcg}`);
```

### Expected Output

```
============================================================
ACCURACY BENCHMARK RESULTS
============================================================

Benchmark: Accuracy Evaluation
Timestamp: 2024-01-15T10:30:00.000Z
Queries Evaluated: 5

Overall Metrics:
------------------------------------------------------------
Precision:  85.3% (0.853)
Recall:     78.2% (0.782)
F1 Score:   0.816
MRR:        0.892
NDCG:       0.875
MAP:        0.834

Hit Rate @ K:
------------------------------------------------------------
  @ 1:  72.0%
  @ 3:  88.0%
  @ 5:  94.0%
  @10:  98.0%
  @20:  100.0%
```

---

## Comparison Benchmark (eBee vs Direct)

Compare eBee unified search performance against querying source MCP servers directly.

### Configuration File

Create `benchmarks/ebee-vs-direct.yaml`:

```yaml
name: "eBee vs Direct MCP Comparison"
type: comparison
iterations: 10
outputDir: "./benchmark-results/comparison"

agents:
  - name: claude
    model: claude-3-5-sonnet-20241022
    apiKey: ${ANTHROPIC_API_KEY}

scenarios:
  - id: "multi_source"
    query: "Find updates across Notion and Slack about Q4 roadmap"
    sourceServers: [notion, slack]
    expectedDifference:
      speedup: 2.0
      accuracyDelta: 0.05

sourceServers:
  notion: "npx -y @notionhq/notion-mcp-server"
  slack: "custom-slack-server"
```

### Programmatic Usage

```typescript
import {
  runComparisonBenchmark,
  generateComparisonReport,
} from "@ebee-oss/benchmark";

// Define query functions
const ebeeQueryFn = async (query) => {
  // Query using eBee unified search
  return await lightragQuery(query);
};

const directQueryFn = async (server, query) => {
  // Query MCP server directly
  return await queryMCPServer(server, query);
};

// Run comparison
const results = await runComparisonBenchmark(
  config,
  ebeeQueryFn,
  directQueryFn
);

// Generate report
const report = generateComparisonReport(results);
console.log(report);
```

### Expected Output

```
======================================================================
EBEE VS DIRECT MCP COMPARISON BENCHMARK
======================================================================

Summary:
----------------------------------------------------------------------
Average Speedup:       2.35x
Average Token Savings: 58.3%
Average Quality Delta: +0.023
eBee Better In:        4 / 5 scenarios

Detailed Results:
----------------------------------------------------------------------

multi_source:
  Query: "Find updates across Notion and Slack about Q4 roadmap"
  Sources: notion, slack

  eBee Unified Search:
    Time:    450ms
    Calls:   1
    Tokens:  575
    Quality: 0.892

  Direct MCP Queries:
    Time:    1,250ms
    Calls:   4
    Tokens:  1,420
    Quality: 0.875

  Comparison:
    Speedup:          2.78x ✓
    Token Efficiency: 59.5%
    Quality Delta:    +0.017

  Recommendation: Use eBee - Significant performance improvement
```

---

## Agent Comparison Benchmark

Compare different AI agents (Claude, ChatGPT, etc.) using eBee.

### Configuration File

Create `benchmarks/agent-comparison.yaml`:

```yaml
name: "AI Agent Comparison"
type: agent
iterations: 5
outputDir: "./benchmark-results/agents"

agents:
  - name: claude
    model: claude-3-5-sonnet-20241022
    apiKey: ${ANTHROPIC_API_KEY}

  - name: roo-code
    model: claude-3-5-sonnet-20241022
    apiKey: ${ANTHROPIC_API_KEY}

queries:
  - id: "multi_source"
    query: "Find all Notion pages about Q4 roadmap"
    category: "exploratory"

evalCriteria:
  metrics: [response_quality, answer_completeness]
  judgeModel: claude-3-5-sonnet-20241022
```

### Programmatic Usage

```typescript
import { runAgentBenchmark, generateAgentReport } from "@ebee-oss/benchmark";

// Define agent query function
const agentQueryFn = async (agent, query) => {
  // Execute query with agent
  return {
    response: "...",
    mcpCalls: [...],
    inputTokens: 100,
    outputTokens: 200
  };
};

// Optional: Custom evaluation function
const evaluateFn = async (query, response, criteria) => {
  // Evaluate using LLM-as-Judge
  return {
    relevance: 0.9,
    completeness: 0.85,
    accuracy: 0.88,
    coherence: 0.92,
    overall: 0.89
  };
};

// Run benchmark
const results = await runAgentBenchmark(
  config,
  agentQueryFn,
  evaluateFn
);

// Generate report
const report = generateAgentReport(results);
console.log(report);
```

### Expected Output

```
======================================================================
AGENT COMPARISON BENCHMARK
======================================================================

Rankings:
----------------------------------------------------------------------
1. claude          Score: 0.892  Time: 450ms  Tokens: 1,250
2. roo-code        Score: 0.875  Time: 520ms  Tokens: 1,180

Best Performers:
----------------------------------------------------------------------
Speed:      roo-code
Quality:    claude
Efficiency: roo-code
```

---

## Running from CLI

### Run Accuracy Benchmark

```bash
# Using YAML config
npm run benchmark -- --config benchmarks/accuracy-evaluation.yaml

# With specific output directory
npm run benchmark -- \
  --config benchmarks/accuracy-evaluation.yaml \
  --output ./results/accuracy
```

### Run Comparison Benchmark

```bash
npm run benchmark -- --config benchmarks/ebee-vs-direct.yaml
```

### Run Agent Comparison

```bash
npm run benchmark -- --config benchmarks/agent-comparison.yaml
```

### Export Results

```bash
# Export to JSON
npm run benchmark -- \
  --config benchmarks/accuracy-evaluation.yaml \
  --export-json

# Export to CSV
npm run benchmark -- \
  --config benchmarks/accuracy-evaluation.yaml \
  --export-csv

# Export to HTML report
npm run benchmark -- \
  --config benchmarks/accuracy-evaluation.yaml \
  --export-html
```

---

## Key Metrics Explained

### Accuracy Metrics

- **Precision**: % of retrieved documents that are relevant
- **Recall**: % of relevant documents that were retrieved
- **F1 Score**: Harmonic mean of precision and recall
- **NDCG**: Normalized Discounted Cumulative Gain (ranking quality)
- **MAP**: Mean Average Precision across queries
- **Hit Rate @K**: % of queries with ≥1 relevant result in top K

### Comparison Metrics

- **Speedup**: Response time improvement (direct time / eBee time)
- **Token Efficiency**: % token savings compared to direct queries
- **Quality Delta**: Difference in result quality (eBee - direct)

### Agent Metrics

- **Response Quality**: Overall quality of agent's answer
- **Answer Completeness**: How complete the answer is
- **Factual Accuracy**: Correctness of information
- **Token Efficiency**: Tokens used per quality point

---

## Best Practices

1. **Ground Truth Data**: Always provide accurate ground truth for accuracy benchmarks
2. **Multiple Iterations**: Run 10-20 iterations for statistical validity
3. **Warmup Runs**: Include 2-5 warmup runs to eliminate cold start effects
4. **Consistent Environment**: Run benchmarks in stable, reproducible environments
5. **Version Control**: Track benchmark configs and results in version control

---

## Next Steps

- See [BENCHMARK_DESIGN.md](./BENCHMARK_DESIGN.md) for architectural details
- See [BEST_PRACTICES.md](./BEST_PRACTICES.md) for benchmarking guidelines
- Check [README.md](../README.md) for API reference
