# Incremental Benchmark Data Generation Plan (Revised)

## Executive Summary

Currently, the benchmark data generator recreates all data from scratch on each run. This plan outlines a strategy to enable **incremental/augmented data generation** where:
- Running the script multiple times extends existing data rather than regenerating from scratch
- A **rich metadata file** provides semantic context (topics, themes, key events) instead of reading large data files
- LLM uses metadata as context to generate coherent new data
- Data is split by provider (slack/github/notion/fathom) for efficient access
- The 4-stage generation strategy is maintained for realistic relationships

## Current System Analysis

### How It Works Now
1. User sets `TIMELINE_DAYS=N` (e.g., 30 days)
2. Script generates timeline from "today - N days" to "today"
3. All data (Slack, GitHub, Notion, Fathom) is generated from scratch for this period
4. Output saved to `output/combined/data.json` and stage-specific files
5. Each run **overwrites** previous data

### Problems
- No way to extend data incrementally
- Running tomorrow regenerates all data including yesterday's
- No semantic understanding of what's been generated
- Reading large combined.json files (365 days) is inefficient
- Wastes LLM API calls regenerating the same data

## Revised Solution

### Core Insight: Tiered Metadata with Smart Pruning

Instead of reading large data files for context, we maintain **tiered metadata** with automatic pruning:

**The Challenge**: Metadata can grow indefinitely if we keep accumulating topics, events, and active items forever.

**The Solution**: Use a **rolling window** approach with **topic lifecycle management**:

1. **Recent Context (Last 14 days)**: Full detail - topics, events, active items
2. **Medium Context (15-60 days)**: Summarized - only active topics, major events
3. **Historical Context (60+ days)**: High-level summary only - archived separately
4. **Topic Lifecycle**: Topics are marked as active, dormant, or closed based on activity
5. **Size Limits**: Cap the number of items (max 20 active topics, 30 recent events, etc.)

The LLM primarily uses **recent context** to generate new data, with brief historical summary for continuity.

### 1. Rich Metadata Structure

**Location**: `output/metadata.json`

**Structure**:
```json
{
  "version": "2.0.0",
  "createdAt": "2025-01-15T10:00:00Z",
  "lastUpdatedAt": "2025-01-22T15:30:00Z",

  "timeline": {
    "start": "2024-12-16T00:00:00Z",
    "end": "2025-01-22T23:59:59Z",
    "totalDays": 37
  },

  "totalRecords": {
    "slackMessages": 3700,
    "githubIssues": 62,
    "githubPRs": 62,
    "notionPages": 74,
    "fathomMeetings": 25
  },

  "entities": {
    "slackUsers": [
      {
        "id": "U123",
        "name": "sarah",
        "real_name": "Sarah Chen",
        "role": "CEO",
        "activityLevel": "high",
        "primaryChannels": ["general", "product"]
      }
    ],
    "slackChannels": [
      {
        "id": "C123",
        "name": "engineering",
        "topic": "Technical discussions, architecture decisions",
        "memberCount": 7,
        "messageRate": 150
      }
    ],
    "githubUsers": [...],
    "githubRepositories": [
      {
        "name": "gragger-game",
        "language": "C#",
        "description": "Unity game client",
        "activeContributors": 5,
        "openIssues": 12,
        "openPRs": 3
      }
    ],
    "notionDatabases": [...],
    "fathomTeams": [...]
  },

  "semanticContext": {
    "recentContext": {
      "windowDays": 14,
      "windowStart": "2025-01-09T00:00:00Z",
      "windowEnd": "2025-01-22T23:59:59Z",

      "activeTopics": [
        {
          "name": "Player Onboarding Redesign",
          "category": "work",
          "firstMentioned": "2025-01-10T09:00:00Z",
          "lastMentioned": "2025-01-22T14:00:00Z",
          "status": "active",
          "mentionCount": 15,
          "relatedItems": {
            "githubIssues": [63],
            "githubPRs": [94],
            "notionPages": ["notion_page_67", "notion_page_68"],
            "slackChannels": ["product", "design"]
          },
          "summary": "New initiative to improve player onboarding. Design mockups completed, PR #94 in review for tutorial system."
        },
        {
          "name": "Team Gaming Sessions",
          "category": "casual",
          "firstMentioned": "2025-01-12T18:00:00Z",
          "lastMentioned": "2025-01-21T19:30:00Z",
          "status": "active",
          "mentionCount": 8,
          "relatedItems": {
            "slackChannels": ["random", "watercooler"],
            "meetings": [23]
          },
          "summary": "Weekly Friday gaming sessions continue. Last session played co-op indie games."
        }
      ],

      "recentEvents": [
        {
          "date": "2025-01-15T16:00:00Z",
          "title": "Reached 10K Players Milestone",
          "type": "milestone",
          "severity": "low",
          "description": "Celebration of reaching 10,000 active players",
          "relatedItems": {
            "slackMessages": ["slack_msg_1234"],
            "meetings": [20]
          }
        },
        {
          "date": "2025-01-18T14:00:00Z",
          "title": "Tutorial System PR Opened",
          "type": "development",
          "severity": "medium",
          "description": "Priya opened PR #94 for new player tutorial system",
          "relatedItems": {
            "githubPRs": [94]
          }
        }
      ],

      "activeItems": {
        "openIssues": [
          {
            "id": 63,
            "number": 63,
            "title": "Implement new player onboarding flow",
            "state": "open",
            "created_at": "2025-01-10T09:00:00Z",
            "assignee": "chris",
            "labels": ["feature", "product", "p2"],
            "lastActivity": "2025-01-20T11:00:00Z",
            "commentCount": 8
          }
        ],
        "openPRs": [
          {
            "id": 94,
            "number": 94,
            "title": "Add player tutorial system",
            "state": "open",
            "created_at": "2025-01-18T14:00:00Z",
            "author": "priya",
            "reviewers": ["marcus", "james"],
            "lastActivity": "2025-01-22T10:00:00Z"
          }
        ],
        "ongoingDiscussions": [
          {
            "channel": "product",
            "topic": "Should we add voice chat?",
            "participants": ["sarah", "chris", "emily"],
            "startDate": "2025-01-19T10:00:00Z",
            "messageCount": 23,
            "sentiment": "mixed"
          }
        ]
      }
    },

    "mediumContext": {
      "windowDays": 46,
      "windowStart": "2024-12-24T00:00:00Z",
      "windowEnd": "2025-01-08T23:59:59Z",

      "topics": [
        {
          "name": "Matchmaking Performance",
          "category": "work",
          "status": "dormant",
          "lastMentioned": "2025-01-05T15:30:00Z",
          "summary": "Performance optimization work completed. Timeout increased to 15s, retry logic improved. Performance improved by 40%. Now in monitoring phase."
        }
      ],

      "majorEvents": [
        {
          "date": "2025-01-05T10:00:00Z",
          "title": "Matchmaking Fix Released (v1.2.0)",
          "type": "release"
        },
        {
          "date": "2024-12-24T00:00:00Z",
          "title": "Holiday Break Start",
          "type": "team-event"
        }
      ]
    },

    "historicalSummary": {
      "windowDays": 60,
      "windowStart": "2024-11-01T00:00:00Z",
      "windowEnd": "2024-12-23T23:59:59Z",

      "summary": "Company launched initial beta. Major themes: performance optimization, UI improvements, community building. Key releases: v1.0.0 (Nov 15), v1.1.0 (Dec 10). Team established development workflows and communication patterns.",

      "closedTopics": [
        "Initial Beta Launch",
        "Development Workflow Setup",
        "Early Performance Issues"
      ],

      "milestones": [
        "v1.0.0 Beta Launch (Nov 15)",
        "First 1000 Players (Nov 28)",
        "v1.1.0 UI Overhaul (Dec 10)"
      ]
    },

    "sizeLimits": {
      "maxActiveTopics": 15,
      "maxRecentEvents": 20,
      "maxOpenIssues": 20,
      "maxOpenPRs": 20,
      "maxOngoingDiscussions": 10,
      "maxMediumTopics": 10,
      "maxMajorEvents": 15,
      "maxNotableReferences": 50,
      "recentWindowDays": 14,
      "mediumWindowDays": 46,
      "historicalWindowDays": 60
    },

    "referenceIndex": {
      "idCounters": {
        "githubIssues": 62,
        "githubPRs": 62,
        "notionPages": 74,
        "fathomMeetings": 25
      },
      "notableItems": {
        "githubIssues": [
          {
            "id": 47,
            "number": 47,
            "title": "Matchmaking timeout causing disconnects",
            "state": "closed",
            "closedAt": "2025-01-05T10:00:00Z",
            "significance": "major-bug-fix"
          }
        ],
        "githubPRs": [
          {
            "id": 89,
            "number": 89,
            "title": "Fix matchmaking timeout",
            "state": "merged",
            "mergedAt": "2025-01-05T10:00:00Z"
          }
        ],
        "activeThreads": [
          {
            "channel": "product",
            "ts": "1705737600.123456",
            "topic": "Voice chat discussion",
            "lastReply": "2025-01-22T10:00:00Z"
          }
        ]
      }
    },

    "historicalArchive": [
      {
        "generationRange": "gen_1",
        "dateRange": {
          "start": "2024-12-16T00:00:00Z",
          "end": "2025-01-15T23:59:59Z"
        },
        "summary": "Initial 30-day generation. Major themes: matchmaking performance, UI improvements, team gaming sessions.",
        "keyTopics": ["Matchmaking Performance", "UI Redesign", "Team Gaming"],
        "milestones": ["v1.2.0 Release", "10K Players"]
      }
    ],

    "patterns": {
      "peakActivityDays": ["Monday", "Tuesday", "Thursday"],
      "quietPeriods": ["weekends", "2024-12-24 to 2025-01-02"],
      "commonThreads": [
        "Performance optimization is recurring theme",
        "Team celebrates small wins frequently",
        "Design iterations happen in Notion before implementation"
      ],
      "teamDynamics": {
        "collaboration": "High cross-functional collaboration between eng/product/design",
        "communication": "Heavy Slack usage, meetings are focused and recorded",
        "development": "PR-driven development with code review culture"
      }
    }
  },

  "generations": [
    {
      "id": "gen_1",
      "timestamp": "2025-01-15T10:00:00Z",
      "timelineStart": "2024-12-16T00:00:00Z",
      "timelineEnd": "2025-01-15T23:59:59Z",
      "timelineDays": 30,
      "recordCounts": {
        "slackMessages": 3000,
        "githubIssues": 50,
        "githubPRs": 50,
        "notionPages": 60,
        "fathomMeetings": 20
      },
      "newTopics": ["Matchmaking Performance", "UI Redesign", "Team Gaming Sessions"],
      "newEvents": ["Matchmaking Timeout Bug", "Matchmaking Fix Released"],
      "outputFiles": {
        "slack": "output/generations/gen_1/slack.json",
        "github": "output/generations/gen_1/github.json",
        "notion": "output/generations/gen_1/notion.json",
        "fathom": "output/generations/gen_1/fathom.json"
      }
    },
    {
      "id": "gen_2",
      "timestamp": "2025-01-22T15:30:00Z",
      "timelineStart": "2025-01-16T00:00:00Z",
      "timelineEnd": "2025-01-22T23:59:59Z",
      "timelineDays": 7,
      "recordCounts": {
        "slackMessages": 700,
        "githubIssues": 12,
        "githubPRs": 12,
        "notionPages": 14,
        "fathomMeetings": 5
      },
      "newTopics": ["Player Onboarding Redesign"],
      "newEvents": ["Reached 10K Players Milestone"],
      "continuedTopics": ["Matchmaking Performance"],
      "outputFiles": {
        "slack": "output/generations/gen_2/slack.json",
        "github": "output/generations/gen_2/github.json",
        "notion": "output/generations/gen_2/notion.json",
        "fathom": "output/generations/gen_2/fathom.json"
      },
      "incrementalFrom": "gen_1"
    }
  ]
}
```

