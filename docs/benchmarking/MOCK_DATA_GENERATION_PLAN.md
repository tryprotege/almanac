# Mock Data Generation Plan for eBee Benchmarking

## Executive Summary

This document outlines a comprehensive strategy for generating realistic mock data to benchmark eBee's knowledge graph and RAG capabilities. The plan emphasizes:

- **Configurable Timeline System**: Flexible activity presets (low/medium/high) for realistic temporal patterns
- **Multi-Model LLM Strategy**: Cost-optimized approach using different models for different generation tasks
- **3-Layer Architecture**: Foundational → Operational → Analytical data generation
- **Narrative Consistency**: Coherent storylines across all data sources
- **Ground Truth Queries**: Pre-defined questions with known answers for validation

### Timeline Configuration

The system supports three activity presets:

| Preset | Daily Messages | Weekly Meetings | Monthly PRs | Monthly Issues |
| ------ | -------------- | --------------- | ----------- | -------------- |
| Low    | 10-20          | 2-3             | 5-10        | 3-5            |
| Medium | 30-50          | 5-8             | 15-25       | 10-15          |
| High   | 80-120         | 12-18           | 40-60       | 25-40          |

### Multi-Model LLM Strategy

To optimize costs while maintaining quality:

| Task Type          | Model          | Rationale                 | Est. Cost/1K |
| ------------------ | -------------- | ------------------------- | ------------ |
| Schema Design      | GPT-4          | Complex reasoning needed  | $0.03        |
| Content Generation | GPT-3.5-Turbo  | High volume, good quality | $0.002       |
| Validation         | Claude-3-Haiku | Fast, accurate checking   | $0.0008      |
| Narrative Planning | GPT-4          | Strategic coherence       | $0.03        |
| Bulk Messages      | GPT-3.5-Turbo  | Cost-effective at scale   | $0.002       |

**Estimated Total Cost**: $50-150 for complete dataset generation (depending on volume)

---

## 1. Fictional Company Setup: eBee

### Company Profile

- **Name**: eBee
- **Industry**: Enterprise AI/ML Platform
- **Stage**: Series B (50-75 employees)
- **Founded**: 2021
- **Mission**: "Democratizing enterprise AI through intelligent knowledge graphs"

### Product Suite

1. **eBee Platform** (`ebee-app`): Core knowledge graph platform
2. **eBee ML** (`ebee-ml`): Machine learning model training and deployment
3. **eBee Infrastructure** (`ebee-infra`): Cloud infrastructure and DevOps

### GitHub Organization Structure

```
github.com/ebee-oss/
├── ebee-app/          # Main application repository
├── ebee-ml/           # ML models and training pipelines
├── ebee-infra/        # Infrastructure as code
├── ebee-docs/         # Documentation
└── ebee-sdk/          # Client SDKs
```

### Team Structure (50 employees)

#### Engineering (30)

- **Platform Team (12)**: Core graph engine, API, data ingestion
- **ML Team (10)**: Model development, training infrastructure
- **Infrastructure Team (8)**: DevOps, cloud architecture, security

#### Product & Design (8)

- Product Managers (3)
- UX/UI Designers (3)
- Technical Writers (2)

#### Business (12)

- Sales & Marketing (6)
- Customer Success (4)
- Operations (2)

### Key Personnel (for narrative consistency)

1. **Sarah Chen** - CEO & Co-founder
2. **Marcus Rodriguez** - CTO & Co-founder
3. **Priya Patel** - VP Engineering
4. **James Wilson** - Head of ML
5. **Emily Thompson** - Head of Product
6. **David Kim** - Lead Platform Engineer
7. **Lisa Anderson** - Senior ML Engineer
8. **Alex Turner** - DevOps Lead

---

## 2. Configurable Timeline System

### Timeline Parameters

```typescript
interface TimelineConfig {
  startDate: Date;
  endDate: Date;
  activityPreset: "low" | "medium" | "high";
  customRates?: {
    slackMessagesPerDay: number;
    meetingsPerWeek: number;
    prsPerMonth: number;
    issuesPerMonth: number;
    notionPagesPerWeek: number;
  };
}
```

### Activity Distribution Patterns

#### Slack Messages

- **Peak Hours**: 9 AM - 6 PM (local timezone)
- **Low Activity**: 6 PM - 9 AM, weekends (20% of normal)
- **Channels**:
  - `#general`: 15% of messages
  - `#engineering`: 25%
  - `#platform-team`: 20%
  - `#ml-team`: 15%
  - `#random`: 10%
  - `#incidents`: 5%
  - DMs: 10%

#### Meetings (Fathom)

- **Daily Standups**: Mon-Fri, 9:30 AM (15 min)
- **Sprint Planning**: Every 2 weeks, Monday 10 AM (2 hours)
- **Retrospectives**: Every 2 weeks, Friday 2 PM (1 hour)
- **1-on-1s**: Weekly, various times (30 min)
- **All-Hands**: Monthly, first Friday 3 PM (1 hour)
- **Technical Deep Dives**: 2-3 per week (1 hour)

