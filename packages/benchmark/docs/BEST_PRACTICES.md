# Benchmarking Best Practices

## Table of Contents

1. [General Principles](#general-principles)
2. [Environment Setup](#environment-setup)
3. [Measurement Techniques](#measurement-techniques)
4. [Statistical Analysis](#statistical-analysis)
5. [Common Pitfalls](#common-pitfalls)
6. [Reporting Guidelines](#reporting-guidelines)

## General Principles

### 1. Reproducibility

**Always document:**

- Hardware specifications (CPU, RAM, disk)
- Software versions (Node.js, dependencies)
- Environment variables
- Data state (index size, document count)

**Example:**

```yaml
environment:
  hardware:
    cpu: "Apple M2 Pro, 12 cores"
    ram: "32GB"
    disk: "SSD"
  software:
    node: "20.10.0"
    typescript: "5.3.0"
  data:
    documents: 1000
    index_size: "250MB"
    last_sync: "2024-01-15T10:00:00Z"
```

### 2. Isolation

**Minimize external interference:**

- Close unnecessary applications
- Disable background processes
- Use consistent system load
- Avoid network-dependent operations where possible

### 3. Sample Size

**Sufficient iterations:**

- **Quick operations (<100ms)**: 50-100 iterations
- **Medium operations (100ms-1s)**: 20-50 iterations
- **Slow operations (>1s)**: 10-20 iterations

**Rule of thumb:** More iterations = more confidence, but diminishing returns after a point.

## Environment Setup

### Before Running Benchmarks

#### 1. Warm-up the System

```typescript
// Run warm-up iterations to eliminate cold start effects
const warmupRuns = 5;
for (let i = 0; i < warmupRuns; i++) {
  await queryFunction(testQuery);
}

// Now start measurement
const results = [];
for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  await queryFunction(testQuery);
  const end = performance.now();
  results.push(end - start);
}
```

#### 2. Prepare Data

- Pre-index all documents
- Warm database connections
- Pre-load models into memory
- Clear caches if testing cold performance

#### 3. Set Baselines

Always establish a baseline for comparison:

```typescript
const baseline = {
  mode: "naive",
  top_k: 20,
  enable_rerank: false,
};

// Run baseline first
const baselineResults = await runBenchmark(baseline);

// Then compare other configurations
const testResults = await runBenchmark(testConfig);

const improvement =
  ((baselineResults.mean - testResults.mean) / baselineResults.mean) * 100;
console.log(`${improvement.toFixed(1)}% faster than baseline`);
```

## Measurement Techniques

### 1. High-Resolution Timing

Use `performance.now()` for accurate timing:

```typescript
// ✅ Good: High-resolution timing
const start = performance.now();
await operation();
const duration = performance.now() - start;

// ❌ Bad: Low-resolution timing
const start = Date.now();
await operation();
const duration = Date.now() - start; // Only millisecond precision
```

### 2. Measure Complete Operations

Include all relevant overhead:

```typescript
// ✅ Good: Measures complete operation
const start = performance.now();
const query = buildQuery(input);
const results = await executeQuery(query);
const processed = processResults(results);
const duration = performance.now() - start;

// ❌ Bad: Only measures part of operation
const start = performance.now();
const results = await executeQuery(query); // Missing setup/processing
const duration = performance.now() - start;
```

### 3. Breakdown Timing

Measure individual components for detailed analysis:

```typescript
const breakdown = {
  parsing: 0,
  embedding: 0,
  vectorSearch: 0,
  graphTraversal: 0,
  reranking: 0,
  formatting: 0,
};

let start = performance.now();
const parsed = parseQuery(query);
breakdown.parsing = performance.now() - start;

start = performance.now();
const embedding = await generateEmbedding(parsed);
breakdown.embedding = performance.now() - start;

// ... continue for each step
```

## Statistical Analysis

### 1. Central Tendency

Use both mean and median:

```typescript
const mean = values.reduce((a, b) => a + b, 0) / values.length;
const sorted = [...values].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];

// Report both
console.log(`Mean: ${mean.toFixed(1)}ms`);
console.log(`Median: ${median.toFixed(1)}ms`);
```

**When to use:**

- **Mean**: For average performance
- **Median**: When outliers are present

### 2. Variability

Measure standard deviation:

```typescript
const mean = values.reduce((a, b) => a + b, 0) / values.length;
const variance =
  values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
const stdDev = Math.sqrt(variance);

// Coefficient of variation (normalized variability)
const cv = (stdDev / mean) * 100;
console.log(`Std Dev: ${stdDev.toFixed(1)}ms (${cv.toFixed(1)}%)`);
```

**Interpretation:**

- **Low CV (<10%)**: Consistent performance
- **Medium CV (10-30%)**: Some variability
- **High CV (>30%)**: Unstable performance, investigate

### 3. Percentiles

Understand tail latency:

```typescript
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[index];
};

console.log(`p50 (median): ${percentile(values, 0.5).toFixed(1)}ms`);
console.log(`p95: ${percentile(values, 0.95).toFixed(1)}ms`);
console.log(`p99: ${percentile(values, 0.99).toFixed(1)}ms`);
```

**Why percentiles matter:**

- **p95**: 95% of users see this performance or better
- **p99**: Catches worst-case scenarios
- Important for SLA guarantees

### 4. Outlier Detection

Identify and handle outliers:

```typescript
// IQR method
const q1 = percentile(values, 0.25);
const q3 = percentile(values, 0.75);
const iqr = q3 - q1;
const lowerBound = q1 - 1.5 * iqr;
const upperBound = q3 + 1.5 * iqr;

const outliers = values.filter((v) => v < lowerBound || v > upperBound);
const cleaned = values.filter((v) => v >= lowerBound && v <= upperBound);

console.log(`Outliers: ${outliers.length}/${values.length}`);
console.log(`Cleaned mean: ${mean(cleaned).toFixed(1)}ms`);
```

## Common Pitfalls

### ❌ Pitfall 1: Not Warming Up

**Problem:**

```typescript
// First run is always slower due to cold start
for (let i = 0; i < 10; i++) {
  const duration = await measureQuery();
  results.push(duration);
}
```

**Solution:**

```typescript
// Discard warm-up runs
for (let i = 0; i < 5; i++) {
  await measureQuery(); // Warm-up, don't record
}

// Now measure
for (let i = 0; i < 10; i++) {
  const duration = await measureQuery();
  results.push(duration);
}
```

### ❌ Pitfall 2: Insufficient Sample Size

**Problem:**

```typescript
// Only 3 runs - not statistically significant
const results = [245, 312, 198];
const mean = 251.7; // Unreliable
```

**Solution:**

```typescript
// At least 10-20 runs for medium operations
const results = [];
for (let i = 0; i < 20; i++) {
  results.push(await measureQuery());
}
```

### ❌ Pitfall 3: Comparing Apples to Oranges

**Problem:**

```typescript
// Different query types, different data states
const config1Results = await benchmark(complexQuery, smallDataset);
const config2Results = await benchmark(simpleQuery, largeDataset);
// Comparison is meaningless
```

**Solution:**

```typescript
// Same queries, same data state
const queries = [query1, query2, query3];
const config1Results = await benchmarkAll(config1, queries);
const config2Results = await benchmarkAll(config2, queries);
// Now comparison is valid
```

### ❌ Pitfall 4: Ignoring Variability

**Problem:**

```typescript
console.log(`Config A: ${meanA}ms`);
console.log(`Config B: ${meanB}ms`);
console.log(`B is ${meanA - meanB}ms faster!`);
// But what if stdDev is huge?
```

**Solution:**

```typescript
console.log(`Config A: ${meanA}ms ± ${stdDevA}ms`);
console.log(`Config B: ${meanB}ms ± ${stdDevB}ms`);
// Show confidence intervals or error bars
```

### ❌ Pitfall 5: Reporting Only Averages

**Problem:**

```typescript
console.log(`Average: 245ms`);
// Missing: What about p95? p99? Outliers?
```

**Solution:**

```typescript
console.log(`Mean: ${mean}ms`);
console.log(`Median: ${median}ms`);
console.log(`p95: ${p95}ms`);
console.log(`p99: ${p99}ms`);
console.log(`Std Dev: ${stdDev}ms`);
```

## Reporting Guidelines

### 1. Summary Format

```
=== Benchmark Results ===
Configuration: hybrid mode, top_k=60
Date: 2024-01-15 10:30:00
Iterations: 50 (5 warm-up)

Performance:
  Mean:     245.3ms  ±23.4ms
  Median:   238.0ms
  p95:      285.0ms
  p99:      305.0ms
  Min:      198.0ms
  Max:      342.0ms

Comparison to Baseline (naive mode):
  Latency:  +36% slower
  Quality:  +19% better
  Tokens:   +260% more
```

### 2. Comparison Table

```
Mode      | Latency      | Tokens | Quality | Rank
----------|--------------|--------|---------|-----
naive     | 180ms ±15ms  | 125    | 0.75    | 5
local     | 285ms ±28ms  | 325    | 0.82    | 3
global    | 310ms ±32ms  | 350    | 0.79    | 4
hybrid    | 350ms ±23ms  | 450    | 0.89    | 2
mix       | 420ms ±41ms  | 575    | 0.92    | 1
```

### 3. Recommendations

Always include actionable insights:

```
Recommendation: Use 'hybrid' mode

Rationale:
  - 42% faster than 'mix' with only 3% quality drop
  - 22% better quality than 'local' at 23% higher latency
  - Best balance of speed, cost, and quality

When to use 'mix' instead:
  - Quality is critical (research, compliance)
  - Latency is not a concern
  - Token cost is acceptable
```

### 4. Visualizations

Consider including:

- Box plots for distribution
- Line charts for trends over time
- Scatter plots for correlation
- Heat maps for parameter grids

## Checklist

Before publishing benchmark results:

- [ ] Documented environment (hardware, software, data)
- [ ] Used warm-up runs
- [ ] Sufficient sample size (10+ iterations)
- [ ] Measured complete operations
- [ ] Calculated mean, median, stddev, percentiles
- [ ] Identified and handled outliers
- [ ] Compared to baseline
- [ ] Included error bars/confidence intervals
- [ ] Provided actionable recommendations
- [ ] Archived raw data for future reference

## Further Reading

- [Benchmarking Crimes](https://www.brendangregg.com/blog/2018-06-30/benchmarking-crimes.html) by Brendan Gregg
- [How to Benchmark Code Execution Times](https://easyperf.net/blog/2018/08/29/How-to-benchmark) by Denis Bakhvalov
- [Performance Testing Best Practices](https://martinfowler.com/articles/practical-test-pyramid.html#PerformanceTesting) by Martin Fowler
