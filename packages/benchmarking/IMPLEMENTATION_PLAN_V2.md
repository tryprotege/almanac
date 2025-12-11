# Mock Data Generator Implementation Plan V2

## Overview

This plan outlines how to update the mock data generator to produce data that exactly matches what the MCP clients return, enabling seamless integration with the existing adapters.

---

## Phase 1: Update Generator Output Structure

### Goal

Each generator should produce data matching the exact structure returned by MCP client methods.

### 1.1 Fathom Generator Output

```typescript
interface FathomGeneratorOutput {
  teams: FathomTeam[];
  teamMembers: FathomTeamMember[];
  meetings: FathomMeeting[];
  transcripts: FathomTranscript[];
  summaries: FathomSummary[];
}
```

**Key Points:**

- Meetings should NOT include embedded transcript/summary/action_items (adapter fetches separately)
- Each transcript/summary must reference a valid meeting via `recording_id`
- Team members must reference valid team IDs

### 1.2 GitHub Generator Output

```typescript
interface GitHubGeneratorOutput {
  user: GitHubUser;
  organizationMembers: GitHubUser[];
  repositories: GitHubRepository[];
  issues: GitHubIssue[];
  pullRequests: GitHubPullRequest[];
  workflows: GitHubWorkflow[];
  workflowRuns: GitHubWorkflowRun[];
  releases: GitHubRelease[];
  discussions: GitHubDiscussion[];
  codeScanningAlerts: GitHubCodeScanningAlert[];
  dependabotAlerts: GitHubDependabotAlert[];
}
```

**Key Points:**

- All issues/PRs/workflows must reference valid repositories via owner/repo names
- Workflow runs must reference valid workflow IDs
- PRs can reference issues via "fixes #123" in body
- 30% of PRs should be from Dependabot

### 1.3 Notion Generator Output

```typescript
interface NotionGeneratorOutput {
  users: NotionUser[];
  databases: NotionDatabase[];
  pages: NotionPage[];
  blocks: Map<string, NotionBlock[]>; // pageId -> blocks
}
```

**Key Points:**

- Pages can be in databases (parent.type = "database_id") or standalone (parent.type = "workspace")
- Each page should have corresponding blocks
- Blocks can be nested (has_children = true)

### 1.4 Slack Generator Output

```typescript
interface SlackGeneratorOutput {
  users: Member[];
  channels: Channel[];
  messages: Map<string, MessageElement[]>; // channelId -> messages
}
```

**Key Points:**

- Messages include both top-level and thread replies
- Thread messages have `thread_ts` set
- Parent messages with replies have `reply_count` > 0
- Messages are sorted by timestamp

---

## Phase 2: Create Mock MCP Server

### 2.1 Purpose

Create a mock MCP server that reads the generated JSON files and returns data exactly as the real MCP clients would.

### 2.2 Structure

```
packages/benchmarking/src/mock-mcp-server/
├── index.ts              # Main server entry point
├── fathom-mock.ts        # Fathom MCP mock
├── github-mock.ts        # GitHub MCP mock
├── notion-mock.ts        # Notion MCP mock
└── slack-mock.ts         # Slack MCP mock (if needed)
```

### 2.3 Fathom Mock Server