**Key Improvements**:
- **Tiered Context**: Recent (14d), Medium (15-60d), Historical (60+d) with decreasing detail
- **Smart Pruning**: Automatic size limits prevent unbounded growth
- **Topic Lifecycle**: Topics marked as active/dormant/closed, old ones archived
- **Rolling Windows**: Old data automatically summarized and moved to historical context
- **Bounded Size**: Metadata stays compact (~50-100KB) regardless of total data volume

### 2. File Structure: Split by Provider

#### Proposed Structure
```
output/
├── metadata.json                    # Rich semantic metadata
├── generations/
│   ├── gen_1/                       # Initial generation (30 days)
│   │   ├── slack.json               # All Slack data for gen_1
│   │   ├── github.json              # All GitHub data for gen_1
│   │   ├── notion.json              # All Notion data for gen_1
│   │   └── fathom.json              # All Fathom data for gen_1
│   ├── gen_2/                       # Incremental (7 new days)
│   │   ├── slack.json
│   │   ├── github.json
│   │   ├── notion.json
│   │   └── fathom.json
│   └── gen_3/
│       ├── slack.json
│       ├── github.json
│       ├── notion.json
│       └── fathom.json
└── current/                         # Symlinks to latest generation (optional)
    ├── slack.json -> ../generations/gen_3/slack.json
    ├── github.json -> ../generations/gen_3/github.json
    ├── notion.json -> ../generations/gen_3/notion.json
    └── fathom.json -> ../generations/gen_3/fathom.json
```

**Benefits**:
- Each provider's data is isolated and manageable
- Can load only specific providers when needed
- Easy to validate/test individual providers
- No need for stage-specific files (foundation/connection/etc.)
- Each generation is self-contained

**Provider File Structures**:

```typescript
// slack.json
{
  "users": [...],
  "channels": [...],
  "messages": [...]  // Flat array, all channels
}

// github.json
{
  "user": {...},
  "organizationMembers": [...],
  "repositories": [...],
  "issues": [...],
  "pullRequests": [...],
  "workflows": [...],
  "workflowRuns": [...],
  "releases": [...],
  "discussions": [...],
  "codeScanningAlerts": [...],
  "dependabotAlerts": [...]
}

// notion.json
{
  "users": [...],
  "databases": [...],
  "pages": [...],
  "blocks": {...}  // Map of pageId -> blocks
}

// fathom.json
{
  "teams": [...],
  "teamMembers": [...],
  "meetings": [...],
  "transcripts": [...],
  "summaries": [...]
}
```

### 3. Reference Index & ID Management

**Critical Addition**: To enable cross-generation references and prevent ID collisions, metadata includes a reference index:

```typescript
interface ReferenceIndex {
  // ID counters for sequential numbering
  idCounters: {
    githubIssues: number;      // Last used issue number
    githubPRs: number;          // Last used PR number
    notionPages: number;        // Last used page ID
    fathomMeetings: number;     // Last used meeting ID
  };

  // Notable items that might be referenced even when old
  notableItems: {
    githubIssues: Array<{
      id: number;
      number: number;
      title: string;
      state: 'open' | 'closed';
      closedAt?: string;
      significance: 'major-bug-fix' | 'feature-release' | 'critical-incident';
    }>;

    githubPRs: Array<{
      id: number;
      number: number;
      title: string;
      state: 'open' | 'merged' | 'closed';
      mergedAt?: string;
    }>;

    activeThreads: Array<{
      channel: string;
      ts: string;            // Slack thread timestamp
      topic: string;
      lastReply: string;
    }>;
  };
}
```

**Why Needed**:
1. **ID Continuity**: Ensure Issue #63 in gen_2 doesn't conflict with Issue #63 in gen_1
2. **Cross-Generation References**: New Slack message can reference old Issue #47 by keeping notable items
3. **Thread Continuity**: Slack threads can receive replies across generations

**Pruning Rules for Reference Index**:
- Keep last 50 notable issues (major bugs, features)
- Keep last 50 notable PRs (significant merges)
- Keep active threads from last 30 days
- Always keep ID counters (never reset)

**Usage in Generation**:
```typescript
// When generating new issues:
const startingId = metadata.referenceIndex.idCounters.githubIssues + 1;
const newIssues = await generateGitHubIssues(count, timeline, config, startingId);

// Update counter
metadata.referenceIndex.idCounters.githubIssues += newIssues.length;

// Mark significant issues as notable
const notableNewIssues = newIssues
  .filter(i => i.labels.includes('critical') || i.labels.includes('p0'))
  .map(i => ({
    id: i.id,
    number: i.number,
    title: i.title,
    state: i.state,
    significance: 'critical-incident'
  }));

metadata.referenceIndex.notableItems.githubIssues.push(...notableNewIssues);
```

### 4. Historical Archive (Instead of Re-summarization)

**Critical Change**: Instead of re-summarizing historical context repeatedly (which causes degradation), use **hierarchical archiving**:

```typescript
interface HistoricalArchive {
  generationRange: string;        // "gen_1" or "gen_1_to_5"
  dateRange: {
    start: string;
    end: string;
  };
  summary: string;                // ONE-TIME summary, never re-summarized
  keyTopics: string[];
  milestones: string[];
}
```

**Archiving Strategy**:
- Each old generation gets ONE archive entry
- Archives are NEVER re-summarized (prevents degradation)
- Keep max 20 archive entries
- If > 20, **merge oldest pairs** (gen_1 + gen_2 → gen_1_to_2)

**Example Evolution**:
```
Gen 5:  [gen_1, gen_2, gen_3, gen_4]  // 4 archives
Gen 10: [gen_1_to_2, gen_3, gen_4, gen_5, gen_6, gen_7, gen_8, gen_9]  // 8 archives
Gen 25: [gen_1_to_5, gen_6_to_10, gen_11, gen_12, ..., gen_24]  // ~19 archives
```

This preserves detail better than recursive summarization.

### 5. Metadata Pruning Strategy

After each generation, metadata is automatically pruned to maintain bounded size:

```typescript
async function pruneMetadata(metadata: Metadata): Promise<Metadata> {
  const now = new Date();
  const limits = metadata.semanticContext.sizeLimits;

  // 1. Update window boundaries
  const recentStart = new Date(now.getTime() - limits.recentWindowDays * 24 * 60 * 60 * 1000);
  const mediumStart = new Date(now.getTime() - limits.mediumWindowDays * 24 * 60 * 60 * 1000);
  const historicalStart = new Date(now.getTime() - limits.historicalWindowDays * 24 * 60 * 60 * 1000);

  // 2. Migrate topics between tiers
  const allTopics = [
    ...metadata.semanticContext.recentContext.activeTopics,
    ...metadata.semanticContext.mediumContext.topics
  ];

  // Recent topics (last 14 days, still actively mentioned)
  const recentTopics = allTopics
    .filter(t => new Date(t.lastMentioned) >= recentStart && t.status === 'active')
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, limits.maxActiveTopics);

  // Medium topics (14-60 days, or recently dormant)
  const mediumTopics = allTopics
    .filter(t => {
      const lastMention = new Date(t.lastMentioned);
      return lastMention >= mediumStart && lastMention < recentStart;
    })
    .map(t => ({
      name: t.name,
      category: t.category,
      status: 'dormant' as const,
      lastMentioned: t.lastMentioned,
      summary: t.summary
    }))
    .slice(0, limits.maxMediumTopics);

  // Historical topics (60+ days) - summarized and archived
  const historicalTopics = allTopics
    .filter(t => new Date(t.lastMentioned) < mediumStart)
    .map(t => t.name);

  // 3. Update metadata structure
  metadata.semanticContext.recentContext = {
    windowDays: limits.recentWindowDays,
    windowStart: recentStart.toISOString(),
    windowEnd: now.toISOString(),
    activeTopics: recentTopics,
    recentEvents: metadata.semanticContext.recentContext.recentEvents
      .filter(e => new Date(e.date) >= recentStart)
      .slice(-limits.maxRecentEvents),
    activeItems: await updateActiveItems(metadata)
  };

  metadata.semanticContext.mediumContext = {
    windowDays: limits.mediumWindowDays - limits.recentWindowDays,
    windowStart: mediumStart.toISOString(),
    windowEnd: recentStart.toISOString(),
    topics: mediumTopics,
    majorEvents: [
      ...metadata.semanticContext.mediumContext.majorEvents,
      ...metadata.semanticContext.recentContext.recentEvents
        .filter(e => new Date(e.date) < recentStart && new Date(e.date) >= mediumStart)
        .map(e => ({
          date: e.date,
          title: e.title,
          type: e.type
        }))
    ].slice(-limits.maxMajorEvents)
  };

  // 4. Update historical summary
  if (historicalTopics.length > 0) {
    const newHistoricalSummary = await generateHistoricalSummary(
      metadata.semanticContext.historicalSummary,
      historicalTopics,
      mediumTopics
    );
    metadata.semanticContext.historicalSummary = newHistoricalSummary;
  }

  return metadata;
}

async function updateActiveItems(metadata: Metadata) {
  // Only keep genuinely open items from recent window
  // This would query the latest generation's data to check current state
  return {
    openIssues: metadata.semanticContext.recentContext.activeItems.openIssues
      .slice(-metadata.semanticContext.sizeLimits.maxOpenIssues),
    openPRs: metadata.semanticContext.recentContext.activeItems.openPRs
      .slice(-metadata.semanticContext.sizeLimits.maxOpenPRs),
    ongoingDiscussions: metadata.semanticContext.recentContext.activeItems.ongoingDiscussions
      .slice(-metadata.semanticContext.sizeLimits.maxOngoingDiscussions)
  };
}

async function generateHistoricalSummary(
  currentSummary: any,
  newClosedTopics: string[],
  mediumTopicsMovingToHistory: any[]
): Promise<any> {
  // Use LLM to merge and summarize
  const prompt = `
