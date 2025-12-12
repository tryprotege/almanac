# Benchmark Framework Design

## Goals

Create a simple, straightforward benchmark framework that:

1. Provides **clear, actionable metrics**
2. Follows **industry best practices**
3. Is **easy to understand and use**
4. Produces **reproducible results**

## Core Principles

### 1. Measurement Accuracy

- **Warm-up runs**: Eliminate JIT compilation and cold start effects
- **Multiple iterations**: Reduce variance through statistical sampling
- **Controlled environment**: Isolate from external factors
- **High-resolution timing**: Use precise timing mechanisms

### 2. Statistical Validity

- **Mean & Median**: Central tendency measures
- **Standard Deviation**: Measure variability
- **Percentiles (p95, p99)**: Understand outliers
- **Sample size**: Sufficient iterations for confidence

### 3. Clear Reporting

- **Summary metrics**: Quick overview of performance
- **Detailed breakdowns**: Understand where time is spent
- **Comparison tables**: Easy to compare different configurations
- **Trend visualization**: Track performance over time

## Benchmark Types

### 1. Query Performance Benchmark

**What it measures:**

- Response time (latency)
- Token usage (cost)
- Result quality (relevance scores)
- Retrieval efficiency (vector matches, graph expansion)

**Best practices applied:**

- Warm-up: 2-5 runs before measurement
- Iterations: 10-50 runs per configuration
- Cooldown: Optional delay between runs to avoid throttling
- Baseline: Always compare against a baseline configuration

**Output:**

```
Query Performance Benchmark Results
=====================================
Configuration: hybrid mode, top_k=60

Response Time:
  Mean:     245.3ms
  Median:   238.0ms
  Std Dev:  23.4ms
  p95:      285.0ms
  p99:      305.0ms

Token Usage:
  Embedding:  125 tokens
  Reranking:  450 tokens
  Total:      575 tokens

Quality:
  Avg Score:       0.847
  High (>0.8):     72%
  Medium (0.6-0.8): 25%
  Low (<0.6):      3%

Efficiency:
  Vector Matches:   60
  Graph Expanded:   25
  Final Results:    15
```

### 2. Mode Comparison Benchmark

**What it measures:**

- Performance across different LightRAG modes (naive, local, global, hybrid, mix)
- Trade-offs between speed, cost, and quality

**Best practices applied:**

- Same queries across all modes for fair comparison
- Multiple query types (entity-focused, relationship, temporal, etc.)
- Baseline mode (usually "naive") for relative comparison

**Output:**

```
Mode Comparison Results
========================
Query: "Who is working on authentication?"

Mode      | Latency | Tokens | Quality | Rank
----------|---------|--------|---------|-----
naive     | 180ms   | 125    | 0.75    | 5
local     | 285ms   | 325    | 0.82    | 3
global    | 310ms   | 350    | 0.79    | 4
hybrid    | 350ms   | 450    | 0.89    | 2
mix       | 420ms   | 575    | 0.92    | 1

Recommendation: Use 'hybrid' for balanced performance
- 42% faster than 'mix' with only 3% quality drop
- 22% better quality than 'local' at 23% higher latency
```

### 3. Parameter Optimization Benchmark

**What it measures:**

- Impact of different parameter values (top_k, chunk_top_k, score_threshold, etc.)
- Optimal parameter combinations for specific use cases

**Best practices applied:**

- Grid search or random search
- Fix other variables when testing one parameter
- Measure impact on all key metrics (speed, cost, quality)

**Output:**

```
Parameter Optimization: top_k
==============================
Mode: hybrid, query type: entity_focused

top_k | Latency | Tokens | Quality | Cost/Quality
------|---------|--------|---------|-------------
20    | 220ms   | 275    | 0.78    | 353
40    | 280ms   | 425    | 0.85    | 500
60    | 350ms   | 575    | 0.89    | 646
80    | 425ms   | 725    | 0.90    | 806

Recommendation: top_k=60
- Sweet spot for quality/cost trade-off
- Diminishing returns above 60
```

### 4. Accuracy Benchmark

**What it measures:**

- Precision: % of returned results that are relevant
- Recall: % of relevant results that were returned
- F1 Score: Harmonic mean of precision and recall
- NDCG: Normalized Discounted Cumulative Gain (ranking quality)