#### GitHub Activity

- **PR Patterns**:

  - Small PRs (< 100 lines): 60%
  - Medium PRs (100-500 lines): 30%
  - Large PRs (> 500 lines): 10%
  - Review time: 2-48 hours
  - Merge rate: 95%

- **Issue Patterns**:
  - Bugs: 40%
  - Features: 35%
  - Enhancements: 15%
  - Documentation: 10%
  - Resolution time: 1-14 days

#### Notion Pages

- **Weekly Cadence**:
  - Meeting notes: 5-8 per week
  - Technical specs: 2-3 per week
  - Product docs: 1-2 per week
  - Retrospectives: 1 per 2 weeks

---

## 3. Multi-Model LLM Strategy for Cost Optimization

### Model Selection Matrix

```typescript
interface ModelStrategy {
  task: string;
  model: "gpt-4" | "gpt-3.5-turbo" | "claude-3-haiku" | "claude-3-sonnet";
  reasoning: string;
  estimatedTokens: number;
  costPer1K: number;
}

const strategies: ModelStrategy[] = [
  {
    task: "Schema Design & Planning",
    model: "gpt-4",
    reasoning: "Complex reasoning, one-time cost",
    estimatedTokens: 10000,
    costPer1K: 0.03,
  },
  {
    task: "Slack Message Generation",
    model: "gpt-3.5-turbo",
    reasoning: "High volume, good quality-to-cost ratio",
    estimatedTokens: 500000,
    costPer1K: 0.002,
  },
  {
    task: "Meeting Transcript Generation",
    model: "gpt-3.5-turbo",
    reasoning: "Long-form content, cost-effective",
    estimatedTokens: 200000,
    costPer1K: 0.002,
  },
  {
    task: "Code Generation (PRs)",
    model: "gpt-4",
    reasoning: "Quality critical for realistic code",
    estimatedTokens: 100000,
    costPer1K: 0.03,
  },
  {
    task: "Validation & Checking",
    model: "claude-3-haiku",
    reasoning: "Fast, accurate, cost-effective",
    estimatedTokens: 50000,
    costPer1K: 0.0008,
  },
  {
    task: "Notion Documentation",
    model: "gpt-3.5-turbo",
    reasoning: "Good structure, reasonable cost",
    estimatedTokens: 150000,
    costPer1K: 0.002,
  },
];
```

### Cost Estimation

For a **6-month timeline with medium activity**:

| Data Source   | Volume         | Model          | Est. Tokens | Est. Cost |
| ------------- | -------------- | -------------- | ----------- | --------- |
| Slack         | 7,200 messages | GPT-3.5        | 500K        | $1.00     |
| Fathom        | 120 meetings   | GPT-3.5        | 200K        | $0.40     |
| GitHub PRs    | 120 PRs        | GPT-4          | 100K        | $3.00     |
| GitHub Issues | 90 issues      | GPT-3.5        | 50K         | $0.10     |
| Notion        | 100 pages      | GPT-3.5        | 150K        | $0.30     |
| Validation    | All data       | Claude-3-Haiku | 50K         | $0.04     |
| **Total**     |                |                | **1.05M**   | **$4.84** |

**Note**: Actual costs may vary based on prompt engineering and response lengths. Budget $10-20 for safety margin.

---

## 4. Data Generation Architecture

### 3-Layer Approach

```
Layer 1: Foundational Data (Week 1)
├── Company structure & personnel
├── Repository setup & initial commits
├── Core documentation (README, CONTRIBUTING)
└── Initial Slack channels & members

Layer 2: Operational Data (Weeks 2-4)
├── Daily Slack conversations
├── Regular meetings (standups, 1-on-1s)
├── GitHub issues & PRs
└── Notion meeting notes & specs

Layer 3: Analytical Data (Weeks 5-6)
├── Cross-reference validation
├── Ground truth query generation
├── Metric calculation
└── Benchmark dataset finalization
```

### Generation Pipeline

```typescript
interface GenerationPipeline {
  phase: string;
  steps: Step[];
  dependencies: string[];
  estimatedTime: string;
}

const pipeline: GenerationPipeline[] = [
  {
    phase: "Foundation",
    steps: [
      { name: "Generate company structure", model: "gpt-4" },
      { name: "Create personnel profiles", model: "gpt-3.5-turbo" },
      { name: "Initialize repositories", model: "gpt-4" },
      { name: "Setup Slack workspace", model: "gpt-3.5-turbo" },
    ],
    dependencies: [],
    estimatedTime: "2-4 hours",
  },
  {
    phase: "Narrative Planning",
    steps: [
      { name: "Design story arcs", model: "gpt-4" },
      { name: "Create event timeline", model: "gpt-4" },
      { name: "Define key milestones", model: "gpt-4" },
    ],
    dependencies: ["Foundation"],
    estimatedTime: "1-2 hours",
  },
  {
    phase: "Content Generation",
    steps: [
      { name: "Generate Slack messages", model: "gpt-3.5-turbo" },
      { name: "Create meeting transcripts", model: "gpt-3.5-turbo" },
      { name: "Generate GitHub activity", model: "gpt-4" },
      { name: "Create Notion pages", model: "gpt-3.5-turbo" },
    ],
    dependencies: ["Narrative Planning"],
    estimatedTime: "4-8 hours",
  },
  {
    phase: "Validation",
    steps: [
      { name: "Check cross-references", model: "claude-3-haiku" },
      { name: "Validate timeline consistency", model: "claude-3-haiku" },
      { name: "Verify entity relationships", model: "claude-3-haiku" },
    ],
    dependencies: ["Content Generation"],
    estimatedTime: "1-2 hours",
  },
];
```