Update the historical summary by incorporating these newly closed topics:
${newClosedTopics.join(', ')}

Current summary: ${currentSummary.summary}

Also include these recently completed topics:
${mediumTopicsMovingToHistory.map(t => `- ${t.name}: ${t.summary}`).join('\n')}

Generate a concise 2-3 sentence updated historical summary.
  `;

  const updatedSummary = await callLLM(prompt);

  return {
    ...currentSummary,
    summary: updatedSummary,
    closedTopics: [...currentSummary.closedTopics, ...newClosedTopics].slice(-20)
  };
}
```

**Pruning Rules**:
1. **Recent → Medium**: Topics not mentioned in 14 days move to medium tier
2. **Medium → Historical**: Topics not mentioned in 60 days get summarized into historical text
3. **Size Caps**: Each tier has max items, oldest/least relevant get dropped
4. **Active Items**: Only genuinely open issues/PRs/discussions are kept
5. **Events**: Recent events (14d) kept in full, older ones (15-60d) kept as title only

**Result**: Metadata size stays bounded at ~50-100KB regardless of months/years of data.

### 4. Active Items Synchronization

**Critical**: After generating new data, update active items to reflect what was closed/merged:

```typescript
async function synchronizeActiveItems(
  metadata: Metadata,
  newData: AllGeneratedData
): Promise<Metadata> {
  const recentContext = metadata.semanticContext.recentContext;

  // Remove issues that were closed in new data
  const closedIssueNumbers = newData.github.issues
    .filter(i => i.state === 'closed')
    .map(i => i.number);

  recentContext.activeItems.openIssues =
    recentContext.activeItems.openIssues.filter(
      existing => !closedIssueNumbers.includes(existing.number)
    );

  // Remove PRs that were merged/closed
  const closedPRNumbers = newData.github.pullRequests
    .filter(pr => pr.state !== 'open')
    .map(pr => pr.number);

  recentContext.activeItems.openPRs =
    recentContext.activeItems.openPRs.filter(
      existing => !closedPRNumbers.includes(existing.number)
    );

  // Add new open issues/PRs from this generation
  const newOpenIssues = newData.github.issues
    .filter(i => i.state === 'open')
    .map(i => ({
      id: i.id,
      number: i.number,
      title: i.title,
      state: i.state,
      created_at: i.created_at,
      assignee: i.assignee?.login || 'unassigned',
      labels: i.labels.map(l => l.name),
      lastActivity: i.updated_at,
      commentCount: i.comments
    }));

  recentContext.activeItems.openIssues.push(...newOpenIssues);

  return metadata;
}
```

### 5. Handling Related vs Unrelated Topics

The system naturally handles both continuations and new topics:

```typescript
async function extractSemanticContext(data: AllGeneratedData): Promise<SemanticContext> {
  const prompt = `
Analyze this new data and extract:
1. Topics that CONTINUE from recent context (reference existing issues, discussions, or themes)
2. COMPLETELY NEW topics introduced (unrelated to previous work)
3. Topics that are VARIATIONS/EVOLUTIONS of previous themes

Mark each topic with:
- "continued": References existing work
- "new": Completely unrelated to recent context
- "evolved": Natural evolution of previous topic

Data to analyze:
- ${data.slack.messages.length} Slack messages
- ${data.github.issues.length} GitHub issues
- ${data.github.pullRequests.length} GitHub PRs
- ${data.notion.pages.length} Notion pages
- ${data.fathom.meetings.length} Fathom meetings

Return structured JSON with topics categorized.
  `;

  const analysis = await callLLM(prompt, data);

  // Merge continued topics with existing ones
  // Add new topics as fresh entries
  // Link evolved topics to their predecessors

  return analysis;
}
```

**Example Scenarios**:

**Scenario 1: Natural Continuation**
- Existing topic: "Player Onboarding Redesign"
- New data: PR merged, issue closed, celebration in Slack
- Result: Topic updated with "status: completed", moved to medium tier

**Scenario 2: New Unrelated Topic**
- Existing topics: All about game development
- New data: Discussion about hiring, job postings, interviews
- Result: New topic "Team Hiring Q1 2025" added to recent context

**Scenario 3: Evolution**
- Existing topic: "Matchmaking Performance" (dormant)
- New data: New performance regression discovered
- Result: New topic "Matchmaking Performance v2" with reference to original

### 5. Incremental Generation Flow with Metadata Context