**Best practices applied:**

- Ground truth dataset with labeled relevance
- Multiple relevance levels (highly relevant, somewhat relevant, not relevant)
- Cross-validation across different query types

**Output:**

```
Accuracy Benchmark Results
===========================
Dataset: 50 queries with ground truth

Precision:  0.85 (85% of results are relevant)
Recall:     0.78 (78% of relevant docs found)
F1 Score:   0.81
NDCG:       0.88 (strong ranking quality)

Per Query Type:
  Entity-focused:  P=0.90, R=0.85, F1=0.87
  Relationship:    P=0.82, R=0.75, F1=0.78
  Temporal:        P=0.80, R=0.72, F1=0.76
  Aggregation:     P=0.85, R=0.80, F1=0.82
```

## Implementation Architecture

```
packages/benchmark/
├── src/
│   ├── types/
│   │   └── index.ts              # Core types (already exists)
│   ├── runners/
│   │   ├── query-benchmark.ts    # Query perf runner (already exists)
│   │   ├── mode-comparison.ts    # Mode comparison runner
│   │   ├── param-optimization.ts # Parameter optimization runner
│   │   └── accuracy-benchmark.ts # Accuracy evaluation runner
│   ├── utils/
│   │   ├── statistics.ts         # Stats functions (already exists)
│   │   ├── metrics.ts            # Metrics collection (already exists)
│   │   ├── warmup.ts             # Warm-up utilities
│   │   ├── baseline.ts           # Baseline management
│   │   └── reporting.ts          # Report generation
│   └── cli.ts                    # CLI interface (already exists)
├── benchmarks/
│   ├── query-performance.yaml
│   ├── mode-comparison.yaml
│   ├── param-optimization.yaml
│   └── accuracy-evaluation.yaml
└── docs/
    ├── BENCHMARK_DESIGN.md       # This file
    ├── BEST_PRACTICES.md         # Benchmarking best practices
    └── EXAMPLES.md               # Usage examples
```

## Key Metrics Definitions

### Latency Metrics

- **Mean**: Average response time across all runs
- **Median**: Middle value (less affected by outliers)
- **p95**: 95% of requests faster than this
- **p99**: 99% of requests faster than this
- **Std Dev**: Variability in response times

### Cost Metrics

- **Tokens per query**: Total tokens used (embedding + reranking + LLM)
- **Cost per query**: Estimated $ cost based on token usage
- **Cost per result**: Tokens divided by number of quality results

### Quality Metrics

- **Average score**: Mean relevance score of returned results
- **Score distribution**: Breakdown by score ranges (high/medium/low)
- **Unique documents**: Number of distinct source documents
- **Results per second**: Throughput measure

### Efficiency Metrics

- **Vector matches**: Number of results from vector search
- **Graph expanded**: Additional results from graph traversal
- **Reranked**: Number of results passed through reranking
- **Final results**: Count of results above threshold

## Benchmarking Best Practices

### Before Running Benchmarks

1. **Stable Environment**

   - Close unnecessary applications
   - Ensure consistent CPU/memory availability
   - Use same hardware for comparable results

2. **Data Preparation**

   - Pre-index all data
   - Warm database connections
   - Pre-load models into memory

3. **Configuration**
   - Document all settings
   - Use consistent random seeds
   - Version benchmark code

### During Benchmarks

1. **Warm-up Phase**

   - Run 2-5 warm-up iterations
   - Discard warm-up results
   - Verify system is warmed up

2. **Measurement Phase**

   - Run sufficient iterations (10-50)
   - Monitor for anomalies
   - Log all runs for analysis

3. **Cooldown**
   - Optional delay between runs
   - Avoid rate limiting
   - Allow GC to run

### After Benchmarks

1. **Statistical Analysis**

   - Calculate summary statistics
   - Identify and investigate outliers
   - Check for trends or patterns

2. **Reporting**

   - Clear, actionable insights
   - Visual aids (tables, charts)
   - Comparison to baseline

3. **Archiving**
   - Save raw results
   - Document environment
   - Track over time

## Next Steps

1. Implement warm-up and baseline utilities
2. Create reporting templates
3. Add statistical validation
4. Build example benchmarks
5. Write comprehensive documentation