---

## 5. Narrative Arc Design

### Major Story Arcs (6-month timeline)

#### Arc 1: Platform Stability Crisis (Month 1-2)

**Theme**: Infrastructure scaling challenges

**Key Events**:

1. **Week 1**: Performance degradation detected in production
2. **Week 2**: Emergency war room meetings, root cause analysis
3. **Week 3**: Infrastructure redesign proposal
4. **Week 4**: Implementation sprint
5. **Week 5-6**: Gradual rollout and monitoring
6. **Week 7-8**: Retrospective and documentation

**Data Touchpoints**:

- Slack: Urgent messages in `#incidents`, `#infrastructure`
- Fathom: War room meetings, technical deep dives
- GitHub:
  - Issues: "Production latency spike", "Database connection pool exhaustion"
  - PRs: "Implement connection pooling", "Add circuit breakers"
- Notion: Incident reports, postmortems, architecture proposals

**Key Personnel**: Alex Turner (DevOps Lead), Marcus Rodriguez (CTO), David Kim (Platform Lead)

#### Arc 2: ML Model Accuracy Improvement (Month 2-4)

**Theme**: Enhancing core ML capabilities

**Key Events**:

1. **Week 9**: Customer feedback on model accuracy
2. **Week 10**: Data quality audit initiated
3. **Week 11-12**: New training pipeline design
4. **Week 13-14**: Implementation and testing
5. **Week 15-16**: A/B testing in production

**Data Touchpoints**:

- Slack: Discussions in `#ml-team`, `#customer-success`
- Fathom: ML team syncs, customer feedback reviews
- GitHub:
  - Issues: "Improve entity extraction accuracy", "Add model versioning"
  - PRs: "Refactor training pipeline", "Add evaluation metrics"
- Notion: ML experiment logs, model performance reports

**Key Personnel**: James Wilson (Head of ML), Lisa Anderson (Senior ML Engineer), Emily Thompson (Head of Product)

#### Arc 3: Series B Fundraising (Month 3-5)

**Theme**: Company growth and strategic planning

**Key Events**:

1. **Week 13**: Board decision to raise Series B
2. **Week 14-15**: Pitch deck preparation
3. **Week 16-18**: Investor meetings
4. **Week 19**: Term sheet received
5. **Week 20**: Due diligence period

**Data Touchpoints**:

- Slack: Discussions in `#leadership`, `#general` (announcements)
- Fathom: Board meetings, investor prep sessions
- GitHub: Minimal activity (focus on stability)
- Notion: Pitch decks, financial models, investor Q&A docs

**Key Personnel**: Sarah Chen (CEO), Marcus Rodriguez (CTO), Priya Patel (VP Engineering)

#### Arc 4: Product Launch - Graph Analytics (Month 5-6)

**Theme**: New feature development and launch

**Key Events**:

1. **Week 21**: Feature kickoff
2. **Week 22-23**: Design and planning
3. **Week 24-25**: Implementation sprint
4. **Week 26**: Beta testing
5. **Week 27**: Public launch

**Data Touchpoints**:

- Slack: High activity in `#platform-team`, `#product`
- Fathom: Sprint planning, design reviews, launch planning
- GitHub:
  - Issues: "Graph analytics API design", "Query optimization"
  - PRs: "Add graph traversal algorithms", "Implement analytics dashboard"
- Notion: Product specs, launch plans, marketing materials

**Key Personnel**: Emily Thompson (Product), David Kim (Engineering), Priya Patel (VP Engineering)

### Minor Story Threads

1. **Onboarding New Engineers** (Ongoing)

   - New hires every 4-6 weeks
   - Onboarding docs in Notion
   - Welcome messages in Slack
   - First PRs and code reviews

2. **Technical Debt Reduction** (Ongoing)

   - Weekly tech debt tickets
   - Refactoring PRs
   - Architecture discussions

3. **Customer Support Escalations** (Sporadic)

   - Bug reports from customers
   - Urgent fixes and patches
   - Customer success team coordination

4. **Team Building & Culture** (Monthly)
   - All-hands meetings
   - Team offsites
   - Casual conversations in `#random`

---

## 6. Validation Framework

### Cross-Reference Validation

