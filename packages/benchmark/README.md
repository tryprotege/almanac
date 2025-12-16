# @ebee-oss/benchmark

Benchmarking framework for eBee MCP server performance testing.

## Features

- 🚀 **Query Performance** - Benchmark LightRAG with auto-selected or custom parameters
- 🤖 **Agent Comparison** - Compare Amp CLI, Claude CLI, and other AI agents
- ⚖️ **eBee vs Direct** - Compare eBee unified search vs direct MCP server queries
- 📊 **Rich Metrics** - Timing, token usage, quality scores
- 📈 **CSV Export** - Results exported to CSV for analysis

## Installation

```bash
pnpm install
```

## Quick Start

```typescript
import { runQueryBenchmarks, exportResults } from "@ebee-oss/benchmark";
import { lightragQuery } from "@ebee-oss/server";

const config = {
  name: "My Benchmark",
  description: "Testing query performance",
  type: "query" as const,
  iterations: 10,
  outputDir: "./results",
  queries: [
    {
      id: "test_query",
      query: "Who is working on authentication?",
      category: "entity_focused" as const,
    },
  ],
  // modes and parameters are optional - LLM will auto-select
};

const results = await runQueryBenchmarks(config, lightragQuery);
exportResults(results, "./benchmark-results");
```

## Configuration

See `src/configs/comparison.config.ts` for a complete example of eBee vs Direct comparison with CLI agents.

**Config Types:**

- `QueryBenchmarkConfig` - LightRAG query performance testing
- `ComparisonBenchmarkConfig` - eBee vs direct MCP comparison
- `AgentBenchmarkConfig` - AI agent comparison

## Running Benchmarks

**From TypeScript:**

```typescript
import { comparisonBenchmarkConfig } from "./src/configs/comparison.config";
import { runComparisonBenchmark } from "@ebee-oss/benchmark";

const results = await runComparisonBenchmark(
  comparisonBenchmarkConfig,
  ebeeQueryFn,
  directQueryFn
);
```

**Build First:**

```bash
pnpm build
```

## Reading Results

Results are exported to CSV files in your specified output directory.

### Query Benchmark CSV

```csv
queryId,mode,totalTime,tokens,results,avgScore
entity_query,mix,245,1250,15,0.823
```

**Columns:**

- `queryId` - Query identifier
- `mode` - LightRAG mode used
- `totalTime` - Response time in milliseconds
- `tokens` - Total tokens used
- `results` - Number of results returned
- `avgScore` - Average relevance score

### Comparison Benchmark CSV

```csv
scenario_id,agent,ebee_time,ebee_tokens,direct_time,direct_tokens,speedup,token_efficiency
multi_source,amp,245,1250,512,2100,2.09,40.5
```

**Key Metrics:**

- `speedup` - How many times faster (direct_time / ebee_time)
- `token_efficiency` - Percentage of token savings
- `quality_delta` - Difference in result quality

### Interpreting Results

**Query Performance:**

- Lower `totalTime` = faster queries
- Higher `avgScore` = better relevance
- Check p95/p99 percentiles for consistency

**Comparison:**

- `speedup > 1.0` = eBee is faster
- `token_efficiency > 0` = eBee uses fewer tokens
- `quality_delta ≥ 0` = eBee maintains or improves quality

## CLI Tools

This package integrates with CLI-based AI agents:

**Amp Code CLI:**

```bash
curl -fsSL https://ampcode.com/install.sh | bash
```

**Claude Code CLI:**
Install from https://claude.ai/code

Both tools support MCP configuration for benchmarking.

## Metrics Collected

**Query Benchmarks:**

- Response time (mean, median, p95, p99)
- Token usage (embedding, reranking, total)
- Result quality (score, distribution)
- Retrieval breakdown (vector matches, graph expansion)

**Comparison Benchmarks:**

- Speedup factor
- Token efficiency
- Quality delta
- MCP call counts

## Development

```bash
# Build
pnpm build

# Type check
pnpm type-check
```

## License

MIT
