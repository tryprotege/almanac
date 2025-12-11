# Benchmarking Package - Implementation Plan

This document provides a complete implementation plan for the benchmarking package, which includes the mock-data-generator module following the specifications in [`docs/benchmark/MOCK_DATA_GENERATION_PLAN.md`](../../docs/benchmark/MOCK_DATA_GENERATION_PLAN.md).

## Package Structure

```
packages/benchmarking/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
├── src/
│   └── mock-data-generator/
│       ├── index.ts              # Main orchestrator
│       ├── config.ts             # Configuration loader
│       ├── types.ts              # Type definitions
│       ├── stages/
│       │   ├── foundation.ts     # Stage 1: Standalone generation
│       │   ├── connection.ts     # Stage 2: First-level links
│       │   ├── integration.ts    # Stage 3: Deep links
│       │   └── synthesis.ts      # Stage 4: Complex chains
│       ├── generators/
│       │   ├── slack.ts          # Slack message generator
│       │   ├── github.ts         # GitHub issue/PR generator
│       │   ├── notion.ts         # Notion page generator
│       │   └── fathom.ts         # Fathom meeting generator
│       ├── context/
│       │   ├── builder.ts        # Context building functions
│       │   └── filter.ts         # Context filtering by category
│       ├── utils/
│       │   ├── dates.ts          # Date utilities
│       │   ├── random.ts         # Random selection utilities
│       │   └── llm.ts            # LLM interaction utilities
│       └── data/
│           └── company.ts        # GRagger company data
└── output/
    ├── foundation/
    ├── connection/
    ├── integration/
    ├── synthesis/
    └── combined/
```

## File Contents

### 1. package.json

```json
{
  "name": "@ebee/benchmarking",
  "version": "0.1.0",
  "description": "Benchmarking tools for multi-source data integration",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "dev": "tsx src/mock-data-generator/index.ts",
    "build": "tsc",
    "generate:small": "tsx src/mock-data-generator/index.ts --days 30",
    "generate:medium": "tsx src/mock-data-generator/index.ts --days 180",
    "generate:large": "tsx src/mock-data-generator/index.ts --days 365",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "openai": "^4.73.0",
    "dotenv": "^16.4.7",
    "@slack/web-api": "^7.11.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.9.3"
  }
}
```

### 2. tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. .env.example

```bash
# API Keys
OPENAI_API_KEY=sk-...

# Volume Configuration
TIMELINE_DAYS=30              # Number of days to generate (30, 180, or 365)

# Generation Parameters
TEMPERATURE=0.8               # LLM temperature for variety
BATCH_SIZE=20                 # Number of items to generate per batch
MAX_RETRIES=3                 # Max retries for failed generations
RATE_LIMIT_DELAY=1000         # Delay between API calls (ms)

# Output Configuration
OUTPUT_DIR=./output           # Directory for generated data
```

### 4. .gitignore

```
node_modules/
dist/
.env
output/
*.log
```

### 5. README.md

````markdown
# Benchmarking Package

Tools for benchmarking the multi-source data integration system, including mock data generation.

## Mock Data Generator

Generates realistic synthetic data for benchmarking across multiple platforms (Slack, Notion, GitHub, Fathom).

### Quick Start

\`\`\`bash

# Install dependencies

pnpm install

# Copy environment file

cp .env.example .env

# Add your OpenAI API key to .env

# OPENAI_API_KEY=sk-...

# Generate data

pnpm run generate:small # 30 days (~3,180 records)
pnpm run generate:medium # 180 days (~19,080 records)
pnpm run generate:large # 365 days (~38,660 records)
\`\`\`

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
\`\`\`

### 6. src/mock-data-generator/types.ts

```typescript
// Import existing types from server package
import type {
  GitHubIssue,
  GitHubPullRequest,
  GitHubUser,
} from "../../../server/src/services/sources/github/types.js";
import type {
  NotionPage,
  NotionUser,
} from "../../../server/src/services/sources/notion/types.js";
import type {
  FathomMeeting,
  FathomUser,
} from "../../../shared-util/types/fathom/index.js";

// Slack types (using @slack/web-api)
export interface SlackMessage {
  type: "message";
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  category: "work-related" | "work-adjacent" | "casual";
  references?: Reference[];
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  created: number;
  creator: string;
  is_archived: boolean;
  is_general: boolean;
}

export interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  profile: {
    email: string;
    display_name: string;
    real_name: string;
  };
}

// Reference types for cross-linking
export interface Reference {
  type:
    | "github_issue"
    | "github_pr"
    | "slack_message"
    | "notion_page"
    | "fathom_meeting";
  id: string;
  url?: string;
}