```typescript
interface ValidationRule {
  name: string;
  description: string;
  check: (data: MockData) => ValidationResult;
}

const validationRules: ValidationRule[] = [
  {
    name: "Timeline Consistency",
    description: "All events occur in chronological order",
    check: (data) => {
      // Verify no references to future events
      // Check meeting dates align with Slack discussions
      // Ensure PR merge dates are after creation dates
    },
  },
  {
    name: "Entity Consistency",
    description: "People, repos, and projects are consistently named",
    check: (data) => {
      // Verify person names match across sources
      // Check repository names are consistent
      // Validate project references
    },
  },
  {
    name: "Relationship Validity",
    description: "All relationships between entities are valid",
    check: (data) => {
      // Verify PR authors are team members
      // Check meeting attendees exist
      // Validate Slack message authors
    },
  },
  {
    name: "Narrative Coherence",
    description: "Story arcs are logically consistent",
    check: (data) => {
      // Verify incident resolution before closure
      // Check feature discussions before implementation
      // Validate decision outcomes match discussions
    },
  },
  {
    name: "Data Volume Balance",
    description: "Activity levels are realistic and balanced",
    check: (data) => {
      // Check message distribution across channels
      // Verify meeting frequency is reasonable
      // Validate PR/issue ratios
    },
  },
];
```

### Validation Metrics

| Metric                    | Target | Measurement                          |
| ------------------------- | ------ | ------------------------------------ |
| Timeline Consistency      | 100%   | No chronological violations          |
| Entity Name Consistency   | > 98%  | Fuzzy matching across sources        |
| Relationship Validity     | 100%   | All references resolve               |
| Cross-Reference Density   | > 80%  | Events mentioned in multiple sources |
| Narrative Coherence Score | > 0.85 | LLM-based coherence evaluation       |

---

## 7. Data Volume Estimates

### 6-Month Timeline (Medium Activity)

| Data Source         | Total Volume | Daily Avg | Weekly Avg |
| ------------------- | ------------ | --------- | ---------- |
| **Slack Messages**  | 7,200        | 40        | 280        |
| **Fathom Meetings** | 120          | 0.67      | 5          |
| **GitHub PRs**      | 120          | 0.67      | 5          |
| **GitHub Issues**   | 90           | 0.5       | 3.75       |
| **Notion Pages**    | 100          | 0.56      | 4          |

### Detailed Breakdown

#### Slack (7,200 messages)

- `#general`: 1,080 (15%)
- `#engineering`: 1,800 (25%)
- `#platform-team`: 1,440 (20%)
- `#ml-team`: 1,080 (15%)
- `#random`: 720 (10%)
- `#incidents`: 360 (5%)
- DMs: 720 (10%)

#### Fathom (120 meetings)

- Daily Standups: 60 (50%)
- Sprint Planning: 12 (10%)
- Retrospectives: 12 (10%)
- 1-on-1s: 24 (20%)
- Technical Deep Dives: 8 (7%)
- All-Hands: 4 (3%)

#### GitHub PRs (120 total)

- `ebee-app`: 60 (50%)
- `ebee-ml`: 36 (30%)
- `ebee-infra`: 24 (20%)

#### GitHub Issues (90 total)

- Bugs: 36 (40%)
- Features: 32 (35%)
- Enhancements: 14 (15%)
- Documentation: 8 (10%)

#### Notion (100 pages)

- Meeting Notes: 50 (50%)
- Technical Specs: 25 (25%)
- Product Docs: 15 (15%)
- Retrospectives: 10 (10%)

---

## 8. Cross-Reference Strategy

### Reference Types

1. **Direct References**

   - Slack message mentions GitHub PR: "Just merged #PR-123"
   - Meeting discusses Slack thread: "As discussed in #platform-team"
   - Notion page links to GitHub issue: "See issue #45 for details"

2. **Implicit References**

   - Meeting about topic → Slack discussion same day
   - GitHub PR → Follow-up Slack announcement
   - Incident in Slack → Postmortem in Notion

3. **Temporal References**
   - "Yesterday's standup"
   - "Last week's sprint planning"
   - "The incident from two weeks ago"

### Cross-Reference Density Targets

| Source Pair     | Target Density | Example                                 |
| --------------- | -------------- | --------------------------------------- |
| Slack ↔ GitHub  | 40%            | 40% of PRs mentioned in Slack           |
| Slack ↔ Fathom  | 60%            | 60% of meetings discussed in Slack      |
| Fathom ↔ Notion | 80%            | 80% of meetings have Notion notes       |
| GitHub ↔ Notion | 30%            | 30% of major PRs have spec docs         |
| Slack ↔ Notion  | 25%            | 25% of Notion pages referenced in Slack |

### Implementation Strategy

```typescript
interface CrossReference {
  sourceType: "slack" | "fathom" | "github" | "notion";
  sourceId: string;
  targetType: "slack" | "fathom" | "github" | "notion";
  targetId: string;
  referenceType: "direct" | "implicit" | "temporal";
  confidence: number; // 0-1
}

// Generate cross-references during content creation
function generateCrossReferences(
  content: GeneratedContent,
  existingData: MockData
): CrossReference[] {
  // 1. Identify key entities in content
  // 2. Find related content in other sources
  // 3. Create appropriate references
  // 4. Validate reference makes narrative sense
}
```

