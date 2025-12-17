# Benchmarking Package

Tools for benchmarking the multi-source data integration system, including workflow-based mock data generation with realistic cross-platform connections.

## Mock Data Generator

Generates realistic synthetic data for benchmarking across multiple platforms (Slack, Notion, GitHub, Fathom) using **workflow-based generation** that creates coherent narratives spanning all services with deterministic cross-references.

### Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Add your API configuration to .env
# LLM_API_KEY=sk-...
# LLM_BASE_URL=https://api.openai.com/v1

# Generate data
pnpm run generate:small    # 7 days (for quick testing)
pnpm run generate:medium   # 180 days
pnpm run generate:large    # 365 days
```

### Configuration

#### Environment Variables (.env)

Basic configuration is done through the `.env` file:

```bash
# Timeline duration (days)
TIMELINE_DAYS=30

# LLM Configuration
LLM_API_KEY=sk-...                    # Your LLM provider API key
LLM_BASE_URL=https://api.openai.com/v1  # LLM API endpoint
TEMPERATURE=0.8                        # LLM temperature (0.0-1.0, higher = more creative)
BATCH_SIZE=20                          # Number of items to generate per batch
MAX_RETRIES=3                          # Maximum retry attempts for failed LLM calls
RATE_LIMIT_DELAY=1000                  # Delay between API calls (ms)
LLM_CONCURRENCY=10                     # Number of concurrent LLM requests

# Output directory
OUTPUT_DIR=./output
```

#### Customizing Data Generation Rates

To modify the daily generation rates for each platform, edit `src/mock-data-generator/config.ts`:

```typescript
export function calculateVolumes(timelineDays: number): VolumeConfig {
  return {
    slackMessages: Math.max(40, Math.floor(timelineDays * 50)), // Default: 50/day
    githubIssues: Math.max(8, Math.floor(timelineDays * 1.7)), // Default: ~50/month
    githubPRs: Math.max(8, Math.floor(timelineDays * 1.7)), // Default: ~50/month
    notionPages: Math.max(8, Math.floor(timelineDays * 2)), // Default: 2/day
    fathomMeetings: Math.max(8, Math.floor(timelineDays * 0.7)), // Default: ~20/month
  };
}
```

**Note:** Minimum values (40 for Slack, 8 for others) ensure each of the 4 stages gets at least some data, even for 1-2 day timelines. When generating short timelines, the stage distribution (40%/20%/20%/20%) with floor rounding could result in 0 items for later stages without these minimums.

**Examples:**

To increase Slack messages to 200 per day:

```typescript
slackMessages: Math.max(40, Math.floor(timelineDays * 200)),
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
| Slack Messages       | 50/day   | ~1,500/month            |
| GitHub Issues        | ~1.7/day | ~50/month               |
| GitHub Pull Requests | ~1.7/day | ~50/month               |
| Notion Pages         | 2/day    | ~60/month               |
| Fathom Meetings      | ~0.7/day | ~20/month               |

### Workflow-Based Generation

The mock data generator uses **workflow templates** to create realistic cross-platform narratives. Each workflow follows common software development patterns and creates deterministic connections across services.

#### Available Workflow Templates

| Workflow                | Frequency | Description                                                          |
| ----------------------- | --------- | -------------------------------------------------------------------- |
| **Bug Fix**             | 30%       | Bug reported → Slack discussion → Meeting → PR                       |
| **Feature Development** | 25%       | Slack thread → Meeting → Notion spec → Issue → PR                    |
| **Meeting Follow-up**   | 20%       | Slack msg → Meeting → Notion notes → Issue                           |
| **Incident Response**   | 10%       | Urgent Slack → Incident call → Issue → PR → Postmortem               |
| **Design Review**       | 15%       | Notion design → Slack thread → Review meeting → Updated spec → Issue |

Each workflow creates a cohesive story with:

- **Deterministic cross-references**: Issues link to PRs, Slack mentions issues, Notion pages reference meetings
- **Realistic timing**: Stages have configurable delays (e.g., PR comes 24-168 hours after issue)
- **Contextual content**: LLM-generated content that references previous stages
- **Natural progression**: Workflows follow real software development patterns

#### Data Generation Stages

Data is generated in 4 progressive stages to ensure variety:

| Stage           | Percentage | Description                               |
| --------------- | ---------- | ----------------------------------------- |
| **Foundation**  | 40%        | Core entities and some standalone records |
| **Connection**  | 20%        | First-level workflow connections          |
| **Integration** | 20%        | Deeper multi-platform workflows           |
| **Synthesis**   | 20%        | Complex multi-hop workflow chains         |