// Category types
export type WorkCategory = "work-related" | "work-adjacent" | "casual";
export type NotionCategory = "work" | "personal";
export type MeetingType = "work" | "social";

// Configuration
export interface GeneratorConfig {
  timelineDays: number;
  temperature: number;
  batchSize: number;
  maxRetries: number;
  rateLimitDelay: number;
  outputDir: string;
}

// Volume calculations
export interface VolumeConfig {
  slackMessages: number;
  githubIssues: number;
  githubPRs: number;
  notionPages: number;
  fathomMeetings: number;
}

// Stage data structures
export interface FoundationData {
  github: {
    issues: GitHubIssue[];
    prs: GitHubPullRequest[];
    users: GitHubUser[];
  };
  slack: {
    messages: SlackMessage[];
    channels: SlackChannel[];
    users: SlackUser[];
  };
  notion: {
    pages: NotionPage[];
    users: NotionUser[];
  };
  fathom: {
    meetings: FathomMeeting[];
    users: FathomUser[];
  };
}

export interface ConnectionData {
  slack: SlackMessage[];
  notion: NotionPage[];
  fathom: FathomMeeting[];
}

export interface IntegrationData {
  slack: SlackMessage[];
  notion: NotionPage[];
  fathom: FathomMeeting[];
  github: {
    issues: GitHubIssue[];
    prs: GitHubPullRequest[];
  };
}

export interface SynthesisData {
  slack: SlackMessage[];
  notion: NotionPage[];
  fathom: FathomMeeting[];
  github: {
    issues: GitHubIssue[];
    prs: GitHubPullRequest[];
  };
}

// Context types for generation
export interface WorkContext {
  githubIssues: GitHubIssue[];
  githubPRs: GitHubPullRequest[];
  workMeetings: FathomMeeting[];
  workNotion: NotionPage[];
  workSlack: SlackMessage[];
}

export interface CasualContext {
  casualMeetings: FathomMeeting[];
  casualNotion: NotionPage[];
  casualSlack: SlackMessage[];
}

export interface GenerationContext {
  work: WorkContext;
  casual: CasualContext;
}
```
````

### 7. src/mock-data-generator/data/company.ts

```typescript
// GRagger company data
export const COMPANY = {
  name: "GRagger",
  industry: "Gaming & Interactive Entertainment",
  stage: "Early stage startup",
  mission:
    "Building next-generation multiplayer gaming with AI-powered matchmaking",
};

export const TEAM_MEMBERS = [
  {
    name: "Sarah Chen",
    role: "CEO & Co-founder",
    email: "sarah@gragger.com",
    github: "sarahchen",
    slack: "sarah",
    category: "leadership",
  },
  {
    name: "Marcus Rodriguez",
    role: "CTO & Co-founder",
    email: "marcus@gragger.com",
    github: "marcusr",
    slack: "marcus",
    category: "leadership",
  },
  {
    name: "Priya Patel",
    role: "Lead Engineer",
    email: "priya@gragger.com",
    github: "priyap",
    slack: "priya",
    category: "engineering",
  },
  {
    name: "James Wilson",
    role: "Senior Game Developer",
    email: "james@gragger.com",
    github: "jameswilson",
    slack: "james",
    category: "engineering",
  },
  {
    name: "Alex Kim",
    role: "Backend Engineer",
    email: "alex@gragger.com",
    github: "alexkim",
    slack: "alex",
    category: "engineering",
  },
  {
    name: "Jordan Lee",
    role: "DevOps Engineer",
    email: "jordan@gragger.com",
    github: "jordanlee",
    slack: "jordan",
    category: "engineering",
  },
  {
    name: "Taylor Morgan",
    role: "Junior Engineer",
    email: "taylor@gragger.com",
    github: "taylormorgan",
    slack: "taylor",
    category: "engineering",
  },
  {
    name: "Emily Thompson",
    role: "Product Designer",
    email: "emily@gragger.com",
    github: "emilyt",
    slack: "emily",
    category: "product",
  },
  {
    name: "Chris Anderson",
    role: "Product Manager",
    email: "chris@gragger.com",
    github: "chrisanderson",
    slack: "chris",
    category: "product",
  },
  {
    name: "Maya Patel",
    role: "Community Manager",
    email: "maya@gragger.com",
    github: "mayapatel",
    slack: "maya",
    category: "community",
  },
] as const;

export const BOTS = [
  {
    name: "Dependabot",
    github: "dependabot[bot]",
    type: "dependency_management",
  },
] as const;

