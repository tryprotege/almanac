# Benchmarking Package

Tools for benchmarking the multi-source data integration system, including mock data generation.

## Mock Data Generator

Generates realistic synthetic data for benchmarking across multiple platforms (Slack, Notion, GitHub, Fathom).

### Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Add your OpenAI API key to .env
# OPENAI_API_KEY=sk-...

# Generate data
pnpm run generate:small    # 30 days (~3,180 records)
pnpm run generate:medium   # 180 days (~19,080 records)
pnpm run generate:large    # 365 days (~38,660 records)
```

### Configuration

#### Environment Variables (.env)

Basic configuration is done through the `.env` file:

```bash
# Timeline duration (days)
TIMELINE_DAYS=30

# LLM Configuration
OPENAI_API_KEY=sk-...
TEMPERATURE=0.8           # LLM temperature (0.0-1.0, higher = more creative)
BATCH_SIZE=20             # Number of items to generate per batch
MAX_RETRIES=3             # Maximum retry attempts for failed LLM calls
RATE_LIMIT_DELAY=1000     # Delay between API calls (ms)

# Output directory
OUTPUT_DIR=./output
```

#### Customizing Data Generation Rates

To modify the daily generation rates for each platform, edit `src/mock-data-generator/config.ts`:

```typescript
export function calculateVolumes(timelineDays: number): VolumeConfig {
  return {
    slackMessages: Math.max(40, Math.floor(timelineDays * 1000)), // Default: 1000/day
    githubIssues: Math.max(8, Math.floor(timelineDays * 1.7)), // Default: ~50/month
    githubPRs: Math.max(8, Math.floor(timelineDays * 1.7)), // Default: ~50/month
    notionPages: Math.max(8, Math.floor(timelineDays * 2)), // Default: 2/day
    fathomMeetings: Math.max(8, Math.floor(timelineDays * 0.7)), // Default: ~20/month
  };
}
```

**Note:** Minimum values (40 for Slack, 8 for others) ensure each of the 4 stages gets at least some data, even for 1-2 day timelines. When generating short timelines, the stage distribution (40%/20%/20%/20%) with floor rounding could result in 0 items for later stages without these minimums.

**Examples:**

To increase Slack messages to 2000 per day:

```typescript
slackMessages: Math.max(10, Math.floor(timelineDays * 2000)),
```

To double GitHub activity:

```typescript
githubIssues: Math.max(4, Math.floor(timelineDays * 3.4)),  // ~100/month
githubPRs: Math.max(4, Math.floor(timelineDays * 3.4)),     // ~100/month
```

To reduce Notion pages to 1 per day:

```typescript
notionPages: Math.max(4, Math.floor(timelineDays * 1)),
```

#### Fixed Generation Rates

Current default rates per day:

| Platform             | Rate     | Monthly Total (30 days) |
| -------------------- | -------- | ----------------------- |
| Slack Messages       | 1000/day | ~30,000/month           |
| GitHub Issues        | ~1.7/day | ~50/month               |
| GitHub Pull Requests | ~1.7/day | ~50/month               |
| Notion Pages         | 2/day    | ~60/month               |
| Fathom Meetings      | ~0.7/day | ~20/month               |

### Data Generation Stages

The mock data generator creates data in 4 progressive stages, each adding more complexity and cross-platform connections:

#### Stage Distribution

| Stage           | Percentage | Description                                 |
| --------------- | ---------- | ------------------------------------------- |
| **Foundation**  | 40%        | Standalone records with NO cross-references |
| **Connection**  | 20%        | Adds first-level cross-platform links       |
| **Integration** | 20%        | Adds deeper multi-platform interconnections |
| **Synthesis**   | 20%        | Adds complex multi-hop relationship chains  |

**Example:** For 100 total Slack messages:

- Foundation: 40 standalone messages
- Connection: 20 messages with basic links
- Integration: 20 messages with deeper connections
- Synthesis: 20 messages with complex chains

This distribution ensures realistic data with varying levels of interconnectedness, mimicking real-world usage patterns.

### Output

Generated data is saved to `output/` directory in multiple formats:

```
output/
├── foundation/        # Stage 1 - 40% standalone data
│   └── data.json
├── connection/        # Stage 2 - 20% first-level links
│   └── data.json
├── integration/       # Stage 3 - 20% deep links
│   └── data.json
├── synthesis/         # Stage 4 - 20% complex chains
│   └── data.json
└── combined/          # All stages merged (use this for testing)
    └── data.json