This staged approach ensures a mix of connected workflows and standalone items, mimicking real-world data diversity.

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
├── combined/          # All stages merged
│   ├── data.json      # Flat structure (use with mock-mcp-server)
│   └── grouped.json   # Workflow-grouped structure (for analysis)
└── metadata.json      # Generation metadata (dates, volumes, etc.)
```

**Output Formats:**

- **`combined/data.json`**: Flat structure organized by service (GitHub, Slack, Notion, Fathom). Use this with mock-mcp-server.
- **`combined/grouped.json`**: Workflow-grouped structure showing connected records and cross-references. Use this for analyzing relationships and testing multi-source queries.

**Grouped Output Structure:**

```json
{
  "metadata": {
    "generatedAt": "2025-12-16T14:00:00Z",
    "version": "2.0",
    "summary": {
      "totalWorkflows": 15,
      "totalRecordsInWorkflows": 87,
      "totalStandaloneRecords": 23,
      "servicesCovered": ["github", "slack", "notion", "fathom"]
    }
  },
  "workflows": [
    {
      "groupId": "workflow-issue-42",
      "title": "Matchmaking service high latency",
      "description": "GitHub Issue #42",
      "timeline": { "startDate": "...", "endDate": "..." },
      "records": {
        "githubIssues": [...],
        "githubPRs": [...],
        "slackThreads": [...],
        "notionPages": [...],
        "fathomMeetings": [...]
      },
      "crossReferences": [
        {
          "type": "pr-to-issue",
          "from": "pr-12",
          "to": "issue-42",
          "context": "PR references issue in body"
        }
      ],
      "metrics": {
        "totalRecords": 8,
        "totalMessages": 15,
        "participantCount": 4,
        "servicesCovered": ["github", "slack", "notion", "fathom"]
      }
    }
  ],
  "shared": {
    "users": { "github": [...], "slack": [...], ... },
    "infrastructure": { "slackChannels": [...], "githubRepositories": [...], ... },
    "standalone": { "slackMessages": [...], "slackThreads": [...] }
  }
}
```

**Metadata Tracking:**

The generator maintains a `metadata.json` file that tracks:

- Dataset start/end dates
- Total days covered
- Generation history (for append mode)
- Volume statistics per run

This enables **incremental data generation** where you can append new data backwards in time while preserving existing data.

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

This configuration for 365 days would generate approximately:

- 18,250 Slack messages (50/day)
- 620 GitHub issues (~1.7/day)
- 620 GitHub PRs (~1.7/day)
- 730 Notion pages (2/day)
- 256 Fathom meetings (~0.7/day)

**Total: ~20,476 records over 365 days**

These volumes are organized into workflows, creating realistic cross-platform narratives rather than isolated records.

## Architecture

### Key Components

1. **Workflow Orchestrator** ([`workflows/orchestrator.ts`](src/mock-data-generator/workflows/orchestrator.ts))

   - Executes workflow templates
   - Manages cross-service connections
   - Ensures consistent references between services

2. **Workflow Templates** ([`workflows/templates.ts`](src/mock-data-generator/workflows/templates.ts))

   - Define common development patterns
   - Specify stage sequences and timing
   - Configure reference relationships

3. **Topic Generation** ([`workflows/topics.ts`](src/mock-data-generator/workflows/topics.ts))

   - LLM-generated realistic topics
   - Contextual for gaming startup
   - Assigns participants and technical details

4. **Grouping Utility** ([`utils/grouping.ts`](src/mock-data-generator/utils/grouping.ts))

   - Creates workflow-grouped output
   - Extracts cross-references
   - Generates relationship graph

5. **Stage Generators** ([`stages/`](src/mock-data-generator/stages/))
   - Foundation: Core entities and infrastructure
   - Connection: First-level workflow execution
   - Integration: Deeper workflow connections
   - Synthesis: Complex multi-service workflows

### Data Flow

```
1. Load config & calculate volumes
2. Generate workflow topics (LLM)
3. Foundation Stage (40%)
   ├─ Create users, channels, repos, databases
   └─ Generate standalone items
4. Connection Stage (20%)
   └─ Execute workflows with 1-2 services
5. Integration Stage (20%)
   └─ Execute workflows with 2-3 services
6. Synthesis Stage (20%)
   └─ Execute complex multi-service workflows
7. Combine & output
   ├─ Flat structure (data.json)
   ├─ Grouped structure (grouped.json)
   └─ Metadata (metadata.json)
```

### Cross-Reference Strategy

The system creates explicit connections between services:

- **GitHub Issues ↔ PRs**: PRs reference issues in body with "Fixes #123"
- **Slack ↔ GitHub**: Threads mention issues/PRs by number
- **Notion ↔ GitHub**: Pages link to issues in "Related Issues" section
- **Fathom ↔ All**: Meeting transcripts reference issues, docs, and Slack discussions
- **Slack ↔ Notion**: Messages share Notion page URLs
- **Slack ↔ Fathom**: Threads discuss meeting topics

These references are:

1. **Deterministic**: Created during workflow execution
2. **Bidirectional**: Both services reference each other
3. **Contextual**: Content reflects the relationship
4. **Extractable**: Parseable by grouping utility

For detailed architecture, see [MOCK_DATA_GENERATION_PLAN.md](../../docs/benchmark/MOCK_DATA_GENERATION_PLAN.md).

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
3. Increase workflow count relative to timeline days
4. Ensure sufficient timeline days (30+ recommended for variety)

### Incremental Generation (Append Mode)

The generator supports appending data backwards in time:

```bash
# Generate initial 30 days
TIMELINE_DAYS=30 pnpm run generate

# Append 30 more days BEFORE the existing data
TIMELINE_DAYS=30 pnpm run generate
```

The generator automatically:

- Detects existing `metadata.json`
- Calculates new date range before existing data
- Merges new data with existing (new data first)
- Updates metadata with cumulative totals

This is useful for gradually building large datasets without overwhelming API limits.