export const GITHUB_REPOS = [
  {
    name: "gragger-game",
    description: "Unity game client (C#)",
    language: "C#",
    topics: ["unity", "game-development", "multiplayer"],
  },
  {
    name: "gragger-server",
    description: "Backend services (Node.js/TypeScript)",
    language: "TypeScript",
    topics: ["backend", "nodejs", "api"],
  },
  {
    name: "gragger-matchmaking",
    description: "Matchmaking engine (Go)",
    language: "Go",
    topics: ["matchmaking", "golang", "distributed-systems"],
  },
  {
    name: "gragger-infra",
    description: "Infrastructure as code (Terraform)",
    language: "HCL",
    topics: ["infrastructure", "terraform", "devops"],
  },
  {
    name: "gragger-docs",
    description: "Documentation (Markdown)",
    language: "Markdown",
    topics: ["documentation"],
  },
] as const;

export const SLACK_CHANNELS = [
  { name: "general", purpose: "Company-wide announcements, celebrations" },
  { name: "engineering", purpose: "Technical discussions, architecture" },
  { name: "game-dev", purpose: "Game development, Unity, gameplay" },
  { name: "backend", purpose: "Backend services, APIs, databases" },
  { name: "product", purpose: "Product planning, user feedback" },
  { name: "design", purpose: "Design discussions, mockups" },
  { name: "community", purpose: "Player feedback, community management" },
  { name: "random", purpose: "Casual chat, memes, gaming" },
  { name: "watercooler", purpose: "Social, non-work conversations" },
] as const;
```

### 8. src/mock-data-generator/utils/dates.ts

```typescript
/**
 * Date utility functions for generating realistic timestamps
 */

export function generateTimeline(days: number): Date[] {
  const dates: Date[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    dates.push(date);
  }

  return dates;
}

export function randomTimeInDay(date: Date): Date {
  const result = new Date(date);
  // Business hours: 9 AM - 6 PM
  const hour = 9 + Math.floor(Math.random() * 9);
  const minute = Math.floor(Math.random() * 60);
  const second = Math.floor(Math.random() * 60);

  result.setHours(hour, minute, second, 0);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600000);
}

export function formatISO(date: Date): string {
  return date.toISOString();
}

export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // Not Sunday or Saturday
}
```

### 9. src/mock-data-generator/utils/random.ts

```typescript
/**
 * Random selection utilities
 */

export function randomElement<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function randomElements<T>(array: readonly T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, array.length));
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function probability(chance: number): boolean {
  return Math.random() < chance;
}

export function weightedRandom<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }

  return items[items.length - 1];
}
```

### 10. src/mock-data-generator/utils/llm.ts

```typescript
import OpenAI from "openai";
import type { GeneratorConfig } from "../types.js";

let openaiClient: OpenAI | null = null;

export function initializeLLM(apiKey: string): void {
  openaiClient = new OpenAI({ apiKey });
}

export async function generateWithLLM(
  prompt: string,
  config: GeneratorConfig
): Promise<string> {
  if (!openaiClient) {
    throw new Error("LLM not initialized. Call initializeLLM first.");
  }

  const response = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: config.temperature,
    max_tokens: 2000,
  });

  return response.choices[0]?.message?.content || "";
}

export async function generateBatch(
  prompts: string[],
  config: GeneratorConfig
): Promise<string[]> {
  const results: string[] = [];

  for (const prompt of prompts) {
    try {
      const result = await generateWithLLM(prompt, config);
      results.push(result);

      // Rate limiting
      await new Promise((resolve) =>
        setTimeout(resolve, config.rateLimitDelay)
      );
    } catch (error) {
      console.error("Error generating with LLM:", error);
      results.push("");
    }
  }

  return results;
}
```

### 11. src/mock-data-generator/config.ts

```typescript
import dotenv from "dotenv";
import type { GeneratorConfig, VolumeConfig } from "./types.js";

dotenv.config();

export function loadConfig(): GeneratorConfig {
  const timelineDays = parseInt(process.env.TIMELINE_DAYS || "30", 10);

  return {
    timelineDays,
    temperature: parseFloat(process.env.TEMPERATURE || "0.8"),
    batchSize: parseInt(process.env.BATCH_SIZE || "20", 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || "3", 10),
    rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || "1000", 10),
    outputDir: process.env.OUTPUT_DIR || "./output",
  };
}

export function calculateVolumes(timelineDays: number): VolumeConfig {
  return {
    slackMessages: Math.floor(timelineDays * 100), // 100 messages/day
    githubIssues: Math.floor(timelineDays * 1.7), // ~50/month
    githubPRs: Math.floor(timelineDays * 1.7), // ~50/month
    notionPages: Math.floor(timelineDays * 2), // 2/day
    fathomMeetings: Math.floor(timelineDays * 0.7), // ~20/month
  };
}
```

### 12. src/mock-data-generator/context/filter.ts

```typescript
import type { FoundationData, WorkContext, CasualContext } from "../types.js";