---

## 9. Ground Truth Query Dataset

### Query Categories

#### 1. Factual Queries (30%)

Questions with definitive answers in the data.

**Examples**:

- "Who is the CTO of eBee?"

  - **Answer**: Marcus Rodriguez
  - **Sources**: Slack profiles, Notion org chart, meeting attendees

- "What repositories are in the eBee GitHub organization?"

  - **Answer**: ebee-app, ebee-ml, ebee-infra, ebee-docs, ebee-sdk
  - **Sources**: GitHub repository list, Notion documentation

- "When was the Series B fundraising announced?"
  - **Answer**: [Specific date in Month 5]
  - **Sources**: Slack #general announcement, All-Hands meeting

#### 2. Analytical Queries (25%)

Questions requiring synthesis across multiple sources.

**Examples**:

- "What were the main causes of the production incident in Month 1?"

  - **Answer**: Database connection pool exhaustion, insufficient monitoring
  - **Sources**: Slack #incidents, war room meetings, Notion postmortem

- "How did the ML team improve model accuracy?"

  - **Answer**: Refactored training pipeline, improved data quality, added evaluation metrics
  - **Sources**: GitHub PRs, ML team meetings, Notion experiment logs

- "What features were launched in Q2?"
  - **Answer**: Graph Analytics API, Query optimization, Analytics dashboard
  - **Sources**: GitHub PRs, product meetings, Notion launch plans

#### 3. Temporal Queries (20%)

Questions about sequences and timelines.

**Examples**:

- "What happened between the infrastructure incident and its resolution?"

  - **Answer**: Root cause analysis → Design proposal → Implementation → Rollout
  - **Sources**: Slack threads, meetings, GitHub PRs, Notion docs

- "How long did the ML accuracy improvement project take?"
  - **Answer**: 8 weeks (Week 9-16)
  - **Sources**: Project kickoff meeting → Final A/B test results

#### 4. Relationship Queries (15%)

Questions about connections between entities.

**Examples**:

- "Who worked on the infrastructure redesign?"

  - **Answer**: Alex Turner (lead), David Kim, Marcus Rodriguez
  - **Sources**: GitHub PR authors/reviewers, meeting attendees, Slack discussions

- "Which teams were involved in the product launch?"
  - **Answer**: Platform team, Product team, Marketing
  - **Sources**: Cross-functional meetings, Slack channels, GitHub contributors

#### 5. Aggregation Queries (10%)

Questions requiring counting or summarization.

**Examples**:

- "How many PRs were merged in Month 3?"

  - **Answer**: [Specific count based on generated data]
  - **Sources**: GitHub PR list filtered by date

- "What percentage of incidents were resolved within 24 hours?"
  - **Answer**: [Calculated from incident data]
  - **Sources**: Slack #incidents timestamps, Notion incident reports

### Query Dataset Structure

```typescript
interface GroundTruthQuery {
  id: string;
  category:
    | "factual"
    | "analytical"
    | "temporal"
    | "relationship"
    | "aggregation";
  question: string;
  answer: string;
  sources: {
    type: "slack" | "fathom" | "github" | "notion";
    id: string;
    relevance: number; // 0-1
  }[];
  difficulty: "easy" | "medium" | "hard";
  requiredHops: number; // Graph traversal depth
  expectedRetrievalCount: number; // Expected chunks retrieved
}
```

### Target: 100 Ground Truth Queries

| Category     | Count | Difficulty Distribution      |
| ------------ | ----- | ---------------------------- |
| Factual      | 30    | Easy: 20, Medium: 8, Hard: 2 |
| Analytical   | 25    | Easy: 5, Medium: 15, Hard: 5 |
| Temporal     | 20    | Easy: 8, Medium: 10, Hard: 2 |
| Relationship | 15    | Easy: 5, Medium: 8, Hard: 2  |
| Aggregation  | 10    | Easy: 3, Medium: 5, Hard: 2  |

---

## 10. Benchmark Metrics

### Primary Metrics

#### 1. Retrieval Accuracy

- **Precision@K**: Percentage of retrieved chunks that are relevant
- **Recall@K**: Percentage of relevant chunks that are retrieved
- **MRR (Mean Reciprocal Rank)**: Average of reciprocal ranks of first relevant result
- **NDCG (Normalized Discounted Cumulative Gain)**: Ranking quality metric

**Targets**:

- Precision@5: > 0.80
- Recall@10: > 0.85
- MRR: > 0.75
- NDCG@10: > 0.80

#### 2. Answer Quality

- **Exact Match**: Answer exactly matches ground truth
- **F1 Score**: Token-level overlap between answer and ground truth
- **BLEU Score**: N-gram overlap metric
- **BERTScore**: Semantic similarity using embeddings

**Targets**:

- Exact Match: > 0.60 (for factual queries)
- F1 Score: > 0.75
- BERTScore: > 0.85

#### 3. Latency

- **Query Processing Time**: Time to retrieve and rank chunks
- **Answer Generation Time**: Time to generate final answer
- **End-to-End Latency**: Total time from query to answer

