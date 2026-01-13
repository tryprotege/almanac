# @ebee-oss/benchmark

Benchmarking framework for eBee MCP server performance testing using **CLI-based execution** for accurate, real-world metrics.

## Features

- 🚀 **Query Performance** - Benchmark LightRAG with auto-selected or custom parameters
- ⚖️ **Agent × MCP Matrix** - Compare different agents (Amp, Claude) with eBee vs Direct MCP setups
- 📊 **Rich Metrics** - Timing, token usage, quality scores, and cost analysis
- 📈 **CSV Export** - Results exported to CSV for analysis
- 🎯 **CLI-First** - Uses actual CLI tools for fair comparison and accurate metrics

## Why CLI-Based?

Unlike TypeScript SDK approaches, this benchmark uses actual CLI tools to:

1. **Accurate Token Counting** - Extract real token usage from CLI output, not estimates
2. **Fair Comparison** - All agents run in identical execution environments
3. **Real-World Performance** - Captures actual overhead including:
   - Process startup time
   - File I/O operations
   - Network latency
   - Tool execution delays
4. **Cost Tracking** - Calculate actual costs based on real token usage

## Installation

```bash
pnpm install
```

## Environment Setup

The benchmark package requires API keys for the CLI agents you want to test.

### 1. Create Environment File

Copy the example environment file:

```bash
cd packages/benchmark
cp .env.example .env
```

### 2. Configure API Keys

Edit `.env` and add your API keys:

```bash
# API Keys for CLI Agents
AMP_API_KEY=sk-ant-xxxxx
CLAUDE_API_KEY=sk-ant-xxxxx

# eBee Server Configuration
EBEE_URL=http://localhost:3000

# Benchmark Configuration
BENCHMARK_OUTPUT_DIR=./benchmark-results
BENCHMARK_ITERATIONS=3
```

**API Key Requirements:**

