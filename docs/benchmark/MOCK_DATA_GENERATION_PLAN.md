# Mock Data Generation Plan for Multi-Source Data Integration

## Executive Summary

This document outlines a strategy for generating realistic synthetic data across multiple platforms (Slack, Notion, GitHub, Fathom) to benchmark a multi-source data integration system.

**Key Features**:

- **Simple configuration**: Set number of days (fixed ~100 Slack messages/day)
- **4-stage strategy**: Natural relationship chains with 60% connected, 40% standalone data
- **Category-based linking**: Work links to work, casual links to casual, work-adjacent bridges both
- **Type-compatible**: Matches existing server types for seamless integration

---

## Table of Contents

1. [Company Setup](#company-setup-gragger)
2. [4-Stage Generation Strategy](#4-stage-generation-strategy)
3. [Data Examples](#data-examples)
4. [Volume Configuration](#volume-configuration)
5. [Implementation Guide](#implementation-guide)

---

## Company Setup: GRagger

**Company Profile**:

- **Name**: GRagger
- **Industry**: Gaming & Interactive Entertainment
- **Stage**: Early stage startup
- **Mission**: Building next-generation multiplayer gaming with AI-powered matchmaking

### Team Structure (10 People)

**Leadership (2)**:

1. **Sarah Chen** - CEO & Co-founder | sarah@gragger.com | @sarahchen | @sarah
2. **Marcus Rodriguez** - CTO & Co-founder | marcus@gragger.com | @marcusr | @marcus

**Engineering (5)**: 3. **Priya Patel** - Lead Engineer | priya@gragger.com | @priyap | @priya 4. **James Wilson** - Senior Game Developer | james@gragger.com | @jameswilson | @james 5. **Alex Kim** - Backend Engineer | alex@gragger.com | @alexkim | @alex 6. **Jordan Lee** - DevOps Engineer | jordan@gragger.com | @jordanlee | @jordan 7. **Taylor Morgan** - Junior Engineer | taylor@gragger.com | @taylormorgan | @taylor

**Product & Design (2)**: 8. **Emily Thompson** - Product Designer | emily@gragger.com | @emilyt | @emily 9. **Chris Anderson** - Product Manager | chris@gragger.com | @chrisanderson | @chris

**Community (1)**: 10. **Maya Patel** - Community Manager | maya@gragger.com | @mayapatel | @maya

**Automated Systems**:

- **Dependabot** - Dependency Management Bot | Creates ~30% of all PRs

### GitHub Organization

```
github.com/gragger/
├── gragger-game/          # Unity game client (C#)
├── gragger-server/        # Backend services (Node.js/TypeScript)
├── gragger-matchmaking/   # Matchmaking engine (Go)
├── gragger-infra/         # Infrastructure as code (Terraform)
└── gragger-docs/          # Documentation (Markdown)
```

### Slack Workspace

- `#general` - Company-wide announcements, celebrations
- `#engineering` - Technical discussions, architecture
- `#game-dev` - Game development, Unity, gameplay
- `#backend` - Backend services, APIs, databases
- `#product` - Product planning, user feedback
- `#design` - Design discussions, mockups
- `#community` - Player feedback, community management
- `#random` - Casual chat, memes, gaming
- `#watercooler` - Social, non-work conversations

---

## 4-Stage Generation Strategy

### Overview

The 4-stage strategy creates natural relationship chains while maintaining appropriate category boundaries:

**Stage Distribution**:

- **Foundation (40%)**: Standalone data, NO context
- **Connection (20%)**: First-level links with filtered context by category
- **Integration (20%)**: Deep links with richer context
- **Synthesis (20%)**: Complex chains with full context

**Category Rules**:

- **Work items ONLY link to work items** (prevents "watching movie" → GitHub issue)
- **Casual items CAN link to other casual items** (allows "played game" Slack → "played game" call)
- **Work-adjacent can bridge both contexts** (celebrations can reference work)

### Stage 1: Foundation (40%)

**Goal**: Create base data with NO cross-references

```typescript
async function generateFoundation(config: Config): Promise<FoundationData> {
  const github = await generateGitHubData({
    context: null,
    count: config.githubIssues,
  });

  const slack = await generateSlackData({
    context: null,
    count: Math.floor(config.slackMessages * 0.4),
    categories: {
      work: 0.5, // 50% work-related
      workAdjacent: 0.3, // 30% work-adjacent
      casual: 0.2, // 20% casual/personal
    },
  });

  const notion = await generateNotionData({
    context: null,
    count: Math.floor(config.notionPages * 0.4),
    categories: {
      work: 0.7, // 70% work docs
      personal: 0.3, // 30% personal notes
    },
  });

  const fathom = await generateFathomData({
    context: null,
    count: Math.floor(config.fathomMeetings * 0.4),
    types: {
      work: 0.8, // 80% work meetings
      social: 0.2, // 20% social/coffee chats
    },
  });

  return { github, slack, notion, fathom };
}
```

### Stage 2: Connection (20%)

**Goal**: Create data that references Foundation items with **filtered context by category**

```typescript
async function generateConnection(
  foundationData: FoundationData,
  config: Config
): Promise<ConnectionData> {
  // BUILD SEPARATE CONTEXTS BY CATEGORY

  // Work context: ONLY work-related items
  const workContext = {
    githubIssues: foundationData.github.issues,
    githubPRs: foundationData.github.prs,
    workMeetings: foundationData.fathom.filter((m) => m.type === "work"),
    workNotion: foundationData.notion.filter((p) => p.category === "work"),
    workSlack: foundationData.slack.filter((m) => m.category === "work-related"),
  };

  // Casual context: ONLY casual/personal items
  const casualContext = {
    casualMeetings: foundationData.fathom.filter((m) => m.type === "social"),
    casualNotion: foundationData.notion.filter((p) => p.category === "personal"),
    casualSlack: foundationData.slack.filter((m) => m.category === "casual"),
  };

  // Generate work-related Slack (reference work items only)
  const workSlackWithRefs = await generateSlackData({
    context: workContext,
    count: Math.floor(config.slackMessages * 0.1),
    category: "work-related",
    referenceTypes: ["github_issue", "github_pr", "work_meeting"],
  });

  // Generate casual Slack (reference casual items only)
  const casualSlackWithRefs = await generateSlackData({
    context: casualContext,
    count: Math.floor(config.slackMessages * 0.05),
    category: "casual",
    referenceTypes: ["casual_meeting", "casual_slack"],
  });

  return { slack: [...workSlackWithRefs, ...casualSlackWithRefs], ... };
}
```

**Important Nuance: Mixed Content in Work Meetings**

Work meetings are primarily work-focused but can have casual mentions (realistic):

```typescript
const workMeetingContext = {
  githubIssues: foundationData.github.issues,
  workSlack: foundationData.slack.filter((m) => m.category === "work-related"),
  casualSlackForMentions: foundationData.slack.filter(
    (m) => m.category === "casual"
  ),
};

const workMeeting = await generateFathomData({
  context: workMeetingContext,
  type: "work",
  allowCasualMentions: true,
  casualMentionProbability: 0.2, // 20% chance
});
```

**Probability Guidelines**:

| Meeting Type   | Work References | Casual References       |
| -------------- | --------------- | ----------------------- |
| Work Standup   | 80-90%          | 10-20% (brief mentions) |
| Work Deep Dive | 95-100%         | 0-5%                    |
| Coffee Chat    | 0-10%           | 90-100%                 |
| Team Retro     | 60-70%          | 30-40%                  |

### Stage 3: Integration (20%)

**Goal**: Create data that references Foundation AND Connection items, building chains

```typescript
async function generateIntegration(
  foundationData: FoundationData,
  connectionData: ConnectionData,
  config: Config
): Promise<IntegrationData> {
  // BUILD RICHER CONTEXTS from both stages (separated by category)
  const richWorkContext = {
    githubIssues: foundationData.github.issues,
    githubPRs: foundationData.github.prs,
    slackWithRefs: connectionData.slack.filter(
      (m) => m.category === "work-related"
    ),
    notionWithRefs: connectionData.notion,
  };

  const richCasualContext = {
    casualSlack: [
      ...foundationData.slack.filter((m) => m.category === "casual"),
      ...connectionData.slack.filter((m) => m.category === "casual"),
    ],
    casualMeetings: [
      ...foundationData.fathom.filter((m) => m.type === "social"),
    ],
  };

  const workChains = await generateDeepLinks(richWorkContext, config);
  const casualChains = await generateCasualChains(richCasualContext, config);

  return { ...workChains, ...casualChains };
}
```

### Stage 4: Synthesis (20%)

**Goal**: Create data with full context, enabling complex multi-hop relationships

```typescript
async function generateSynthesis(
  foundationData: FoundationData,
  connectionData: ConnectionData,
  integrationData: IntegrationData,
  config: Config
): Promise<SynthesisData> {
  // BUILD FULL CONTEXTS from all stages (separated by category)
  const fullWorkContext = {
    allGitHub: [...foundationData.github.issues, ...connectionData.prs],
    allWorkSlack: [
      ...foundationData.slack.filter((m) => m.category === "work-related"),
      ...connectionData.slack.filter((m) => m.category === "work-related"),
      ...integrationData.slack.filter((m) => m.category === "work-related"),
    ],
    allNotion: [...foundationData.notion, ...connectionData.notion],
  };

  const workSynthesis = await generateComplexChains(fullWorkContext, config);
  return workSynthesis;
}
```

---

## Data Examples

### Example 1: Work-Related Data Chain

**Foundation Stage**:

```json
{
  "id": "issue_47",
  "number": 47,
  "title": "Matchmaking timeout causing player disconnects",
  "body": "Players reporting frequent disconnects. Timeout set too aggressively at 5s.",
  "author": "priyap",
  "created_at": "2024-01-15T09:23:00Z",
  "labels": ["bug", "matchmaking", "p1"],
  "category": "work"
}
```

**Connection Stage**:

```json
{
  "id": "slack_msg_234",
  "channel": "engineering",
  "user": "priya",
  "text": "Looking into matchmaking timeout issue https://github.com/gragger/gragger-matchmaking/issues/47",
  "timestamp": "2024-01-15T15:30:00Z",
  "category": "work-related",
  "references": [{ "type": "github_issue", "id": "issue_47" }]
}
```

**Integration Stage**:

```json
{
  "id": "notion_page_45",
  "title": "Matchmaking Timeout Investigation",
  "type": "technical_spec",
  "category": "work",
  "content": "# Problem\nPlayers experiencing disconnects (Issue #47)...",
  "references": [
    { "type": "github_issue", "id": "issue_47" },
    { "type": "github_pr", "id": "pr_89" },
    { "type": "slack_message", "id": "slack_msg_234" }
  ]
}
```

**Synthesis Stage**:

```json
{
  "id": "meeting_18",
  "title": "Sprint 5 Retrospective",
  "type": "work",
  "summary": "Reviewed sprint successes including matchmaking timeout fix.",
  "references": [
    { "type": "github_issue", "id": "issue_47" },
    { "type": "github_pr", "id": "pr_89" },
    { "type": "notion_page", "id": "notion_page_45" }
  ]
}
```

**Relationship Graph**:

```
Issue #47 ──┬──> Slack msg
            ├──> PR #89
            └──> Meeting #12
                     │
                     ├──> Notion doc
                     └──> Retrospective
```

### Example 2: Casual Data Chain

**Foundation Stage**:

```json
{
  "id": "slack_msg_567",
  "channel": "random",
  "user": "james",
  "text": "Just finished Baldur's Gate 3 - absolutely incredible game!",
  "timestamp": "2024-01-15T20:30:00Z",
  "category": "casual"
}
```

**Connection Stage**:

```json
{
  "id": "slack_msg_568",
  "channel": "random",
  "user": "taylor",
  "text": "Yes! I'm about 40 hours in. We should compare notes!",
  "timestamp": "2024-01-15T20:32:00Z",
  "category": "casual",
  "thread_ts": "slack_msg_567",
  "references": [{ "type": "slack_message", "id": "slack_msg_567" }]
}
```

**Integration Stage**:

```json
{
  "id": "notion_page_78",
  "title": "Gaming Recommendations 2024",
  "type": "personal_note",
  "category": "personal",
  "content": "# Games to Play\n\n## Baldur's Gate 3\nJames recommended this...",
  "references": [
    { "type": "slack_message", "id": "slack_msg_567" },
    { "type": "fathom_meeting", "id": "meeting_15" }
  ]
}
```

**Key Characteristics**:

- ✅ Casual items CAN reference other casual items
- ✅ Forms natural conversation chains
- ✅ Never links to work items (GitHub issues, work PRs)

---

## Volume Configuration

### Simple Configuration

**Only one setting needed**: Number of days

```bash
# .env
TIMELINE_DAYS=30    # Generate 30 days of data
```

**Fixed rates** (not configurable):

- Slack: ~100 messages/day (50 work, 30 work-adjacent, 20 casual)
- GitHub Issues: ~1.7/day (50/month)
- GitHub PRs: ~1.7/day (50/month, includes Dependabot)
- Notion Pages: ~2/day (60/month, 70% work, 30% personal)
- Fathom Meetings: ~0.7/day (20/month, 80% work, 20% social)

### Preset Configurations

#### Small (30 days)

```bash
TIMELINE_DAYS=30
```

- **Slack**: 3,000 messages
- **GitHub Issues**: 50
- **GitHub PRs**: 50 (35 human + 15 dependabot)
- **Notion Pages**: 60 (42 work + 18 personal)
- **Fathom Meetings**: 20 (16 work + 4 social)
- **Total**: ~3,180 records

#### Medium (180 days)

```bash
TIMELINE_DAYS=180
```

- **Slack**: 18,000 messages
- **GitHub Issues**: 300
- **GitHub PRs**: 300
- **Notion Pages**: 360
- **Fathom Meetings**: 120
- **Total**: ~19,080 records

#### Large (365 days)

```bash
TIMELINE_DAYS=365
```

- **Slack**: 36,500 messages
- **GitHub Issues**: 600
- **GitHub PRs**: 600
- **Notion Pages**: 720
- **Fathom Meetings**: 240
- **Total**: ~38,660 records

---

## Implementation Guide

### Package Structure

```
packages/mock-data-generator/
├── .env
├── .env.example
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main orchestrator
│   ├── config.ts             # Configuration
│   ├── stages/
│   │   ├── foundation.ts     # Stage 1: Standalone generation
│   │   ├── connection.ts     # Stage 2: First-level links
│   │   ├── integration.ts    # Stage 3: Deep links
│   │   └── synthesis.ts      # Stage 4: Complex chains
│   ├── generators/
│   │   ├── slack.ts          # Slack generator
│   │   ├── github.ts         # GitHub generator
│   │   ├── notion.ts         # Notion generator
│   │   └── fathom.ts         # Fathom generator
│   ├── context/
│   │   ├── builder.ts        # Context building
│   │   └── filter.ts         # Context filtering by category
│   └── utils/
│       ├── dates.ts          # Date utilities
│       └── random.ts         # Random selection
└── output/
    ├── foundation/
    ├── connection/
    ├── integration/
    ├── synthesis/
    └── combined/
```

### Configuration (.env)

```bash
# API Keys
OPENAI_API_KEY=sk-...

# Volume Configuration
TIMELINE_DAYS=30              # Number of days to generate

# Generation Parameters
TEMPERATURE=0.8
BATCH_SIZE=20
MAX_RETRIES=3
RATE_LIMIT_DELAY=1000
```

### Quick Start

```bash
# Setup
mkdir -p packages/mock-data-generator
cd packages/mock-data-generator
pnpm init
pnpm add openai typescript @types/node tsx dotenv

# Create structure
mkdir -p src/{stages,generators,context,utils}
mkdir -p output/{foundation,connection,integration,synthesis,combined}

# Generate data
pnpm run generate:small    # 30 days
pnpm run generate:medium   # 180 days
pnpm run generate:large    # 365 days
```

### Main Orchestrator

```typescript
// src/index.ts
import { FoundationGenerator } from "./stages/foundation";
import { ConnectionGenerator } from "./stages/connection";
import { IntegrationGenerator } from "./stages/integration";
import { SynthesisGenerator } from "./stages/synthesis";
import { ContextBuilder } from "./context/builder";

class MockDataGenerator {
  async generate(config: Config): Promise<void> {
    console.log(`📊 Generating ${config.timelineDays} days of data`);

    // Stage 1: Foundation (40%)
    const foundation = await new FoundationGenerator(config).generate();

    // Stage 2: Connection (20%)
    const contexts = ContextBuilder.buildContextsByCategory(foundation);
    const connection = await new ConnectionGenerator(config).generate(contexts);

    // Stage 3: Integration (20%)
    const richContexts = ContextBuilder.buildRichContexts(
      foundation,
      connection
    );
    const integration = await new IntegrationGenerator(config).generate(
      richContexts
    );

    // Stage 4: Synthesis (20%)
    const fullContexts = ContextBuilder.buildFullContexts(
      foundation,
      connection,
      integration
    );
    const synthesis = await new SynthesisGenerator(config).generate(
      fullContexts
    );

    // Combine and save
    const combined = this.combineAllStages(
      foundation,
      connection,
      integration,
      synthesis
    );
    await this.saveCombined(combined);

    console.log("✅ Generation complete!");
  }
}
```

### Context Builder

```typescript
// src/context/builder.ts
export class ContextBuilder {
  static buildContextsByCategory(foundationData: FoundationData) {
    return {
      work: {
        githubIssues: foundationData.github.issues,
        githubPRs: foundationData.github.prs,
        workMeetings: foundationData.fathom.filter((m) => m.type === "work"),
        workNotion: foundationData.notion.filter((p) => p.category === "work"),
        workSlack: foundationData.slack.filter(
          (m) => m.category === "work-related"
        ),
      },
      casual: {
        casualMeetings: foundationData.fathom.filter(
          (m) => m.type === "social"
        ),
        casualNotion: foundationData.notion.filter(
          (p) => p.category === "personal"
        ),
        casualSlack: foundationData.slack.filter(
          (m) => m.category === "casual"
        ),
      },
    };
  }
}
```

---

## Type Compatibility

**Important**: All generated mock data must match the exact types used in the server package:

- **Slack**: Use types from `@slack/web-api` package (`MessageElement`, `Channel`, `Member`)
- **Notion**: Use types from [`packages/server/src/services/sources/notion/types.ts`](packages/server/src/services/sources/notion/types.ts:1)
- **GitHub**: Use types from [`packages/server/src/services/sources/github/types.ts`](packages/server/src/services/sources/github/types.ts:1)
- **Fathom**: Use types from [`packages/shared-util/types/fathom/index.ts`](packages/shared-util/types/fathom/index.ts:1)
- **Record Model**: Use [`packages/server/src/models/record.model.ts`](packages/server/src/models/record.model.ts:1) for unified storage

---

## Summary

This plan provides a **simple, category-aware approach** to generating realistic mock data:

✅ **10 human team members** (bot separate)  
✅ **Simple configuration**: Just set TIMELINE_DAYS  
✅ **Fixed rates**: ~100 Slack messages/day  
✅ **4-stage strategy**: Foundation → Connection → Integration → Synthesis  
✅ **Category-based linking**: Work→Work, Casual→Casual, Work-adjacent bridges both  
✅ **60% connected, 40% standalone** data mix  
✅ **Type-compatible**: Matches existing server types

**Version**: 10.0