**Targets**:

- Query Processing: < 500ms
- Answer Generation: < 2s
- End-to-End: < 3s

#### 4. Graph Traversal Efficiency

- **Hop Accuracy**: Correct entities found at each traversal depth
- **Path Relevance**: Percentage of traversal paths that are relevant
- **Traversal Time**: Time to explore graph relationships

**Targets**:

- Hop Accuracy: > 0.80 at depth 2, > 0.70 at depth 3
- Path Relevance: > 0.75
- Traversal Time: < 200ms per hop

### Secondary Metrics

#### 5. Cross-Source Integration

- **Multi-Source Queries**: Percentage of queries requiring multiple sources
- **Source Coverage**: Average number of sources used per query
- **Integration Quality**: Coherence of multi-source answers

#### 6. Temporal Reasoning

- **Temporal Accuracy**: Correct ordering of events
- **Date Extraction**: Accuracy of date/time extraction
- **Duration Calculation**: Accuracy of time span calculations

#### 7. Entity Resolution

- **Entity Linking Accuracy**: Correct identification of entities
- **Disambiguation Rate**: Success rate for ambiguous entities
- **Co-reference Resolution**: Accuracy of pronoun/reference resolution

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Establish base data structures and narrative framework

**Tasks**:

1. Define company structure and personnel (GPT-4)
2. Create repository structure and initial commits (GPT-4)
3. Setup Slack workspace and channels (GPT-3.5-Turbo)
4. Generate core Notion documentation (GPT-3.5-Turbo)

**Deliverables**:

- Company profile document
- 8 key personnel profiles
- 5 GitHub repositories with README files
- 10 Slack channels with descriptions
- 5 foundational Notion pages

**Validation**:

- All entities have consistent names
- Timeline starts at defined date
- Basic relationships are established

### Phase 2: Narrative Planning (Week 1-2)

**Goal**: Design coherent story arcs and event timeline

**Tasks**:

1. Design 4 major story arcs (GPT-4)
2. Create detailed event timeline (GPT-4)
3. Define cross-reference strategy (GPT-4)
4. Generate ground truth query seeds (GPT-4)

**Deliverables**:

- Story arc documents (4)
- Event timeline spreadsheet
- Cross-reference mapping
- 50 seed queries

**Validation**:

- Story arcs are logically consistent
- Events are properly sequenced
- Cross-references are feasible

### Phase 3: Content Generation (Week 2-4)

**Goal**: Generate bulk operational data

**Tasks**:

1. Generate Slack messages (GPT-3.5-Turbo)
   - Batch by channel and date
   - Include cross-references
2. Create meeting transcripts (GPT-3.5-Turbo)
   - Follow narrative arcs
   - Include action items
3. Generate GitHub activity (GPT-4 for code, GPT-3.5 for issues)
   - PRs with realistic diffs
   - Issues with discussions
4. Create Notion pages (GPT-3.5-Turbo)
   - Meeting notes
   - Technical specs
   - Retrospectives

**Deliverables**:

- 7,200 Slack messages
- 120 meeting transcripts
- 120 GitHub PRs
- 90 GitHub issues
- 100 Notion pages

**Validation** (Claude-3-Haiku):

- Timeline consistency checks
- Entity name validation
- Cross-reference verification

### Phase 4: Ground Truth Finalization (Week 5)

**Goal**: Complete and validate query dataset

**Tasks**:

1. Expand seed queries to 100 total (GPT-4)
2. Validate answers against generated data (Claude-3-Haiku)
3. Categorize queries by difficulty (Claude-3-Haiku)
4. Calculate expected retrieval metrics (Claude-3-Haiku)

**Deliverables**:

- 100 ground truth queries with answers
- Query difficulty ratings
- Expected metric baselines

**Validation**:

- All queries have verifiable answers
- Difficulty distribution matches targets
- Coverage across all query categories

### Phase 5: Validation & Refinement (Week 6)

**Goal**: Ensure data quality and consistency

**Tasks**:

1. Run comprehensive validation suite (Claude-3-Haiku)
2. Fix identified inconsistencies (GPT-3.5-Turbo)
3. Verify cross-reference density (Claude-3-Haiku)
4. Calculate final metrics (Claude-3-Haiku)

**Deliverables**:

- Validation report
- Refined dataset
- Metric baseline document

**Validation**:

- All validation rules pass
- Cross-reference density meets targets
- Data volume matches estimates

### Phase 6: Benchmark Execution (Week 7-8)

**Goal**: Run benchmarks and analyze results

**Tasks**:

1. Ingest data into eBee system
2. Execute ground truth queries
3. Calculate benchmark metrics
4. Analyze performance gaps
5. Generate benchmark report

**Deliverables**:

- Benchmark results
- Performance analysis
- Improvement recommendations

---

## 12. Success Criteria

### Data Quality

- ✅ Timeline consistency: 100% (no chronological violations)
- ✅ Entity consistency: > 98% (fuzzy matching)
- ✅ Cross-reference density: > 80% (events in multiple sources)
- ✅ Narrative coherence: > 0.85 (LLM evaluation)