```typescript
async function generateIncremental(
  config: GeneratorConfig,
  volumes: VolumeConfig,
  timelineConfig: TimelineConfig,
  metadata: Metadata
): Promise<AllGeneratedData> {

  console.log(`📊 Incremental Generation for ${timelineConfig.days} new days`);

  // Extract semantic context from metadata (NO file reading!)
  const context = {
    topics: metadata.semanticContext.topics,
    keyEvents: metadata.semanticContext.keyEvents,
    activeItems: metadata.semanticContext.activeItems,
    patterns: metadata.semanticContext.patterns,
    entities: metadata.entities
  };

  // Prepare LLM context prompt
  const llmContext = buildLLMContextFromMetadata(context);

  /*
    LLM Context Example:
    ---
    You are continuing to generate data for GRagger, a gaming startup.

    Recent Topics:
    - Matchmaking Performance: Ongoing optimization work, performance improved 40%
    - Player Onboarding Redesign: New initiative, design phase completed

    Key Events:
    - 2025-01-15: Reached 10K players milestone (celebrated in #general)
    - 2025-01-05: Matchmaking fix released (v1.2.0)

    Active Work:
    - Issue #63: Implement new player onboarding flow (assigned to chris, 8 comments)
    - PR #94: Add player tutorial system (by priya, in review)
    - Discussion in #product: Should we add voice chat? (23 messages, mixed sentiment)

    Team Patterns:
    - Peak activity: Monday, Tuesday, Thursday
    - Heavy Slack usage in #engineering, #product
    - PR-driven development with code reviews

    Generate data for the next 7 days (2025-01-16 to 2025-01-22) that:
    1. Continues ongoing topics naturally
    2. May introduce 1-2 new topics
    3. References and progresses active items
    4. Follows established team patterns
    ---
  */

  // Generate using 4-stage strategy with metadata context
  const timeline = generateTimeline(timelineConfig);

  // Stage 1: Foundation (40%) - Standalone items
  const foundation = await generateFoundationWithContext(
    config,
    {
      slackMessages: Math.floor(volumes.slackMessages * 0.4),
      githubIssues: Math.floor(volumes.githubIssues * 0.4),
      githubPRs: Math.floor(volumes.githubPRs * 0.4),
      notionPages: Math.floor(volumes.notionPages * 0.4),
      fathomMeetings: Math.floor(volumes.fathomMeetings * 0.4),
    },
    timeline,
    llmContext  // LLM uses metadata context
  );

  // Stage 2: Connection (20%) - References within new data
  const connection = await generateConnection(
    foundation,
    buildConnectionContext(foundation),
    config,
    {
      slackMessages: Math.floor(volumes.slackMessages * 0.2),
      githubPRs: Math.floor(volumes.githubPRs * 0.2),
      notionPages: Math.floor(volumes.notionPages * 0.2),
      fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
    },
    llmContext
  );

  // Stage 3: Integration (20%) - Deeper links
  const integration = await generateIntegration(
    foundation,
    connection,
    config,
    {
      slackMessages: Math.floor(volumes.slackMessages * 0.2),
      githubIssues: Math.floor(volumes.githubIssues * 0.2),
      notionPages: Math.floor(volumes.notionPages * 0.2),
      fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
    },
    llmContext
  );

  // Stage 4: Synthesis (20%) - Complex chains
  const synthesis = await generateSynthesis(
    foundation,
    connection,
    integration,
    config,
    {
      slackMessages: Math.floor(volumes.slackMessages * 0.2),
      githubPRs: Math.floor(volumes.githubPRs * 0.2),
      notionPages: Math.floor(volumes.notionPages * 0.2),
      fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
    },
    llmContext
  );

  // Combine all stages
  const combined = combineAllStages(foundation, connection, integration, synthesis);

  return combined;
}

function buildLLMContextFromMetadata(semanticContext: SemanticContext): string {
  const { recentContext, mediumContext, historicalSummary, patterns } = semanticContext;

  // Build tiered context - focus on recent, brief medium, minimal historical
  return `
You are continuing to generate data for GRagger, a gaming startup.

## Recent Context (Last ${recentContext.windowDays} days) - PRIMARY FOCUS
### Active Topics
${recentContext.activeTopics.map(t =>
  `- ${t.name} (${t.category}): ${t.summary} [${t.mentionCount} mentions]`
).join('\n')}

### Recent Events
${recentContext.recentEvents.map(e =>
  `- ${e.date.split('T')[0]}: ${e.title} - ${e.description}`
).join('\n')}

### Active Work
**Open Issues:**
${recentContext.activeItems.openIssues.map(i =>
  `- Issue #${i.number}: ${i.title} (${i.assignee}, ${i.commentCount} comments)`
).join('\n')}

**Open PRs:**
${recentContext.activeItems.openPRs.map(pr =>
  `- PR #${pr.number}: ${pr.title} (by ${pr.author}, reviewers: ${pr.reviewers.join(', ')})`
).join('\n')}

**Ongoing Discussions:**
${recentContext.activeItems.ongoingDiscussions.map(d =>
  `- #${d.channel}: "${d.topic}" (${d.messageCount} messages, ${d.participants.join(', ')}, ${d.sentiment})`
).join('\n')}

## Medium Context (${mediumContext.windowDays} days prior) - BACKGROUND
### Recently Dormant Topics
${mediumContext.topics.map(t =>
  `- ${t.name}: ${t.summary}`
).join('\n')}

### Major Past Events
${mediumContext.majorEvents.map(e =>
  `- ${e.date.split('T')[0]}: ${e.title}`
).join('\n')}

## Historical Summary (${historicalSummary.windowDays}+ days ago)
${historicalSummary.summary}

Key past milestones: ${historicalSummary.milestones.join(', ')}

## Team Patterns
- Peak activity: ${patterns.peakActivityDays.join(', ')}
- Communication style: ${patterns.teamDynamics.communication}
- Development approach: ${patterns.teamDynamics.development}

---

**Your task**: Generate new data that:
1. **Primarily continues recent active topics** (progresses open issues/PRs, ongoing discussions)
2. **May reactivate dormant topics** if contextually appropriate
3. **Can introduce 1-2 completely new topics** (unrelated to above)
4. **Follows established team patterns** (communication style, peak activity days)
5. **Maintains realistic continuity** with the narrative

Focus on recent context, but be aware of medium and historical background for realism.
  `.trim();
}
```

### 6. Metadata Update After Generation

After generating new data, update and prune metadata:

```typescript
async function updateMetadataAfterGeneration(
  metadata: Metadata,
  newData: AllGeneratedData,
  generationId: string,
  timelineConfig: TimelineConfig
): Promise<Metadata> {

  // Extract semantic information from new data using LLM
  const newSemanticContext = await extractSemanticContext(newData);

  // Merge with existing context
  metadata.semanticContext.topics = mergeTopics(
    metadata.semanticContext.topics,
    newSemanticContext.topics
  );

  metadata.semanticContext.keyEvents.push(...newSemanticContext.keyEvents);

  metadata.semanticContext.activeItems = updateActiveItems(
    metadata.semanticContext.activeItems,
    newData
  );

  // Update generation record
  metadata.generations.push({
    id: generationId,
    timestamp: new Date().toISOString(),
    timelineStart: timelineConfig.startDate.toISOString(),
    timelineEnd: timelineConfig.endDate.toISOString(),
    timelineDays: timelineConfig.days,
    recordCounts: {
      slackMessages: newData.slack.messages.length,
      githubIssues: newData.github.issues.length,
      githubPRs: newData.github.pullRequests.length,
      notionPages: newData.notion.pages.length,
      fathomMeetings: newData.fathom.meetings.length
    },
    newTopics: newSemanticContext.topics.map(t => t.name),
    newEvents: newSemanticContext.keyEvents.map(e => e.title),
    continuedTopics: findContinuedTopics(metadata.semanticContext.topics, newSemanticContext.topics),
    outputFiles: {
      slack: `output/generations/${generationId}/slack.json`,
      github: `output/generations/${generationId}/github.json`,
      notion: `output/generations/${generationId}/notion.json`,
      fathom: `output/generations/${generationId}/fathom.json`
    },
    incrementalFrom: metadata.generations[metadata.generations.length - 1]?.id
  });

  // Update totals
  metadata.totalRecords.slackMessages += newData.slack.messages.length;
  metadata.totalRecords.githubIssues += newData.github.issues.length;
  metadata.totalRecords.githubPRs += newData.github.pullRequests.length;
  metadata.totalRecords.notionPages += newData.notion.pages.length;
  metadata.totalRecords.fathomMeetings += newData.fathom.meetings.length;

  metadata.timeline.end = timelineConfig.endDate.toISOString();
  metadata.timeline.totalDays = Math.floor(
    (new Date(metadata.timeline.end).getTime() - new Date(metadata.timeline.start).getTime()) / (1000 * 60 * 60 * 24)
  );

  metadata.lastUpdatedAt = new Date().toISOString();

  // CRITICAL: Prune metadata to maintain bounded size
  metadata = await pruneMetadata(metadata);

  return metadata;
}

async function extractSemanticContext(data: AllGeneratedData): Promise<SemanticContext> {
  // Use LLM to analyze generated data and extract:
  // - New topics/themes
  // - Key events
  // - Ongoing discussions
  // - Patterns

  const prompt = `