```typescript
// fathom-mock.ts
export class FathomMockServer {
  private data: FathomGeneratorOutput;

  constructor(dataPath: string) {
    // Load generated JSON files
    this.data = {
      teams: JSON.parse(fs.readFileSync(`${dataPath}/teams.json`, "utf-8")),
      teamMembers: JSON.parse(
        fs.readFileSync(`${dataPath}/team-members.json`, "utf-8")
      ),
      meetings: JSON.parse(
        fs.readFileSync(`${dataPath}/meetings.json`, "utf-8")
      ),
      transcripts: JSON.parse(
        fs.readFileSync(`${dataPath}/transcripts.json`, "utf-8")
      ),
      summaries: JSON.parse(
        fs.readFileSync(`${dataPath}/summaries.json`, "utf-8")
      ),
    };
  }

  // Implement MCP tool handlers
  async handleListTeams(params: any) {
    return {
      items: this.data.teams,
      next_cursor: null,
    };
  }

  async handleListTeamMembers(params: { team_id: string }) {
    const members = this.data.teamMembers.filter(
      (m) => m.team === params.team_id
    );
    return {
      items: members,
      next_cursor: null,
    };
  }

  async handleListMeetings(params: any) {
    let meetings = this.data.meetings;

    // Apply filters
    if (params.created_after) {
      meetings = meetings.filter(
        (m) => new Date(m.created_at) > new Date(params.created_after)
      );
    }

    return {
      items: meetings,
      next_cursor: null,
    };
  }

  async handleGetTranscript(params: { recording_id: string }) {
    const recordingId = parseInt(params.recording_id, 10);
    const transcript = this.data.transcripts.find(
      (t) => t.recording_id === recordingId
    );

    if (!transcript) {
      throw new Error(`Transcript not found for recording ${recordingId}`);
    }

    return {
      transcript: transcript.transcripts,
    };
  }

  async handleGetSummary(params: { recording_id: string }) {
    const recordingId = parseInt(params.recording_id, 10);
    const summary = this.data.summaries.find(
      (s) => s.recording_id === recordingId
    );

    if (!summary) {
      throw new Error(`Summary not found for recording ${recordingId}`);
    }

    return summary;
  }
}
```

### 2.4 GitHub Mock Server

```typescript
// github-mock.ts
export class GitHubMockServer {
  private data: GitHubGeneratorOutput;

  constructor(dataPath: string) {
    // Load generated JSON files
  }

  async handleGetMe() {
    return this.data.user;
  }

  async handleSearchUsers(params: { query: string }) {
    // Parse query (e.g., "org:gragger")
    if (params.query.startsWith("org:")) {
      return {
        items: this.data.organizationMembers,
      };
    }
    return { items: [] };
  }

  async handleSearchRepositories(params: { query: string }) {
    // Parse query (e.g., "user:gragger")
    return {
      items: this.data.repositories,
    };
  }

  async handleListIssues(params: { owner: string; repo: string }) {
    const issues = this.data.issues.filter((issue) => {
      const repoUrl = issue.repository_url;
      return repoUrl.includes(`/${params.owner}/${params.repo}`);
    });

    return {
      issues,
    };
  }

  async handleListPullRequests(params: {
    owner: string;
    repo: string;
    state: string;
  }) {
    let prs = this.data.pullRequests.filter(
      (pr) =>
        pr.base.repo.owner.login === params.owner &&
        pr.base.repo.name === params.repo
    );

    if (params.state !== "all") {
      prs = prs.filter((pr) => pr.state === params.state);
    }

    return {
      pull_requests: prs,
    };
  }

  async handleListWorkflows(params: { owner: string; repo: string }) {
    const workflows = this.data.workflows.filter((w) =>
      w.url.includes(`/${params.owner}/${params.repo}/`)
    );

    return {
      workflows,
    };
  }

  async handleListWorkflowRuns(params: {
    owner: string;
    repo: string;
    workflow_id?: string;
  }) {
    let runs = this.data.workflowRuns.filter(
      (run) =>
        run.repository.owner.login === params.owner &&
        run.repository.name === params.repo
    );

    if (params.workflow_id) {
      runs = runs.filter(
        (run) => run.workflow_id === parseInt(params.workflow_id!, 10)
      );
    }

    return {
      workflow_runs: runs,
    };
  }

  // ... similar handlers for releases, discussions, alerts
}
```

### 2.5 Notion Mock Server

```typescript
// notion-mock.ts
export class NotionMockServer {
  private data: NotionGeneratorOutput;

  constructor(dataPath: string) {
    // Load generated JSON files
  }

  async handleGetUsers() {
    return {
      results: this.data.users,
      next_cursor: null,
    };
  }

  async handlePostSearch(params: any) {
    const filter = params.filter;

    if (filter?.value === "database") {
      return {
        results: this.data.databases,
        next_cursor: null,
      };
    }

    if (filter?.value === "page") {
      return {
        results: this.data.pages,
        next_cursor: null,
      };
    }

    return {
      results: [],
      next_cursor: null,
    };
  }

  async handleGetBlockChildren(params: { block_id: string }) {
    const blocks = this.data.blocks.get(params.block_id) || [];

    return {
      results: blocks,
      next_cursor: null,
    };
  }
}
```

---

## Phase 3: Update Generator Functions