```

**Note:** Use `combined/data.json` for connecting with the mock-mcp-server.

## Using with Mock MCP Server

After generating data, you can use the mock-mcp-server to simulate real API responses for testing and benchmarking.

### Workflow

#### 1. Generate Mock Data

First, generate the synthetic data:

```bash
cd packages/benchmarking
pnpm run generate:medium  # or small/large
```

This creates `output/combined/data.json` with all generated data.

#### 2. Configure Mock MCP Server

Navigate to the mock-mcp-server and set up the environment:

```json
{
    "slack-mock": {
      "command": "npx",
      "args": ["-y", "./packages/mock-mcp-server"],
      "env": {
        "MOCK_DATA_PATH": "/Users/viveksingh/Desktop/Projects/ebee-oss/packages/benchmarking/output/combined/data.json",
        "SOURCE_TYPE": "slack"
      }
    },
    "github-mock": {
      "command": "npx",
      "args": ["-y", "./packages/mock-mcp-server"],
      "env": {
        "MOCK_DATA_PATH": "/Users/viveksingh/Desktop/Projects/ebee-oss/packages/benchmarking/output/combined/data.json",
        "SOURCE_TYPE": "github"
      }
}
```

The mock server will now respond with data from your generated dataset, simulating the selected platform's API.

### Switching Between Platforms

To test different platforms, simply change the `SOURCE_TYPE` in the mock-mcp-server's `.env`:

**Test Slack:**

```bash
SOURCE_TYPE=slack
```

**Test GitHub:**

```bash
SOURCE_TYPE=github
```

**Test Notion:**

```bash
SOURCE_TYPE=notion
```

**Test Fathom:**

```bash
SOURCE_TYPE=fathom
```

### Example: Full Testing Workflow

```bash
# Step 1: Generate data (30 days, ~3,180 records)
cd packages/benchmarking
pnpm run generate:small

# Step 2: Configure mock server for Slack
{
    "slack-mock": {
      "command": "npx",
      "args": ["-y", "./packages/mock-mcp-server"],
      "env": {
        "MOCK_DATA_PATH": "/Users/viveksingh/Desktop/Projects/ebee-oss/packages/benchmarking/output/combined/data.json",
        "SOURCE_TYPE": "slack"
      }
    },
    "github-mock": {
      "command": "npx",
      "args": ["-y", "./packages/mock-mcp-server"],
      "env": {
        "MOCK_DATA_PATH": "/Users/viveksingh/Desktop/Projects/ebee-oss/packages/benchmarking/output/combined/data.json",
        "SOURCE_TYPE": "github"
    },
    "fathom-mock": {
      "command": "npx",
      "args": ["-y", "./packages/mock-mcp-server"],
      "env": {
        "MOCK_DATA_PATH": "/Users/viveksingh/Desktop/Projects/ebee-oss/packages/benchmarking/output/combined/data.json",
        "SOURCE_TYPE": "fathom"
    },
    "notion-mock": {
      "command": "npx",
      "args": ["-y", "./packages/mock-mcp-server"],
      "env": {
        "MOCK_DATA_PATH": "/Users/viveksingh/Desktop/Projects/ebee-oss/packages/benchmarking/output/combined/data.json",
        "SOURCE_TYPE": "notion"
    },
}
```

# Step 3: Now you can test the data with roo/cline

-> Tested following query

```
which github issue are we talking about in slack?
```

Response

```

The team is discussing **GitHub Issue #1: "Slow Markdown to PDF conversion for large docs"** from the `gragger-docs` repository.

**Issue Link:** https://github.com/gragger/gragger-docs/issues/1

**Key Details:**

- **Problem:** PDF conversion takes 12-15 seconds for 200-page documents and up to 18 minutes for 300-page documents
- **Root Cause:** Bottleneck in Pandoc/wkhtmltopdf rendering with high memory usage (>800 MB for ~50 MB Markdown files)
- **Impact:** Affecting user experience on docs portal and CI build times

**Proposed Solutions:**

1. Chunking large files and merging PDFs
2. Streaming approach instead of loading entire files into memory
3. Switching to alternative renderers (XeLaTeX, WeasyPrint, PrinceXML)
4. Caching intermediate HTML/LaTeX/PDF fragments
5. Child process wrapper with Redis-backed queue for throttling

**Current Status:** PR #42 is in progress implementing a caching layer expected to reduce conversion time by ~35%

The issue is being actively discussed across multiple Slack channels: #product, #engineering, #backend, and #game-dev.

```

## Advanced Configuration

### Adjusting LLM Behavior

Modify these values in `.env` to control AI generation:

- **TEMPERATURE** (0.0-1.0): Higher values = more creative/varied content

  - `0.3` - More deterministic, factual
  - `0.8` - Balanced (default)
  - `1.0` - More creative, diverse

- **BATCH_SIZE**: Number of items to generate at once

  - Lower values (5-10) = Slower but more reliable
  - Higher values (20-30) = Faster but may hit rate limits

- **RATE_LIMIT_DELAY**: Milliseconds between API calls
  - Increase if hitting OpenAI rate limits
  - Decrease for faster generation (if API allows)

### Example: High-Volume Configuration

For generating large datasets quickly:

```bash
# .env
TIMELINE_DAYS=365
TEMPERATURE=0.9
BATCH_SIZE=30
RATE_LIMIT_DELAY=500
```

NOTE: If you are taking test-data for 1-5 days then you can modify `config.ts`

```typescript
slackMessages: Math.max(10, Math.floor(timelineDays * 2000)), // 2000/day
githubIssues: Math.max(4, Math.floor(timelineDays * 3.4)),    // ~100/month
githubPRs: Math.max(4, Math.floor(timelineDays * 3.4)),       // ~100/month
notionPages: Math.max(4, Math.floor(timelineDays * 3)),       // 3/day
fathomMeetings: Math.max(4, Math.floor(timelineDays * 1.4)),  // ~40/month
```

This would generate approximately:

- 730,000 Slack messages
- 1,241 GitHub issues
- 1,241 GitHub PRs
- 1,095 Notion pages
- 511 Fathom meetings

**Total: ~734,088 records over 365 days**

## Architecture

See [MOCK_DATA_GENERATION_PLAN.md](../../docs/benchmark/MOCK_DATA_GENERATION_PLAN.md) for detailed architecture and implementation details.

## Troubleshooting

### Rate Limiting

If you encounter OpenAI rate limits:

1. Increase `RATE_LIMIT_DELAY` in `.env` (try 2000ms or higher)
2. Decrease `BATCH_SIZE` (try 10 or lower)
3. Add delays in your API key settings on OpenAI's platform

### Out of Memory

For large datasets (365+ days):

1. Generate in smaller batches
2. Reduce concurrent operations
3. Increase Node.js heap size: `NODE_OPTIONS=--max-old-space-size=8192 pnpm run generate:large`

### Data Quality

If generated content seems repetitive:

1. Increase `TEMPERATURE` (try 0.9)
2. Reduce `BATCH_SIZE` for more diverse prompts
3. Ensure sufficient timeline days (30+ recommended)