Analyze the following data and extract:
1. Main topics/themes discussed (5-10 topics)
2. Key events (releases, incidents, milestones)
3. Ongoing discussions/work items
4. Communication patterns

Data summary:
- ${data.slack.messages.length} Slack messages
- ${data.github.issues.length} GitHub issues
- ${data.github.pullRequests.length} GitHub PRs
- ${data.notion.pages.length} Notion pages
- ${data.fathom.meetings.length} Fathom meetings

Return as structured JSON.
  `;

  // Call LLM to analyze and return structured semantic context
  const context = await analyzeWithLLM(prompt, data);

  return context;
}
```

### 7. Timeline Detection Logic

```typescript
interface TimelineConfig {
  mode: 'initial' | 'incremental';
  startDate: Date;
  endDate: Date;
  days: number;
}

function determineTimeline(
  requestedDays: number,
  metadata?: Metadata
): TimelineConfig {
  const now = new Date();
  now.setHours(23, 59, 59, 999); // End of today

  if (!metadata) {
    // Initial mode: Generate from scratch
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - requestedDays + 1);
    startDate.setHours(0, 0, 0, 0);

    return {
      mode: 'initial',
      startDate,
      endDate: now,
      days: requestedDays
    };
  }

  // Incremental mode: Extend from last end date
  const lastEndDate = new Date(metadata.timeline.end);
  const daysSinceLastRun = Math.floor(
    (now.getTime() - lastEndDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceLastRun <= 0) {
    console.log('⚠️  Data is up to date (last run was today)');
    return {
      mode: 'incremental',
      startDate: now,
      endDate: now,
      days: 0
    };
  }

  // Generate only new days
  const startDate = new Date(lastEndDate.getTime() + 1);
  startDate.setHours(0, 0, 0, 0);

  console.log(`📅 Extending timeline by ${daysSinceLastRun} days`);

  return {
    mode: 'incremental',
    startDate,
    endDate: now,
    days: daysSinceLastRun
  };
}
```

### 8. Main Orchestrator (Updated)

```typescript
// src/mock-data-generator/index.ts

async function main() {
  console.log('🚀 Mock Data Generator');
  console.log('='.repeat(50));

  // 1. Load configuration
  const config = loadConfig();

  // 2. Load or create metadata
  const metadata = loadMetadata();

  // 3. Determine timeline
  const timelineConfig = determineTimeline(config.timelineDays, metadata);

  if (timelineConfig.days === 0) {
    console.log('✅ Data is up to date. Nothing to generate.');
    return;
  }

  // 4. Calculate volumes for new period
  const volumes = calculateVolumes(timelineConfig.days);

  console.log(`📊 Mode: ${timelineConfig.mode}`);
  console.log(`📅 Timeline: ${timelineConfig.startDate.toISOString()} to ${timelineConfig.endDate.toISOString()}`);
  console.log(`📆 Days: ${timelineConfig.days}`);
  console.log(`📝 Volumes:`, volumes);
  console.log('='.repeat(50));

  // Initialize LLM
  initializeLLM(
    process.env.LLM_API_KEY!,
    process.env.LLM_BASE_URL!,
    config.concurrency
  );

  let newData: AllGeneratedData;
  let generationId: string;

  if (timelineConfig.mode === 'initial') {
    // Initial generation
    console.log('🆕 Initial generation mode');
    generationId = 'gen_1';

    newData = await generateFromScratch(config, volumes, timelineConfig);

    // Create initial metadata
    const initialMetadata = await createInitialMetadata(
      generationId,
      newData,
      timelineConfig
    );

    saveMetadata(initialMetadata);

  } else {
    // Incremental generation
    console.log('➕ Incremental generation mode');
    generationId = `gen_${metadata!.generations.length + 1}`;

    console.log('📖 Using metadata context (no file reading needed)');

    newData = await generateIncremental(
      config,
      volumes,
      timelineConfig,
      metadata!
    );

    // Update metadata
    const updatedMetadata = await updateMetadataAfterGeneration(
      metadata!,
      newData,
      generationId,
      timelineConfig
    );

    saveMetadata(updatedMetadata);
  }

  // Save data split by provider
  const genDir = join(config.outputDir, 'generations', generationId);
  mkdirSync(genDir, { recursive: true });

  writeFileSync(
    join(genDir, 'slack.json'),
    JSON.stringify({
      users: newData.slack.users,
      channels: newData.slack.channels,
      messages: Array.from(newData.slack.messages.values()).flat()
    }, null, 2)
  );

  writeFileSync(
    join(genDir, 'github.json'),
    JSON.stringify(newData.github, null, 2)
  );

  writeFileSync(
    join(genDir, 'notion.json'),
    JSON.stringify({
      users: newData.notion.users,
      databases: newData.notion.databases,
      pages: newData.notion.pages,
      blocks: Object.fromEntries(newData.notion.blocks)
    }, null, 2)
  );

  writeFileSync(
    join(genDir, 'fathom.json'),
    JSON.stringify(newData.fathom, null, 2)
  );

  console.log('='.repeat(50));
  console.log('✅ Generation complete!');
  console.log(`📁 Output: ${genDir}`);
  console.log(`📊 Records generated:`, {
    slackMessages: newData.slack.messages.size,
    githubIssues: newData.github.issues.length,
    githubPRs: newData.github.pullRequests.length,
    notionPages: newData.notion.pages.length,
    fathomMeetings: newData.fathom.meetings.length
  });
}

main().catch(console.error);
```

### 9. Status Command