### 3.1 Update Fathom Generator

**File:** `packages/benchmarking/src/mock-data-generator/generators/fathom.ts`

```typescript
export async function generateFathomTeams(
  count: number,
  context: GenerationContext
): Promise<FathomTeam[]> {
  const teams: FathomTeam[] = [];

  for (let i = 0; i < count; i++) {
    teams.push({
      id: `team_${i + 1}`,
      name: selectRandom(["Engineering", "Product", "Sales", "Marketing"]),
      created_at: generateRandomDate(
        context.startDate,
        context.endDate
      ).toISOString(),
      updated_at: generateRandomDate(
        context.startDate,
        context.endDate
      ).toISOString(),
    });
  }

  return teams;
}

export async function generateFathomTeamMembers(
  teams: FathomTeam[],
  context: GenerationContext
): Promise<FathomTeamMember[]> {
  const members: FathomTeamMember[] = [];

  for (const teamMember of COMPANY_DATA.teamMembers) {
    const team = selectRandom(teams);

    members.push({
      id: `member_${teamMember.email}`,
      team: team.id,
      name: teamMember.name,
      email: teamMember.email,
      role: teamMember.role || "member",
      created_at: generateRandomDate(
        context.startDate,
        context.endDate
      ).toISOString(),
      updated_at: generateRandomDate(
        context.startDate,
        context.endDate
      ).toISOString(),
    });
  }

  return members;
}

export async function generateFathomMeetings(
  count: number,
  teamMembers: FathomTeamMember[],
  context: GenerationContext
): Promise<FathomMeeting[]> {
  const meetings: FathomMeeting[] = [];

  for (let i = 0; i < count; i++) {
    const recordingId = 1000 + i;
    const scheduledStart = generateRandomDate(
      context.startDate,
      context.endDate
    );
    const scheduledEnd = new Date(scheduledStart.getTime() + 30 * 60 * 1000); // 30 min

    const recordedBy = selectRandom(teamMembers);
    const invitees = selectRandomMultiple(teamMembers, 2, 5);

    meetings.push({
      title: `Meeting ${i + 1}`,
      meeting_title: `Meeting ${i + 1}`,
      recording_id: recordingId,
      url: `https://app.fathom.video/recording/${recordingId}`,
      share_url: `https://app.fathom.video/share/${recordingId}`,
      created_at: scheduledStart.toISOString(),
      scheduled_start_time: scheduledStart.toISOString(),
      scheduled_end_time: scheduledEnd.toISOString(),
      recording_start_time: scheduledStart.toISOString(),
      recording_end_time: scheduledEnd.toISOString(),
      calendar_invitees_domains_type: "all",
      transcript_language: "en",
      calendar_invitees: invitees.map((member) => ({
        name: member.name,
        email: member.email,
        email_domain: member.email.split("@")[1],
        is_external: false,
      })),
      recorded_by: {
        name: recordedBy.name,
        email: recordedBy.email,
        email_domain: recordedBy.email.split("@")[1],
        team: recordedBy.team,
      },
      // NOTE: Do NOT include transcript, default_summary, or action_items
      // The adapter fetches these separately
    });
  }

  return meetings;
}

export async function generateFathomTranscripts(
  meetings: FathomMeeting[],
  context: GenerationContext
): Promise<FathomTranscript[]> {
  const transcripts: FathomTranscript[] = [];

  for (const meeting of meetings) {
    const segments = [];
    const speakers = meeting.calendar_invitees.slice(0, 3);

    for (let i = 0; i < 10; i++) {
      const speaker = selectRandom(speakers);
      segments.push({
        speaker: {
          display_name: speaker.name,
          matched_calendar_invitee_email: speaker.email,
        },
        text: `This is segment ${i + 1} of the transcript.`,
        timestamp: `00:${String(i).padStart(2, "0")}:00`,
      });
    }

    transcripts.push({
      type: "transcript",
      recording_id: meeting.recording_id,
      transcripts: segments,
    });
  }

  return transcripts;
}