/**
 * Filter context by category to prevent inappropriate cross-references
 */

export function buildWorkContext(foundation: FoundationData): WorkContext {
  return {
    githubIssues: foundation.github.issues,
    githubPRs: foundation.github.prs,
    workMeetings: foundation.fathom.meetings.filter(
      (m) =>
        m.title.toLowerCase().includes("standup") ||
        m.title.toLowerCase().includes("planning") ||
        m.title.toLowerCase().includes("review")
    ),
    workNotion: foundation.notion.pages.filter(
      (p) =>
        // Filter for work-related pages (technical specs, meeting notes, etc.)
        p.properties.Category?.select?.name === "work" || !p.properties.Category
    ),
    workSlack: foundation.slack.messages.filter(
      (m) => m.category === "work-related"
    ),
  };
}

export function buildCasualContext(foundation: FoundationData): CasualContext {
  return {
    casualMeetings: foundation.fathom.meetings.filter(
      (m) =>
        m.title.toLowerCase().includes("coffee") ||
        m.title.toLowerCase().includes("chat") ||
        m.title.toLowerCase().includes("social")
    ),
    casualNotion: foundation.notion.pages.filter(
      (p) => p.properties.Category?.select?.name === "personal"
    ),
    casualSlack: foundation.slack.messages.filter(
      (m) => m.category === "casual"
    ),
  };
}
```

### 13. src/mock-data-generator/context/builder.ts

```typescript
import type {
  FoundationData,
  ConnectionData,
  IntegrationData,
  GenerationContext,
} from "../types.js";
import { buildWorkContext, buildCasualContext } from "./filter.js";

/**
 * Build contexts for each generation stage
 */

export function buildFoundationContext(): null {
  // Foundation stage has no context
  return null;
}

export function buildConnectionContext(
  foundation: FoundationData
): GenerationContext {
  return {
    work: buildWorkContext(foundation),
    casual: buildCasualContext(foundation),
  };
}

export function buildIntegrationContext(
  foundation: FoundationData,
  connection: ConnectionData
): GenerationContext {
  // Merge foundation and connection data
  const workContext = buildWorkContext(foundation);
  const casualContext = buildCasualContext(foundation);

  return {
    work: {
      ...workContext,
      workSlack: [
        ...workContext.workSlack,
        ...connection.slack.filter((m) => m.category === "work-related"),
      ],
      workNotion: [...workContext.workNotion, ...connection.notion],
    },
    casual: {
      ...casualContext,
      casualSlack: [
        ...casualContext.casualSlack,
        ...connection.slack.filter((m) => m.category === "casual"),
      ],
    },
  };
}

export function buildSynthesisContext(
  foundation: FoundationData,
  connection: ConnectionData,
  integration: IntegrationData
): GenerationContext {
  // Merge all previous stages
  const workContext = buildWorkContext(foundation);
  const casualContext = buildCasualContext(foundation);

  return {
    work: {
      ...workContext,
      githubIssues: [...workContext.githubIssues, ...integration.github.issues],
      githubPRs: [...workContext.githubPRs, ...integration.github.prs],
      workSlack: [
        ...workContext.workSlack,
        ...connection.slack.filter((m) => m.category === "work-related"),
        ...integration.slack.filter((m) => m.category === "work-related"),
      ],
      workNotion: [
        ...workContext.workNotion,
        ...connection.notion,
        ...integration.notion,
      ],
    },
    casual: {
      ...casualContext,
      casualSlack: [
        ...casualContext.casualSlack,
        ...connection.slack.filter((m) => m.category === "casual"),
        ...integration.slack.filter((m) => m.category === "casual"),
      ],
    },
  };
}
```

### 14. src/mock-data-generator/generators/slack.ts

```typescript
import type {
  SlackMessage,
  SlackChannel,
  SlackUser,
  GeneratorConfig,
  Reference,
} from "../types.js";
import { TEAM_MEMBERS, SLACK_CHANNELS } from "../data/company.js";
import { randomElement, randomElements, probability } from "../utils/random.js";
import { randomTimeInDay } from "../utils/dates.js";

/**
 * Generate Slack messages (functional approach - no classes)
 */

export async function generateSlackMessages(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: any
): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];

  // TODO: Implement actual generation logic using LLM
  // This is a skeleton - actual implementation will use generateWithLLM

  return messages;
}

export function generateSlackChannels(): SlackChannel[] {
  return SLACK_CHANNELS.map((channel, index) => ({
    id: `C${String(index + 1).padStart(9, "0")}`,
    name: channel.name,
    is_channel: true,
    created: Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60, // 1 year ago
    creator: "U000000001", // Sarah Chen
    is_archived: false,
    is_general: channel.name === "general",
  }));
}