### Data Volume

- ✅ Slack messages: 7,200 ± 10%
- ✅ Fathom meetings: 120 ± 10%
- ✅ GitHub PRs: 120 ± 10%
- ✅ GitHub issues: 90 ± 10%
- ✅ Notion pages: 100 ± 10%

### Ground Truth Queries

- ✅ Total queries: 100
- ✅ Category distribution: Matches targets ± 5%
- ✅ Difficulty distribution: Matches targets ± 5%
- ✅ Answer verifiability: 100%

### Benchmark Performance

- ✅ Precision@5: > 0.80
- ✅ Recall@10: > 0.85
- ✅ F1 Score: > 0.75
- ✅ End-to-End Latency: < 3s

### Cost Efficiency

- ✅ Total generation cost: < $20
- ✅ Cost per query: < $0.20
- ✅ Model selection: Optimized for task

---

## 13. Quick Start Guide

### Prerequisites

- OpenAI API key (GPT-4 and GPT-3.5-Turbo access)
- Anthropic API key (Claude-3-Haiku access)
- Python 3.9+ or Node.js 18+
- Git

### Step 1: Setup Configuration

```typescript
// config.ts
export const config = {
  timeline: {
    startDate: "2024-01-01",
    endDate: "2024-06-30",
    activityPreset: "medium" as const,
  },
  company: {
    name: "eBee",
    githubOrg: "ebee-oss",
    repositories: ["ebee-app", "ebee-ml", "ebee-infra"],
  },
  models: {
    planning: "gpt-4",
    generation: "gpt-3.5-turbo",
    validation: "claude-3-haiku",
  },
  output: {
    directory: "./mock-data",
    format: "json",
  },
};
```

### Step 2: Generate Foundation

```bash
# Install dependencies
npm install

# Generate company structure
npm run generate:foundation

# Output: ./mock-data/foundation/
# - company.json
# - personnel.json
# - repositories.json
# - slack-workspace.json
```

### Step 3: Plan Narratives

```bash
# Generate story arcs and timeline
npm run generate:narratives

# Output: ./mock-data/narratives/
# - story-arcs.json
# - event-timeline.json
# - cross-references.json
```

### Step 4: Generate Content

```bash
# Generate all operational data
npm run generate:content

# Or generate by source:
npm run generate:slack
npm run generate:fathom
npm run generate:github
npm run generate:notion

# Output: ./mock-data/content/
# - slack/
# - fathom/
# - github/
# - notion/
```

### Step 5: Validate Data

```bash
# Run validation suite
npm run validate

# Output: ./mock-data/validation/
# - validation-report.json
# - issues.json (if any)
```

### Step 6: Generate Ground Truth

```bash
# Generate query dataset
npm run generate:queries

# Output: ./mock-data/queries/
# - ground-truth-queries.json
# - query-categories.json
```

### Step 7: Run Benchmarks

```bash
# Ingest data into eBee
npm run ingest

# Execute benchmarks
npm run benchmark

# Output: ./mock-data/benchmarks/
# - results.json
# - metrics.json
# - analysis.md
```

---

## 14. Tips & Best Practices

### Content Generation

1. **Batch Processing**

   - Generate content in batches (e.g., 100 messages at a time)
   - Reduces API costs and improves consistency
   - Easier to validate and fix issues

2. **Prompt Engineering**

   - Use few-shot examples for better quality
   - Include context from previous generations
   - Specify tone, style, and technical level

3. **Incremental Validation**
   - Validate after each batch
   - Fix issues before proceeding
   - Prevents cascading errors

### Cost Optimization

1. **Model Selection**

   - Use GPT-4 only for complex reasoning
   - GPT-3.5-Turbo for bulk generation
   - Claude-3-Haiku for validation

2. **Token Management**

   - Minimize prompt length
   - Use efficient output formats (JSON)
   - Cache common context

3. **Parallel Processing**
   - Generate independent content in parallel
   - Reduces wall-clock time
   - Doesn't increase API costs

### Quality Assurance

1. **Human Review**

   - Spot-check 5-10% of generated content
   - Focus on narrative coherence
   - Verify technical accuracy

2. **Automated Checks**

   - Run validation suite frequently
   - Monitor cross-reference density
   - Track entity consistency

3. **Iterative Refinement**
   - Start with small dataset
   - Validate and refine process
   - Scale up gradually

---

## 15. Next Steps

### Immediate Actions (Week 1)

1. ✅ Review and approve this plan
2. ✅ Setup development environment
3. ✅ Configure API keys and models
4. ✅ Generate foundation data
5. ✅ Validate foundation output

### Short-term (Week 2-4)

1. ✅ Complete narrative planning
2. ✅ Generate operational data
3. ✅ Run validation suite
4. ✅ Fix identified issues

### Medium-term (Week 5-6)

1. ✅ Finalize ground truth queries
2. ✅ Complete data validation
3. ✅ Calculate baseline metrics
4. ✅ Document generation process