```typescript
// src/mock-data-generator/status.ts

function showStatus() {
  const metadata = loadMetadata();

  if (!metadata) {
    console.log('❌ No metadata found.');
    console.log('💡 Run `pnpm run generate` to start initial generation.');
    return;
  }

  console.log('📊 Benchmark Data Generation Status');
  console.log('='.repeat(60));

  // Timeline
  console.log('📅 Timeline:');
  console.log(`  Start: ${metadata.timeline.start}`);
  console.log(`  End: ${metadata.timeline.end}`);
  console.log(`  Total Days: ${metadata.timeline.totalDays}`);
  console.log('');

  // Total Records
  console.log('📈 Total Records:');
  Object.entries(metadata.totalRecords).forEach(([key, value]) => {
    console.log(`  ${key}: ${value.toLocaleString()}`);
  });
  console.log('');

  // Entities
  console.log('👥 Entities:');
  console.log(`  Slack: ${metadata.entities.slackUsers.length} users, ${metadata.entities.slackChannels.length} channels`);
  console.log(`  GitHub: ${metadata.entities.githubUsers.length} users, ${metadata.entities.githubRepositories.length} repos`);
  console.log(`  Notion: ${metadata.entities.notionUsers.length} users, ${metadata.entities.notionDatabases.length} databases`);
  console.log(`  Fathom: ${metadata.entities.fathomTeams.length} teams, ${metadata.entities.fathomTeamMembers?.length || 0} members`);
  console.log('');

  // Active Topics
  console.log('🏷️  Active Topics:');
  metadata.semanticContext.topics.slice(0, 5).forEach(topic => {
    console.log(`  - ${topic.name} (${topic.category})`);
    console.log(`    ${topic.summary.substring(0, 80)}...`);
  });
  console.log('');

  // Recent Events
  console.log('🎯 Recent Key Events:');
  metadata.semanticContext.keyEvents.slice(-3).forEach(event => {
    console.log(`  - ${event.date.split('T')[0]}: ${event.title}`);
  });
  console.log('');

  // Active Work
  console.log('🔧 Active Work:');
  console.log(`  Open Issues: ${metadata.semanticContext.activeItems.openIssues.length}`);
  console.log(`  Open PRs: ${metadata.semanticContext.activeItems.openPRs.length}`);
  console.log(`  Ongoing Discussions: ${metadata.semanticContext.activeItems.ongoingDiscussions.length}`);
  console.log('');

  // Generations
  console.log('📦 Generations:');
  metadata.generations.forEach((gen, idx) => {
    const isLast = idx === metadata.generations.length - 1;
    console.log(`  ${isLast ? '→' : ' '} ${gen.id} (${gen.timestamp.split('T')[0]})`);
    console.log(`    ${gen.timelineDays} days, ${Object.values(gen.recordCounts).reduce((a, b) => a + b, 0)} records`);
    if (gen.newTopics.length > 0) {
      console.log(`    New: ${gen.newTopics.join(', ')}`);
    }
  });
  console.log('');

  // Status
  const now = new Date();
  const lastEnd = new Date(metadata.timeline.end);
  const daysSince = Math.floor((now.getTime() - lastEnd.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSince > 0) {
    console.log(`⏰ ${daysSince} day(s) since last generation`);
    console.log('💡 Run `pnpm run generate` to extend data');
  } else {
    console.log('✅ Data is up to date');
  }

  console.log('='.repeat(60));
}

showStatus();
```

### 10. Configuration

```bash
# .env

# LLM Configuration
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_CONCURRENCY=10

# Generation Configuration
TIMELINE_DAYS=30                    # Only used for initial generation
TEMPERATURE=0.8
BATCH_SIZE=20
MAX_RETRIES=3
RATE_LIMIT_DELAY=1000

# Incremental Mode Settings
FORCE_REGENERATE=false              # Set true to ignore metadata and start fresh
METADATA_FILE=output/metadata.json
OUTPUT_DIR=./output

# Metadata Pruning Settings
RECENT_WINDOW_DAYS=14               # Recent context window (full detail)
MEDIUM_WINDOW_DAYS=46               # Medium context window (summaries)
HISTORICAL_WINDOW_DAYS=60           # Historical context start
MAX_ACTIVE_TOPICS=15                # Max topics in recent context
MAX_MEDIUM_TOPICS=10                # Max topics in medium context
MAX_RECENT_EVENTS=20                # Max events in recent context
MAX_OPEN_ISSUES=20                  # Max open issues to track
MAX_OPEN_PRS=20                     # Max open PRs to track
MAX_ONGOING_DISCUSSIONS=10          # Max discussions to track

# Cleanup Settings (optional)
KEEP_GENERATIONS=10                 # Auto-delete old generations (0 = keep all)
```

### 11. CLI Commands

```json
{
  "scripts": {
    "generate": "tsx src/mock-data-generator/index.ts",
    "generate:status": "tsx src/mock-data-generator/status.ts",
    "generate:reset": "FORCE_REGENERATE=true tsx src/mock-data-generator/index.ts",

    "generate:small": "TIMELINE_DAYS=7 tsx src/mock-data-generator/index.ts",
    "generate:medium": "TIMELINE_DAYS=180 tsx src/mock-data-generator/index.ts",
    "generate:large": "TIMELINE_DAYS=365 tsx src/mock-data-generator/index.ts"
  }
}
```

**Usage**:
```bash
# Initial generation (30 days)
pnpm run generate:small

# Check status
pnpm run generate:status

# Wait a week, then extend
pnpm run generate
# → Automatically generates 7 new days

# Force regenerate from scratch
pnpm run generate:reset
```

### 12. Complete Flow Example

Here's how metadata evolves over time with pruning:

#### Day 1: Initial Generation (30 days)
```bash
pnpm run generate:small
```

**Metadata created**:
- Recent context: Empty (no prior data)
- Medium context: Empty
- Historical: Empty
- Total size: ~5KB

**Generation**: Creates 7 days of data from scratch

#### Day 8: First Incremental Run
```bash
pnpm run generate
```

**Metadata state BEFORE generation**:
- Recent context: 7 days of topics/events from initial run
- Size: ~15KB

**Generation process**:
1. Load metadata (15KB, instant)
2. Extract recent context for LLM prompt
3. Generate 1 new day of data (continues existing topics + maybe 1 new topic)
4. Extract semantic context from new data
5. Merge with existing metadata
6. **Prune**: Recent window is now 8 days, nothing to prune yet
7. Save metadata (18KB)

#### Day 22: Second Incremental Run (14 days later)
```bash
pnpm run generate
```

**Metadata state BEFORE generation**:
- Recent context: 14 days of topics (Days 8-21)
- Medium context: Empty
- Size: ~35KB

**Generation process**:
1. Load metadata (35KB)
2. Generate 14 new days
3. Extract semantic context
4. Merge
5. **Prune**:
   - Recent window: Last 14 days (Days 22-35)
   - Topics from Days 8-21 → Move to medium context
   - Dormant topics → Summarized
   - Events older than 14 days → Title only
6. Save metadata (~40KB)

**Result**:
- Recent: Days 22-35 (full detail)
- Medium: Days 8-21 (summarized)
- Historical: Days 1-7 (brief summary)

#### Day 90: Long-term Run (68 days later)
```bash
pnpm run generate
```

**Metadata state BEFORE generation**:
- Recent: Days 76-89 (full detail)
- Medium: Days 30-75 (summaries)
- Historical: Days 1-29 (brief text)
- Size: ~55KB

**Generation process**:
1. Load metadata (55KB - still small!)
2. Generate 68 new days
3. Extract semantic context
4. **Prune aggressively**:
   - Recent: Days 144-157 (last 14 days only)
   - Medium: Days 98-143 (top 10 topics, major events only)
   - Historical: Days 1-97 (re-summarized into 2-3 sentences)
   - Old topics: Closed topics from Days 1-97 archived
   - Size caps enforced: Max 15 active topics, 20 events, etc.
5. Save metadata (~60KB)

**Result**: Metadata size stabilizes at ~50-60KB even after months of data!

## Implementation Plan

### Phase 1: Metadata Foundation
**Goal**: Create metadata structure and I/O functions

- [ ] Define TypeScript types for rich metadata
- [ ] Implement `loadMetadata()` and `saveMetadata()`
- [ ] Create metadata versioning system
- [ ] Add metadata validation

