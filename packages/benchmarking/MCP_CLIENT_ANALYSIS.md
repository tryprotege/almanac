# MCP Client Method Analysis

This document maps each adapter's `fetchAll()` method to the specific MCP client calls it makes, showing exactly what data structures need to be generated.

---

## 1. Fathom Adapter

### MCP Client Methods Called (in order):

#### 1.1 `listTeams()` → `FathomTeam[]`

```typescript
{
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}
```

#### 1.2 `listTeamMembers(teamId)` → `FathomTeamMember[]`

```typescript
{
  id?: string;
  team: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}
```

#### 1.3 `listMeetings(params)` → `FathomMeeting[]`

```typescript
{
  title: string;
  meeting_title: string;
  recording_id: number;
  url: string;
  share_url?: string;
  created_at: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  recording_start_time: string;
  recording_end_time: string;
  calendar_invitees_domains_type: string;
  transcript_language: string;
  calendar_invitees: FathomCalendarInvitee[];
  recorded_by: FathomUser;
  // Note: transcript, default_summary, action_items are NOT included
  // because include_summary/include_transcript/include_action_items are false
}
```

#### 1.4 `getTranscript(recordingId)` → `FathomTranscript`

```typescript
{
  type?: string;
  recording_id: number;
  transcripts: {
    speaker: {
      display_name: string;
      matched_calendar_invitee_email?: string;
    };
    text: string;
    timestamp: string;
  }[];
}
```

#### 1.5 `getSummary(recordingId)` → `FathomSummary`

```typescript
{
  type: string;
  recording_id: number;
  summary: string;
  template_name?: string;
  created_at: string;
}
```

### Mock Data Generator Output Structure:

```typescript
{
  teams: FathomTeam[];
  teamMembers: FathomTeamMember[];
  meetings: FathomMeeting[];
  transcripts: FathomTranscript[];
  summaries: FathomSummary[];
}
```

---

## 2. GitHub Adapter

### MCP Client Methods Called (in order):

#### 2.1 `getMe()` → `GitHubUser`

```typescript
{
  login: string;
  id: number;
  avatar_url: string;
  name?: string;
  email?: string;
  bio?: string;
  company?: string;
  location?: string;
  created_at: string;
  updated_at?: string;
}
```

#### 2.2 `listOrganizationMembers(login)` → `GitHubUser[]`

Same structure as above

#### 2.3 `listRepositories(owner)` → `GitHubRepository[]`

```typescript
{
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
    avatar_url: string;
  };
  description?: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  language?: string;
  topics?: string[];
  created_at: string;
  updated_at: string;
  pushed_at?: string;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
}
```

#### 2.4 For each repository:

##### 2.4.1 `listIssues(owner, repo)` → `GitHubIssue[]`

```typescript
{
  id: number;
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed";
  user: {
    login: string;
    id: number;
    avatar_url: string;
  };
  assignees?: Array<{
    login: string;
    id: number;
    avatar_url: string;
  }>;
  labels?: Array<{
    name: string;
    color: string;
  }>;
  milestone?: {
    id: number;
    title: string;
  };
  created_at: string;
  updated_at: string;
  closed_at?: string;
  repository_url: string;
}
```

##### 2.4.2 `listPullRequests(owner, repo, "all")` → `GitHubPullRequest[]`

```typescript
{
  id: number;
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  merged_at?: string;
  user: {
    login: string;
    id: number;
    avatar_url: string;
  };
  assignees?: Array<{
    login: string;
    id: number;
    avatar_url: string;
  }>;
  requested_reviewers?: Array<{
    login: string;
    id: number;
    avatar_url: string;
  }>;
  merged_by?: {
    login: string;
    id: number;
    avatar_url: string;
  };
  labels?: Array<{
    name: string;
    color: string;
  }>;
  head: {
    ref: string;
    sha: string;
    repo: {
      name: string;
      owner: {
        login: string;
      };
    };
  };
  base: {
    ref: string;
    sha: string;
    repo: {
      name: string;
      owner: {
        login: string;
      };
    };
  };
  created_at: string;
  updated_at: string;
}
```