- **AMP_API_KEY** - Required for Amp CLI benchmarks (get from https://console.anthropic.com)
- **CLAUDE_API_KEY** - Required for Claude CLI benchmarks (get from https://console.anthropic.com)

Both Amp and Claude use Anthropic's API, so you can use the same API key for both.

## Quick Start: Agent × MCP Matrix Benchmark

The primary benchmark compares different CLI agents with eBee vs Direct MCP setups:

```typescript
import { runMatrixBenchmark } from '@ebee-oss/benchmark';
import type { MatrixBenchmarkConfig } from '@ebee-oss/benchmark';

const config: MatrixBenchmarkConfig = {
  name: 'Agent × MCP Matrix Comparison',
  type: 'matrix',
  iterations: 3,
  outputDir: './results',

  // Agents to test
  agents: [
    {
      name: 'amp',
      model: 'claude-haiku-4-5-20251001',
    },
    {
      name: 'claude-cli',
      model: 'claude-haiku-4-5-20251001',
    },
  ],

  // MCP setup configurations
  mcpSetups: {
    ebee: {
      url: 'http://localhost:3000',
    },
    direct: {
      servers: ['fathom', 'notion'],
      packages: {
        fathom: '@ebee-oss/fathom-mcp-server',
        notion: '@notionhq/notion-mcp-server',
      },
    },
  },

  // Test scenarios
  scenarios: [
    {
      id: 'decisions',
      query: "What were the key decisions from last week's meeting?",
      targetServers: ['fathom'],
    },
  ],
};

const results = await runMatrixBenchmark(config);
console.log(`Best combination: ${results.analysis.bestCombination}`);
```

## Running Benchmarks

```bash
# Run the matrix benchmark
pnpm test:matrix
```

This will:

1. Test each agent with **eBee** (unified search)
2. Test each agent with **Direct MCP** (individual server queries)
3. Generate a comparison matrix showing which combination is fastest/cheapest

## Understanding the Matrix

The matrix benchmark produces a table like this:

```
Agent      | eBee Time | eBee Tokens | Direct Time | Direct Tokens | Speedup
-----------|-----------|-------------|-------------|---------------|--------
amp        | 2100ms    | 1200        | 3500ms      | 2100         | 1.67x
claude-cli | 2500ms    | 1400        | 4200ms      | 2300         | 1.68x
```

This shows:

- **Which agent is fastest** with each setup
- **How much speedup** eBee provides over Direct
- **Token efficiency** of each combination
- **Cost savings** per agent

## Reading Results

Results are exported to CSV files in your output directory.

### Matrix CSV (`matrix-{timestamp}.csv`)

```csv
agent,setup,time_ms,tokens,cost_usd,quality
amp,ebee,2100,1200,0.0180,0.85
amp,direct,3500,2100,0.0315,0.82
claude-cli,ebee,2500,1400,0.0210,0.90
claude-cli,direct,4200,2300,0.0345,0.88
```

### Analysis CSV (`analysis-{timestamp}.csv`)

```csv
agent,speedup,token_savings_%,cost_savings_%
amp,1.67,42.9,42.9
claude-cli,1.68,39.1,39.1

# Summary
best_combination,amp + eBee
fastest_with_ebee,amp + eBee
fastest_with_direct,amp + Direct
most_efficient,amp (1.67x speedup)
```

### Interpreting Results

**Key Metrics:**

- **speedup > 1.0** = eBee is faster than Direct
- **token_savings > 0** = eBee uses fewer tokens
- **cost_savings > 0** = eBee is cheaper to run

**Best Combination** = Fastest overall with lowest cost
**Most Efficient** = Highest speedup ratio

## CLI Tools Setup

### Required CLI Tools

Install the CLI tools you want to benchmark:

**Amp Code CLI:**

```bash
curl -fsSL https://ampcode.com/install.sh | bash
```

**Claude Code CLI:**

Install from https://claude.ai/code

### Validation

The benchmark will automatically validate CLI tools are installed before running:

```typescript
import { validateCLIAgent, checkCLIAvailable } from '@ebee-oss/benchmark';

// Check if tool is available
const hasAmp = await checkCLIAvailable('amp');

// Validate agent configuration
await validateCLIAgent({
  name: 'amp',
  model: 'claude-3-5-sonnet-20241022',
});
```

## Configuration

### Agent Configuration

Each agent requires:

```typescript
interface AgentConfig {
  name: string; // "amp", "claude-cli", etc.
  model: string; // e.g., "claude-3-5-sonnet-20241022"
  apiKey?: string; // Optional, defaults to env var
  command?: string; // Custom CLI command (optional)
}
```

### Matrix Configuration

Full configuration structure:

```typescript
interface MatrixBenchmarkConfig {
  name: string;
  description?: string;
  type: 'matrix';
  iterations: number;
  outputDir: string;
  agents: AgentConfig[];
  mcpSetups: {
    ebee: {
      url: string; // eBee server URL
    };
    direct: {
      servers: string[]; // MCP server names
      packages: Record<string, string>; // Server name -> package
    };
  };
  scenarios: MatrixScenario[];
}
```

## Metrics Collected

**Per Agent × Setup Combination:**

- **Execution Time** - Wall-clock time including all overhead
- **Token Usage** - Extracted from CLI output (input, output, total)
- **Cost** - Calculated from actual token usage based on model pricing
- **Quality Score** - Response quality assessment

**Analysis:**

- Speedup factor (eBee vs Direct per agent)
- Token efficiency percentage
- Cost savings percentage
- Best overall combination
- Most efficient agent

## Output Parsing

The CLI runner automatically parses output from different tools:

- **Claude CLI** - Extracts token counts and tool usage
- **Amp CLI** - Parses Amp-specific output format
- **Generic** - Fallback parser for unknown formats

Token extraction patterns:

```
Input tokens: 123, Output tokens: 456
Tokens used: 1234 (input: 123, output: 456)
```

## Development

```bash
# Build
pnpm build

# Type check
pnpm type-check

# Run matrix benchmark
pnpm test:matrix
```

## License

MIT