**Files to create/modify**:
- `src/mock-data-generator/types.ts` (add metadata types)
- `src/mock-data-generator/utils/metadata.ts` (new file)

**Estimated time**: 2-3 hours

### Phase 2: Semantic Context Extraction & Pruning
**Goal**: Extract topics, events, patterns from generated data AND implement pruning

- [ ] Implement `extractSemanticContext()` using LLM
- [ ] Create topic detection and merging logic (continued vs new vs evolved)
- [ ] Implement event extraction
- [ ] Build active items tracker
- [ ] Pattern analysis
- [ ] **Implement `pruneMetadata()` function**
- [ ] **Implement topic lifecycle management (active → dormant → archived)**
- [ ] **Implement tiered context migration (recent → medium → historical)**
- [ ] **Implement size limit enforcement**

**Files to create/modify**:
- `src/mock-data-generator/utils/semantic.ts` (new file)
- `src/mock-data-generator/utils/pruning.ts` (new file)
- `src/mock-data-generator/utils/llm.ts` (update)

**Estimated time**: 6-8 hours (increased due to pruning complexity)

### Phase 3: Timeline Detection & File Structure
**Goal**: Detect mode and organize output by provider

- [ ] Implement `determineTimeline()` logic
- [ ] Update file structure to split by provider
- [ ] Create generation directory management
- [ ] Add symlinks for "current" generation (optional)

**Files to create/modify**:
- `src/mock-data-generator/utils/timeline.ts` (new file)
- `src/mock-data-generator/utils/files.ts` (new file)
- `src/mock-data-generator/index.ts` (update)

**Estimated time**: 2-3 hours

### Phase 4: Incremental Generation Logic
**Goal**: Generate new data using metadata context

- [ ] Implement `buildLLMContextFromMetadata()`
- [ ] Update foundation stage to accept metadata context
- [ ] Update connection/integration/synthesis stages
- [ ] Test 4-stage generation with context

**Files to create/modify**:
- `src/mock-data-generator/stages/foundation.ts` (update)
- `src/mock-data-generator/stages/connection.ts` (update)
- `src/mock-data-generator/stages/integration.ts` (update)
- `src/mock-data-generator/stages/synthesis.ts` (update)
- `src/mock-data-generator/context/builder.ts` (update)

**Estimated time**: 5-6 hours

### Phase 5: Main Orchestrator Update
**Goal**: Integrate all components

- [ ] Update main() to handle both modes
- [ ] Implement initial metadata creation
- [ ] Implement metadata update after generation
- [ ] Add provider-split file saving
- [ ] Test full flow (initial + incremental)

**Files to create/modify**:
- `src/mock-data-generator/index.ts` (major update)

**Estimated time**: 3-4 hours

### Phase 6: Status Command
**Goal**: Create status/info utility

- [ ] Implement status display
- [ ] Add generation history view
- [ ] Show active topics/events
- [ ] Calculate days since last run

**Files to create/modify**:
- `src/mock-data-generator/status.ts` (new file)

**Estimated time**: 1-2 hours

### Phase 7: Configuration & CLI
**Goal**: Add environment variables and commands

- [ ] Add new environment variables
- [ ] Update package.json scripts
- [ ] Add FORCE_REGENERATE option
- [ ] Test all CLI commands

**Files to create/modify**:
- `.env.example` (update)
- `package.json` (update)
- `src/mock-data-generator/config.ts` (update)

**Estimated time**: 1-2 hours

### Phase 8: Testing & Validation
**Goal**: Ensure correctness

- [ ] Test initial generation
- [ ] Test incremental generation (multiple runs)
- [ ] Validate metadata accuracy
- [ ] Verify topic/event extraction
- [ ] Check file structure
- [ ] Test status command
- [ ] Validate data continuity across generations

**Estimated time**: 3-4 hours

### Phase 9: Documentation
**Goal**: Document new system

- [ ] Update README with new workflow
- [ ] Document metadata structure
- [ ] Add examples of incremental usage
- [ ] Create troubleshooting guide
- [ ] Document migration from old structure

**Files to create/modify**:
- `packages/benchmarking/README.md` (update)
- `docs/benchmark/USAGE.md` (new file)

**Estimated time**: 2-3 hours

**Total Estimated Time**: 26-36 hours (increased due to pruning implementation)

## Key Advantages of This Approach

### 1. Bounded Metadata Size
- **Pruning ensures metadata never exceeds ~50-100KB**
- Tiered context (Recent/Medium/Historical) with automatic migration
- Size limits on all collections (topics, events, active items)
- Can run for years without unbounded growth

### 2. No File Reading for Context
- Metadata provides all semantic context needed
- LLM generates coherent continuations without reading old data
- Efficient even with years of data (365+ days)

### 3. Handles Both Continuations and New Topics
- Automatically detects continued vs new topics
- Topic lifecycle management (active → dormant → archived)
- Natural evolution of themes over time
- LLM explicitly instructed to balance continuity with novelty

### 4. Clean File Organization
- Split by provider (not by stage)
- Each generation is isolated and independently readable
- Easy to validate and debug individual providers

### 5. 4-Stage Strategy Maintained
- Realistic relationships in new data
- Foundation → Connection → Integration → Synthesis
- Coherent narrative flow across incremental runs

### 6. Smart Context Management
- **Recent context (14d)**: Full detail, primary focus for generation
- **Medium context (15-60d)**: Summarized, background awareness
- **Historical (60+d)**: High-level summary, narrative continuity
- LLM receives just enough context without being overwhelmed

### 7. Scalability
- Metadata size is O(1) - bounded and constant
- Can generate indefinitely without performance degradation
- Old generations can be archived/deleted
- Status command provides instant overview (no file scanning)

## Success Metrics

- [ ] Running generator twice extends data (doesn't regenerate)
- [ ] **Metadata size stays bounded at ~50-100KB even after months**
- [ ] Metadata accurately captures topics/events/patterns with tiered detail
- [ ] New data coherently continues previous narratives
- [ ] **System handles both topic continuations AND new unrelated topics**
- [ ] Topics automatically migrate through lifecycle (active → dormant → archived)
- [ ] File structure is clean (provider-split)
- [ ] No need to read large data files for context
- [ ] Status command provides useful overview
- [ ] Generation time proportional to new days only

## Next Steps

1. **Review this revised plan** - Does it address your concerns about:
   - Metadata growth (now solved with tiered context + pruning)
   - Related vs unrelated topics (now explicitly handled)
   - File structure (now split by provider)

2. **Decide on configuration**:
   - Window sizes (14d recent, 46d medium, 60d+ historical) - adjust?
   - Size limits (15 active topics, 20 events, etc.) - adjust?
   - Should we auto-clean old generations? (KEEP_GENERATIONS setting)
   - Do we want "current/" symlinks for easy access?

3. **Start Phase 1** - Metadata foundation with tiered structure

4. **Iterate and test** - Build incrementally, test pruning after each phase

5. **Validate** - Run for several months worth of data to confirm metadata stays bounded

---

**Version**: 3.0 (Added tiered context, pruning, and topic lifecycle management)
**Author**: Claude
**Date**: 2025-12-15