##### 2.4.3 `listWorkflows(owner, repo)` → `GitHubWorkflow[]`

```typescript
{
  id: number;
  name: string;
  path: string;
  state: "active" | "disabled";
  badge_url: string;
  url: string;
  created_at: string;
  updated_at: string;
}
```

##### 2.4.4 For each workflow: `listWorkflowRuns(owner, repo, workflowId)` → `GitHubWorkflowRun[]`

```typescript
{
  id: number;
  name: string;
  workflow_id: number;
  run_number: number;
  event: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "cancelled" | "skipped";
  head_branch: string;
  head_sha: string;
  actor: {
    login: string;
    id: number;
    avatar_url: string;
  };
  triggering_actor: {
    login: string;
    id: number;
    avatar_url: string;
  };
  repository: {
    name: string;
    owner: {
      login: string;
    };
  };
  created_at: string;
  updated_at: string;
}
```

##### 2.4.5 `listReleases(owner, repo)` → `GitHubRelease[]`

```typescript
{
  id: number;
  tag_name: string;
  name?: string;
  body?: string;
  draft: boolean;
  prerelease: boolean;
  author: {
    login: string;
    id: number;
    avatar_url: string;
  };
  assets: Array<{
    name: string;
    size: number;
    download_count: number;
  }>;
  published_at: string;
  html_url: string;
}
```

##### 2.4.6 `listDiscussions(owner, repo)` → `GitHubDiscussion[]`

```typescript
{
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  user: {
    login: string;
    id: number;
    avatar_url: string;
  };
  answer_chosen_by?: {
    login: string;
    id: number;
    avatar_url: string;
  };
  category: {
    name: string;
  };
  created_at: string;
  updated_at: string;
  repository_url: string;
}
```

##### 2.4.7 `listCodeScanningAlerts(owner, repo)` → `GitHubCodeScanningAlert[]`

```typescript
{
  number: number;
  state: "open" | "dismissed" | "fixed";
  rule: {
    name: string;
    description: string;
    severity: "error" | "warning" | "note";
    tags: string[];
  };
  tool: {
    name: string;
  };
  dismissed_by?: {
    login: string;
    id: number;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  url: string;
}
```

##### 2.4.8 `listDependabotAlerts(owner, repo)` → `GitHubDependabotAlert[]`

```typescript
{
  number: number;
  state: "auto_dismissed" | "dismissed" | "fixed" | "open";
  security_advisory: {
    summary: string;
    description: string;
    severity: "low" | "medium" | "high" | "critical";
  };
  dependency: {
    package: {
      ecosystem: string;
      name: string;
    };
  };
  dismissed_by?: {
    login: string;
    id: number;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  url: string;
}
```

### Mock Data Generator Output Structure:

```typescript
{
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

---

## 3. Notion Adapter

### MCP Client Methods Called (in order):

#### 3.1 `getAllUsers()` → `NotionUser[]`

```typescript
{
  object: "user";
  id: string;
  type: "person" | "bot";
  name?: string;
  avatar_url?: string;
  person?: {
    email?: string;
  };
  bot?: {
    owner: {
      type: "workspace";
      workspace: boolean;
    };
  };
}
```

#### 3.2 `searchAllDatabases()` → `NotionDatabase[]`

```typescript
{
  object: "database";
  id: string;
  title: Array<{
    type: "text";
    text: {
      content: string;
    };
  }>;
  description?: Array<{
    type: "text";
    text: {
      content: string;
    };
  }>;
  created_time: string;
  last_edited_time: string;
  created_by: {
    object: "user";
    id: string;
  };
  last_edited_by: {
    object: "user";
    id: string;
  };
  parent: {
    type: "page_id" | "workspace";
    page_id?: string;
    workspace?: boolean;
  };
  properties: Record<string, any>;
  archived: boolean;
}
```

#### 3.3 `searchAllPages()` → `NotionPage[]`

```typescript
{
  object: "page";
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: {
    object: "user";
    id: string;
  };
  last_edited_by: {
    object: "user";
    id: string;
  };
  parent: {
    type: "database_id" | "page_id" | "workspace";
    database_id?: string;
    page_id?: string;
    workspace?: boolean;
  };
  properties: Record<string, any>;
  archived: boolean;
  url: string;
}
```

#### 3.4 For each page: `getAllBlocksRecursive(pageId)` → `NotionBlock[]`

```typescript
{
  object: "block";
  id: string;
  type: string; // "paragraph", "heading_1", "heading_2", etc.
  created_time: string;
  last_edited_time: string;
  has_children: boolean;
  archived: boolean;
  // Type-specific content (e.g., paragraph, heading_1, etc.)
  [type]: {
    rich_text?: Array<{
      type: "text";
      text: {
        content: string;
      };
    }>;
    // Other type-specific fields
  };
}
```

### Mock Data Generator Output Structure:

```typescript
{
  users: NotionUser[];
  databases: NotionDatabase[];
  pages: NotionPage[];
  blocks: Map<string, NotionBlock[]>; // pageId -> blocks
}
```

---

## 4. Slack Adapter

### Slack Client Methods Called (in order):

#### 4.1 `getAllUsers()` → `Member[]` (from @slack/web-api)

```typescript
{
  id: string;
  name?: string;
  real_name?: string;
  profile?: {
    title?: string;
    status_text?: string;
    email?: string;
  };
  updated?: number; // Unix timestamp
  is_bot?: boolean;
  deleted?: boolean;
}
```

#### 4.2 `getAllChannels()` → `Channel[]` (from @slack/web-api)

```typescript
{
  id: string;
  name?: string;
  is_channel?: boolean;
  is_private?: boolean;
  is_archived?: boolean;
  creator?: string;
  topic?: {
    value?: string;
  };
  purpose?: {
    value?: string;
  };
  updated?: number; // Unix timestamp
}
```

#### 4.3 For each channel: `getAllChannelMessagesWithThreads(channelId)` → `MessageElement[]`

```typescript
{
  type: "message";
  ts: string; // Timestamp as string (e.g., "1234567890.123456")
  user?: string;
  text?: string;
  thread_ts?: string; // If part of a thread
  reply_count?: number; // If this message has replies
  reactions?: Array<{
    name: string;
    users?: string[];
    count: number;
  }>;
}
```

### Mock Data Generator Output Structure:

```typescript
{
  users: Member[];
  channels: Channel[];
  messages: Map<string, MessageElement[]>; // channelId -> messages
}
```

---

## Summary: What the Mock Data Generator Must Produce

The mock data generator should output JSON files that can be directly consumed by a mock MCP server. The structure should be:

```
output/
├── fathom/
│   ├── teams.json              # FathomTeam[]
│   ├── team-members.json       # FathomTeamMember[]
│   ├── meetings.json           # FathomMeeting[]
│   ├── transcripts.json        # FathomTranscript[]
│   └── summaries.json          # FathomSummary[]
├── github/
│   ├── user.json               # GitHubUser
│   ├── org-members.json        # GitHubUser[]
│   ├── repositories.json       # GitHubRepository[]
│   ├── issues.json             # GitHubIssue[]
│   ├── pull-requests.json      # GitHubPullRequest[]
│   ├── workflows.json          # GitHubWorkflow[]
│   ├── workflow-runs.json      # GitHubWorkflowRun[]
│   ├── releases.json           # GitHubRelease[]
│   ├── discussions.json        # GitHubDiscussion[]
│   ├── code-alerts.json        # GitHubCodeScanningAlert[]
│   └── dependabot-alerts.json  # GitHubDependabotAlert[]
├── notion/
│   ├── users.json              # NotionUser[]
│   ├── databases.json          # NotionDatabase[]
│   ├── pages.json              # NotionPage[]
│   └── blocks/
│       ├── {pageId}.json       # NotionBlock[] for each page
│       └── ...
└── slack/
    ├── users.json              # Member[]
    ├── channels.json           # Channel[]
    └── messages/
        ├── {channelId}.json    # MessageElement[] for each channel
        └── ...
```

Each JSON file should contain data that exactly matches the TypeScript interfaces shown above.