### Long-term (Week 7-8)

1. ✅ Ingest data into eBee
2. ✅ Execute benchmarks
3. ✅ Analyze results
4. ✅ Generate improvement recommendations

---

## 16. References

### Related Documents

- [eBee Architecture Overview](../architecture/OVERVIEW.md)
- [Benchmarking Strategy](./BENCHMARKING_STRATEGY.md)
- [Data Ingestion Guide](../guides/DATA_INGESTION.md)

### External Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic API Documentation](https://docs.anthropic.com)
- [LangChain Documentation](https://python.langchain.com)
- [Synthetic Data Generation Best Practices](https://arxiv.org/abs/2305.00000)

### Tools & Libraries

- [Faker.js](https://fakerjs.dev/) - Generate fake data
- [Chance.js](https://chancejs.com/) - Random generator
- [JSON Schema](https://json-schema.org/) - Data validation
- [Zod](https://zod.dev/) - TypeScript schema validation

---

## Appendix A: Sample Data Structures

### Slack Message

```json
{
  "id": "msg_001",
  "channel": "#platform-team",
  "author": "David Kim",
  "timestamp": "2024-01-15T10:30:00Z",
  "content": "Just merged PR #123 - the connection pooling fix. Should resolve the latency issues we saw yesterday.",
  "thread_ts": null,
  "reactions": [
    { "emoji": "👍", "users": ["Alex Turner", "Marcus Rodriguez"] }
  ],
  "references": [{ "type": "github_pr", "id": "ebee-oss/ebee-app#123" }]
}
```

### Fathom Meeting

```json
{
  "id": "meeting_001",
  "title": "Infrastructure War Room",
  "date": "2024-01-14T15:00:00Z",
  "duration_minutes": 60,
  "attendees": ["Alex Turner", "Marcus Rodriguez", "David Kim"],
  "transcript": "...",
  "summary": "Discussed production latency spike. Root cause identified as database connection pool exhaustion. Agreed to implement connection pooling and circuit breakers.",
  "action_items": [
    {
      "description": "Implement connection pooling",
      "assignee": "David Kim",
      "due_date": "2024-01-21"
    }
  ],
  "references": [
    { "type": "slack_thread", "id": "msg_000" },
    { "type": "notion_page", "id": "page_001" }
  ]
}
```

### GitHub PR

```json
{
  "id": "pr_123",
  "repository": "ebee-oss/ebee-app",
  "title": "Implement connection pooling",
  "author": "David Kim",
  "created_at": "2024-01-16T09:00:00Z",
  "merged_at": "2024-01-18T14:30:00Z",
  "description": "Implements connection pooling to resolve database connection exhaustion issues identified in the production incident.",
  "files_changed": 5,
  "additions": 234,
  "deletions": 45,
  "reviewers": ["Alex Turner", "Marcus Rodriguez"],
  "labels": ["bug", "infrastructure", "high-priority"],
  "references": [
    { "type": "github_issue", "id": "ebee-oss/ebee-app#45" },
    { "type": "slack_message", "id": "msg_001" }
  ]
}
```

### Notion Page

```json
{
  "id": "page_001",
  "title": "Production Incident Postmortem - Jan 14, 2024",
  "created_at": "2024-01-15T16:00:00Z",
  "author": "Alex Turner",
  "content": "...",
  "sections": [
    {
      "title": "Incident Summary",
      "content": "Production latency spike affecting all customers..."
    },
    {
      "title": "Root Cause",
      "content": "Database connection pool exhaustion due to..."
    },
    {
      "title": "Resolution",
      "content": "Implemented connection pooling and circuit breakers..."
    }
  ],
  "references": [
    { "type": "slack_thread", "id": "msg_000" },
    { "type": "fathom_meeting", "id": "meeting_001" },
    { "type": "github_pr", "id": "ebee-oss/ebee-app#123" }
  ]
}
```

---

## Appendix B: Validation Checklist

### Pre-Generation

- [ ] Configuration file is complete
- [ ] API keys are configured
- [ ] Output directory exists
- [ ] Timeline parameters are valid

### Post-Foundation

- [ ] Company structure is defined
- [ ] All personnel have profiles
- [ ] Repositories are initialized
- [ ] Slack workspace is setup

### Post-Narrative Planning

- [ ] Story arcs are coherent
- [ ] Event timeline is complete
- [ ] Cross-references are mapped
- [ ] Seed queries are generated

### Post-Content Generation

- [ ] All data volumes match targets
- [ ] Timeline consistency is verified
- [ ] Entity names are consistent
- [ ] Cross-references are valid

### Post-Ground Truth

- [ ] 100 queries are generated
- [ ] All answers are verifiable
- [ ] Difficulty distribution is correct
- [ ] Category distribution is correct

### Pre-Benchmark

- [ ] Data is ingested into eBee
- [ ] System is configured correctly
- [ ] Baseline metrics are calculated
- [ ] Test environment is ready

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-10  
**Author**: eBee Engineering Team  
**Status**: Draft for Review