export async function generateFathomSummaries(
  meetings: FathomMeeting[],
  context: GenerationContext
): Promise<FathomSummary[]> {
  const summaries: FathomSummary[] = [];

  for (const meeting of meetings) {
    summaries.push({
      type: "summary",
      recording_id: meeting.recording_id,
      summary: `Summary of ${meeting.title}`,
      template_name: "Default Summary",
      created_at: meeting.created_at,
    });
  }

  return summaries;
}
```

### 3.2 Similar Updates for GitHub, Notion, Slack

Apply the same pattern to other generators, ensuring they produce data matching the exact MCP client return structures.

---

## Phase 4: Output File Structure

### 4.1 Directory Structure

```
packages/benchmarking/output/
├── fathom/
│   ├── teams.json
│   ├── team-members.json
│   ├── meetings.json
│   ├── transcripts.json
│   └── summaries.json
├── github/
│   ├── user.json
│   ├── org-members.json
│   ├── repositories.json
│   ├── issues.json
│   ├── pull-requests.json
│   ├── workflows.json
│   ├── workflow-runs.json
│   ├── releases.json
│   ├── discussions.json
│   ├── code-alerts.json
│   └── dependabot-alerts.json
├── notion/
│   ├── users.json
│   ├── databases.json
│   ├── pages.json
│   └── blocks/
│       ├── {pageId}.json
│       └── ...
└── slack/
    ├── users.json
    ├── channels.json
    └── messages/
        ├── {channelId}.json
        └── ...
```

### 4.2 Save Functions

```typescript
// In main orchestrator
async function saveOutput(data: AllGeneratedData, outputDir: string) {
  // Fathom
  await fs.writeFile(
    path.join(outputDir, "fathom/teams.json"),
    JSON.stringify(data.fathom.teams, null, 2)
  );
  await fs.writeFile(
    path.join(outputDir, "fathom/team-members.json"),
    JSON.stringify(data.fathom.teamMembers, null, 2)
  );
  // ... etc

  // GitHub
  await fs.writeFile(
    path.join(outputDir, "github/user.json"),
    JSON.stringify(data.github.user, null, 2)
  );
  // ... etc

  // Notion
  await fs.writeFile(
    path.join(outputDir, "notion/users.json"),
    JSON.stringify(data.notion.users, null, 2)
  );
  // ... etc

  // Slack
  await fs.writeFile(
    path.join(outputDir, "slack/users.json"),
    JSON.stringify(data.slack.users, null, 2)
  );
  // ... etc
}
```

---

## Phase 5: Testing Strategy

### 5.1 Unit Tests

Test each generator function to ensure it produces valid data:

```typescript
describe("Fathom Generator", () => {
  it("should generate valid teams", () => {
    const teams = generateFathomTeams(5, context);
    expect(teams).toHaveLength(5);
    expect(teams[0]).toHaveProperty("id");
    expect(teams[0]).toHaveProperty("name");
  });

  it("should generate team members referencing valid teams", () => {
    const teams = generateFathomTeams(2, context);
    const members = generateFathomTeamMembers(teams, context);

    members.forEach((member) => {
      expect(teams.some((t) => t.id === member.team)).toBe(true);
    });
  });
});
```

### 5.2 Integration Tests

Test the mock MCP server with actual adapters:

```typescript
describe("Fathom Mock Server Integration", () => {
  it("should work with FathomAdapter", async () => {
    const mockServer = new FathomMockServer("./output/fathom");
    const adapter = new FathomAdapter(mockServer, config);

    const records = [];
    for await (const batch of adapter.fetchAll()) {
      records.push(...batch);
    }

    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toHaveProperty("_id");
    expect(records[0]).toHaveProperty("source", "fathom");
  });
});
```

---

## Phase 6: Documentation

### 6.1 Update README

Add sections explaining:

- How to generate mock data
- How to use the mock MCP server
- How to test with actual adapters

### 6.2 Add Examples

Provide example commands and expected outputs.

---

## Summary

This implementation plan ensures that:

1. ✅ Generated data matches exact MCP client return structures
2. ✅ Mock MCP server can serve data to existing adapters
3. ✅ No changes needed to existing adapter code
4. ✅ Data relationships are maintained (e.g., transcripts reference meetings)
5. ✅ Output is organized and easy to inspect
6. ✅ Testing strategy validates correctness

The key insight is that the mock data generator should produce **exactly** what the MCP clients return, not what the adapters transform into. This allows the existing adapter code to work unchanged.