export function generateSlackUsers(): SlackUser[] {
  return TEAM_MEMBERS.map((member, index) => ({
    id: `U${String(index + 1).padStart(9, "0")}`,
    name: member.slack,
    real_name: member.name,
    profile: {
      email: member.email,
      display_name: member.slack,
      real_name: member.name,
    },
  }));
}
```

### 15. src/mock-data-generator/generators/github.ts

```typescript
import type {
  GitHubIssue,
  GitHubPullRequest,
  GitHubUser,
} from "../../../server/src/services/sources/github/types.js";
import type { GeneratorConfig } from "../types.js";
import { TEAM_MEMBERS, BOTS, GITHUB_REPOS } from "../data/company.js";

/**
 * Generate GitHub issues and pull requests (functional approach - no classes)
 */

export async function generateGitHubIssues(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: any
): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];

  // TODO: Implement actual generation logic using LLM

  return issues;
}

export async function generateGitHubPRs(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: any
): Promise<GitHubPullRequest[]> {
  const prs: GitHubPullRequest[] = [];

  // TODO: Implement actual generation logic using LLM
  // 30% should be from Dependabot

  return prs;
}

export function generateGitHubUsers(): GitHubUser[] {
  return TEAM_MEMBERS.map((member, index) => ({
    id: index + 1,
    login: member.github,
    node_id: `MDQ6VXNlcjEyMzQ1Njc4${index}`,
    avatar_url: `https://avatars.githubusercontent.com/u/${index + 1}?v=4`,
    html_url: `https://github.com/${member.github}`,
    type: "User",
    site_admin: false,
    name: member.name,
    email: member.email,
  }));
}
```

### 16. src/mock-data-generator/generators/notion.ts

```typescript
import type {
  NotionPage,
  NotionUser,
} from "../../../server/src/services/sources/notion/types.js";
import type { GeneratorConfig } from "../types.js";
import { TEAM_MEMBERS } from "../data/company.js";

/**
 * Generate Notion pages (functional approach - no classes)
 */

export async function generateNotionPages(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: any
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];

  // TODO: Implement actual generation logic using LLM
  // 70% work, 30% personal

  return pages;
}

