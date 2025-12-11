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

Set `TIMELINE_DAYS` in `.env` to control the amount of data generated.

Fixed rates:

- Slack: ~100 messages/day
- GitHub Issues: ~1.7/day
- GitHub PRs: ~1.7/day
- Notion Pages: ~2/day
- Fathom Meetings: ~0.7/day

### Output

Generated data is saved to `output/` directory:

- `foundation/` - Stage 1 standalone data
- `connection/` - Stage 2 first-level links
- `integration/` - Stage 3 deep links
- `synthesis/` - Stage 4 complex chains
- `combined/` - All stages merged

### Architecture

See [MOCK_DATA_GENERATION_PLAN.md](../../docs/benchmark/MOCK_DATA_GENERATION_PLAN.md) for detailed architecture.