export function generateNotionUsers(): NotionUser[] {
  return TEAM_MEMBERS.map((member, index) => ({
    object: "user",
    id: `notion-user-${index + 1}`,
    type: "person",
    name: member.name,
    avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`,
    person: {
      email: member.email,
    },
  }));
}
```

### 17. src/mock-data-generator/generators/fathom.ts

```typescript
import type {
  FathomMeeting,
  FathomUser,
} from "../../../shared-util/types/fathom/index.js";
import type { GeneratorConfig } from "../types.js";
import { TEAM_MEMBERS } from "../data/company.js";

/**
 * Generate Fathom meetings (functional approach - no classes)
 */

export async function generateFathomMeetings(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: any
): Promise<FathomMeeting[]> {
  const meetings: FathomMeeting[] = [];

  // TODO: Implement actual generation logic using LLM
  // 80% work, 20% social

  return meetings;
}

export function generateFathomUsers(): FathomUser[] {
  return TEAM_MEMBERS.map((member) => ({
    name: member.name,
    email: member.email,
    email_domain: "gragger.com",
    team: "GRagger",
  }));
}
```

### 18. src/mock-data-generator/stages/foundation.ts

```typescript
import type {
  FoundationData,
  GeneratorConfig,
  VolumeConfig,
} from "../types.js";
import { generateTimeline } from "../utils/dates.js";
import {
  generateSlackMessages,
  generateSlackChannels,
  generateSlackUsers,
} from "../generators/slack.js";
import {
  generateGitHubIssues,
  generateGitHubPRs,
  generateGitHubUsers,
} from "../generators/github.js";
import {
  generateNotionPages,
  generateNotionUsers,
} from "../generators/notion.js";
import {
  generateFathomMeetings,
  generateFathomUsers,
} from "../generators/fathom.js";

/**
 * Stage 1: Foundation - Generate standalone data with NO cross-references
 * Functional approach - no classes
 */

export async function generateFoundation(
  config: GeneratorConfig,
  volumes: VolumeConfig
): Promise<FoundationData> {
  console.log("📦 Stage 1: Foundation (40% of data)");

  const dates = generateTimeline(config.timelineDays);

  // Calculate 40% of volumes for foundation stage
  const foundationVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.4),
    githubIssues: Math.floor(volumes.githubIssues * 0.4),
    githubPRs: Math.floor(volumes.githubPRs * 0.4),
    notionPages: Math.floor(volumes.notionPages * 0.4),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.4),
  };

  // Generate users/channels first
  const slackUsers = generateSlackUsers();
  const slackChannels = generateSlackChannels();
  const githubUsers = generateGitHubUsers();
  const notionUsers = generateNotionUsers();
  const fathomUsers = generateFathomUsers();

  // Generate data with NO context
  const [slackMessages, githubIssues, githubPRs, notionPages, fathomMeetings] =
    await Promise.all([
      generateSlackMessages(foundationVolumes.slackMessages, dates, config),
      generateGitHubIssues(foundationVolumes.githubIssues, dates, config),
      generateGitHubPRs(foundationVolumes.githubPRs, dates, config),
      generateNotionPages(foundationVolumes.notionPages, dates, config),
      generateFathomMeetings(foundationVolumes.fathomMeetings, dates, config),
    ]);

  console.log(`✅ Generated ${slackMessages.length} Slack messages`);
  console.log(`✅ Generated ${githubIssues.length} GitHub issues`);
  console.log(`✅ Generated ${githubPRs.length} GitHub PRs`);
  console.log(`✅ Generated ${notionPages.length} Notion pages`);
  console.log(`✅ Generated ${fathomMeetings.length} Fathom meetings`);

  return {
    github: {
      issues: githubIssues,
      prs: githubPRs,
      users: githubUsers,
    },
    slack: {
      messages: slackMessages,
      channels: slackChannels,
      users: slackUsers,
    },
    notion: {
      pages: notionPages,
      users: notionUsers,
    },
    fathom: {
      meetings: fathomMeetings,
      users: fathomUsers,
    },
  };
}
```

### 19. src/mock-data-generator/stages/connection.ts

```typescript
import type {
  ConnectionData,
  FoundationData,
  GeneratorConfig,
  VolumeConfig,
  GenerationContext,
} from "../types.js";
import { generateTimeline } from "../utils/dates.js";
import { generateSlackMessages } from "../generators/slack.js";
import { generateNotionPages } from "../generators/notion.js";
import { generateFathomMeetings } from "../generators/fathom.js";

/**
 * Stage 2: Connection - Generate data with first-level links
 * Functional approach - no classes
 */

export async function generateConnection(
  foundation: FoundationData,
  context: GenerationContext,
  config: GeneratorConfig,
  volumes: VolumeConfig
): Promise<ConnectionData> {
  console.log("🔗 Stage 2: Connection (20% of data)");

  const dates = generateTimeline(config.timelineDays);

  // Calculate 20% of volumes for connection stage
  const connectionVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.2),
    notionPages: Math.floor(volumes.notionPages * 0.2),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
  };

  // Generate data WITH context (filtered by category)
  const [slackMessages, notionPages, fathomMeetings] = await Promise.all([
    generateSlackMessages(
      connectionVolumes.slackMessages,
      dates,
      config,
      context
    ),
    generateNotionPages(connectionVolumes.notionPages, dates, config, context),
    generateFathomMeetings(
      connectionVolumes.fathomMeetings,
      dates,
      config,
      context
    ),
  ]);

  console.log(`✅ Generated ${slackMessages.length} connected Slack messages`);
  console.log(`✅ Generated ${notionPages.length} connected Notion pages`);
  console.log(
    `✅ Generated ${fathomMeetings.length} connected Fathom meetings`
  );

  return {
    slack: slackMessages,
    notion: notionPages,
    fathom: fathomMeetings,
  };
}
```

### 20. src/mock-data-generator/stages/integration.ts

```typescript
import type {
  IntegrationData,
  FoundationData,
  ConnectionData,
  GeneratorConfig,
  VolumeConfig,
  GenerationContext,
} from "../types.js";
import { generateTimeline } from "../utils/dates.js";
import { generateSlackMessages } from "../generators/slack.js";
import {
  generateGitHubIssues,
  generateGitHubPRs,
} from "../generators/github.js";
import { generateNotionPages } from "../generators/notion.js";
import { generateFathomMeetings } from "../generators/fathom.js";

/**
 * Stage 3: Integration - Generate data with deep links
 * Functional approach - no classes
 */

export async function generateIntegration(
  foundation: FoundationData,
  connection: ConnectionData,
  context: GenerationContext,
  config: GeneratorConfig,
  volumes: VolumeConfig
): Promise<IntegrationData> {
  console.log("🔀 Stage 3: Integration (20% of data)");

  const dates = generateTimeline(config.timelineDays);

  // Calculate 20% of volumes for integration stage
  const integrationVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.2),
    githubIssues: Math.floor(volumes.githubIssues * 0.2),
    githubPRs: Math.floor(volumes.githubPRs * 0.2),
    notionPages: Math.floor(volumes.notionPages * 0.2),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
  };

  // Generate data with richer context
  const [slackMessages, githubIssues, githubPRs, notionPages, fathomMeetings] =
    await Promise.all([
      generateSlackMessages(
        integrationVolumes.slackMessages,
        dates,
        config,
        context
      ),
      generateGitHubIssues(
        integrationVolumes.githubIssues,
        dates,
        config,
        context
      ),
      generateGitHubPRs(integrationVolumes.githubPRs, dates, config, context),
      generateNotionPages(
        integrationVolumes.notionPages,
        dates,
        config,
        context
      ),
      generateFathomMeetings(
        integrationVolumes.fathomMeetings,
        dates,
        config,
        context
      ),
    ]);

  console.log(`✅ Generated ${slackMessages.length} integrated Slack messages`);
  console.log(`✅ Generated ${githubIssues.length} integrated GitHub issues`);
  console.log(`✅ Generated ${githubPRs.length} integrated GitHub PRs`);
  console.log(`✅ Generated ${notionPages.length} integrated Notion pages`);
  console.log(
    `✅ Generated ${fathomMeetings.length} integrated Fathom meetings`
  );

  return {
    slack: slackMessages,
    github: {
      issues: githubIssues,
      prs: githubPRs,
    },
    notion: notionPages,
    fathom: fathomMeetings,
  };
}
```

### 21. src/mock-data-generator/stages/synthesis.ts

```typescript
import type {
  SynthesisData,
  FoundationData,
  ConnectionData,
  IntegrationData,
  GeneratorConfig,
  VolumeConfig,
  GenerationContext,
} from "../types.js";
import { generateTimeline } from "../utils/dates.js";
import { generateSlackMessages } from "../generators/slack.js";
import {
  generateGitHubIssues,
  generateGitHubPRs,
} from "../generators/github.js";
import { generateNotionPages } from "../generators/notion.js";
import { generateFathomMeetings } from "../generators/fathom.js";

/**
 * Stage 4: Synthesis - Generate data with complex multi-hop relationships
 * Functional approach - no classes
 */

export async function generateSynthesis(
  foundation: FoundationData,
  connection: ConnectionData,
  integration: IntegrationData,
  context: GenerationContext,
  config: GeneratorConfig,
  volumes: VolumeConfig
): Promise<SynthesisData> {
  console.log("🎯 Stage 4: Synthesis (20% of data)");

  const dates = generateTimeline(config.timelineDays);

  // Calculate 20% of volumes for synthesis stage
  const synthesisVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.2),
    githubIssues: Math.floor(volumes.githubIssues * 0.2),
    githubPRs: Math.floor(volumes.githubPRs * 0.2),
    notionPages: Math.floor(volumes.notionPages * 0.2),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
  };

  // Generate data with full context
  const [slackMessages, githubIssues, githubPRs, notionPages, fathomMeetings] =
    await Promise.all([
      generateSlackMessages(
        synthesisVolumes.slackMessages,
        dates,
        config,
        context
      ),
      generateGitHubIssues(
        synthesisVolumes.githubIssues,
        dates,
        config,
        context
      ),
      generateGitHubPRs(synthesisVolumes.githubPRs, dates, config, context),
      generateNotionPages(synthesisVolumes.notionPages, dates, config, context),
      generateFathomMeetings(
        synthesisVolumes.fathomMeetings,
        dates,
        config,
        context
      ),
    ]);

  console.log(`✅ Generated ${slackMessages.length} synthesis Slack messages`);
  console.log(`✅ Generated ${githubIssues.length} synthesis GitHub issues`);
  console.log(`✅ Generated ${githubPRs.length} synthesis GitHub PRs`);
  console.log(`✅ Generated ${notionPages.length} synthesis Notion pages`);
  console.log(
    `✅ Generated ${fathomMeetings.length} synthesis Fathom meetings`
  );

  return {
    slack: slackMessages,
    github: {
      issues: githubIssues,
      prs: githubPRs,
    },
    notion: notionPages,
    fathom: fathomMeetings,
  };
}
```

### 22. src/mock-data-generator/index.ts

```typescript
import { loadConfig, calculateVolumes } from "./config.js";
import { initializeLLM } from "./utils/llm.js";
import { generateFoundation } from "./stages/foundation.js";
import { generateConnection } from "./stages/connection.js";
import { generateIntegration } from "./stages/integration.js";
import { generateSynthesis } from "./stages/synthesis.js";
import {
  buildConnectionContext,
  buildIntegrationContext,
  buildSynthesisContext,
} from "./context/builder.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Main orchestrator for mock data generation
 * Functional approach - no classes
 */

async function main() {
  console.log("🚀 Mock Data Generator");
  console.log("=".repeat(50));

  // Load configuration
  const config = loadConfig();
  const volumes = calculateVolumes(config.timelineDays);

  console.log(`📊 Configuration:`);
  console.log(`  Timeline: ${config.timelineDays} days`);
  console.log(`  Slack Messages: ${volumes.slackMessages}`);
  console.log(`  GitHub Issues: ${volumes.githubIssues}`);
  console.log(`  GitHub PRs: ${volumes.githubPRs}`);
  console.log(`  Notion Pages: ${volumes.notionPages}`);
  console.log(`  Fathom Meetings: ${volumes.fathomMeetings}`);
  console.log("=".repeat(50));

  // Initialize LLM
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }
  initializeLLM(apiKey);

  // Create output directories
  mkdirSync(join(config.outputDir, "foundation"), { recursive: true });
  mkdirSync(join(config.outputDir, "connection"), { recursive: true });
  mkdirSync(join(config.outputDir, "integration"), { recursive: true });
  mkdirSync(join(config.outputDir, "synthesis"), { recursive: true });
  mkdirSync(join(config.outputDir, "combined"), { recursive: true });

  // Stage 1: Foundation (40%)
  const foundation = await generateFoundation(config, volumes);
  writeFileSync(
    join(config.outputDir, "foundation", "data.json"),
    JSON.stringify(foundation, null, 2)
  );

  // Stage 2: Connection (20%)
  const connectionContext = buildConnectionContext(foundation);
  const connection = await generateConnection(
    foundation,
    connectionContext,
    config,
    volumes
  );
  writeFileSync(
    join(config.outputDir, "connection", "data.json"),
    JSON.stringify(connection, null, 2)
  );

  // Stage 3: Integration (20%)
  const integrationContext = buildIntegrationContext(foundation, connection);
  const integration = await generateIntegration(
    foundation,
    connection,
    integrationContext,
    config,
    volumes
  );
  writeFileSync(
    join(config.outputDir, "integration", "data.json"),
    JSON.stringify(integration, null, 2)
  );

  // Stage 4: Synthesis (20%)
  const synthesisContext = buildSynthesisContext(
    foundation,
    connection,
    integration
  );
  const synthesis = await generateSynthesis(
    foundation,
    connection,
    integration,
    synthesisContext,
    config,
    volumes
  );
  writeFileSync(
    join(config.outputDir, "synthesis", "data.json"),
    JSON.stringify(synthesis, null, 2)
  );

  // Combine all stages
  const combined = {
    github: {
      issues: [
        ...foundation.github.issues,
        ...integration.github.issues,
        ...synthesis.github.issues,
      ],
      prs: [
        ...foundation.github.prs,
        ...integration.github.prs,
        ...synthesis.github.prs,
      ],
      users: foundation.github.users,
    },
    slack: {
      messages: [
        ...foundation.slack.messages,
        ...connection.slack,
        ...integration.slack,
        ...synthesis.slack,
      ],
      channels: foundation.slack.channels,
      users: foundation.slack.users,
    },
    notion: {
      pages: [
        ...foundation.notion.pages,
        ...connection.notion,
        ...integration.notion,
        ...synthesis.notion,
      ],
      users: foundation.notion.users,
    },
    fathom: {
      meetings: [
        ...foundation.fathom.meetings,
        ...connection.fathom,
        ...integration.fathom,
        ...synthesis.fathom,
      ],
      users: foundation.fathom.users,
    },
  };

  writeFileSync(
    join(config.outputDir, "combined", "data.json"),
    JSON.stringify(combined, null, 2)
  );

  console.log("=".repeat(50));
  console.log("✅ Generation complete!");
  console.log(`📁 Output directory: ${config.outputDir}`);
  console.log(
    `📊 Total records: ${
      combined.github.issues.length +
      combined.github.prs.length +
      combined.slack.messages.length +
      combined.notion.pages.length +
      combined.fathom.meetings.length
    }`
  );
}

main().catch(console.error);
```

## Summary

This implementation plan provides a complete skeleton for the mock data generator within the benchmarking package at [`packages/benchmarking/src/mock-data-generator/`](packages/benchmarking/src/mock-data-generator/).

**Key Features:**

- ✅ Functional programming approach (no classes)
- ✅ Complete package structure with all configuration files
- ✅ Type definitions matching existing server types
- ✅ Utility functions for dates, random selection, and LLM interaction
- ✅ Context builder and filter functions for category-based linking
- ✅ Skeleton generator functions for each platform (Slack, GitHub, Notion, Fathom)
- ✅ Stage orchestration functions (Foundation → Connection → Integration → Synthesis)
- ✅ Main orchestrator with file output
- ✅ GRagger company data (team, repos, channels)

**Next Steps:**
Switch to Code mode to implement the actual LLM-based content generation logic in the generator functions.
