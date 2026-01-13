// Import existing types from server package
import type {
  GitHubIssue,
  GitHubPullRequest,
  GitHubUser,
  GitHubRepository,
  GitHubWorkflow,
  GitHubWorkflowRun,
  GitHubRelease,
  GitHubDiscussion,
  GitHubCodeScanningAlert,
  GitHubDependabotAlert,
  NotionPage,
  NotionUser,
  NotionDatabase,
  NotionBlock,
  FathomMeeting,
  FathomUser,
  FathomTranscript,
  FathomSummary,
  FathomTeam,
  FathomTeamMember,
} from '@ebee-oss/shared-util';

// Slack types (using @slack/web-api)
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse.js';
import type { Channel } from '@slack/web-api/dist/types/response/ConversationsListResponse.js';
import type { Member } from '@slack/web-api/dist/types/response/UsersListResponse.js';

// Category types for internal tracking
export type WorkCategory = 'work-related' | 'work-adjacent' | 'casual';
export type NotionCategory = 'work' | 'personal';
export type MeetingType = 'work' | 'social';

// Generator output types (matching MCP client returns)
export interface FathomGeneratorOutput {
  teams: FathomTeam[];
  teamMembers: FathomTeamMember[];
  meetings: FathomMeeting[];
  transcripts: FathomTranscript[];
  summaries: FathomSummary[];
}

export interface GitHubGeneratorOutput {
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

export interface NotionGeneratorOutput {
  users: NotionUser[];
  databases: NotionDatabase[];
  pages: NotionPage[];
  blocks: Map<string, NotionBlock[]>; // pageId -> blocks
}

export interface SlackGeneratorOutput {
  users: Member[];
  channels: Channel[];
  messages: Map<string, MessageElement[]>; // channelId -> messages
}

export interface AllGeneratedData {
  fathom: FathomGeneratorOutput;
  github: GitHubGeneratorOutput;
  notion: NotionGeneratorOutput;
  slack: SlackGeneratorOutput;
}

// Configuration
export interface GeneratorConfig {
  timelineDays: number;
  temperature: number;
  batchSize: number;
  maxRetries: number;
  rateLimitDelay: number;
  outputDir: string;
  concurrency: number;
}

// Volume calculations
export interface VolumeConfig {
  slackMessages: number;
  githubIssues: number;
  githubPRs: number;
  notionPages: number;
  fathomMeetings: number;
}

// Generation context for creating related data
export interface GenerationContext {
  startDate: Date;
  endDate: Date;
  config: GeneratorConfig;
}

// Context for creating relationships between data
export interface RelationshipContext {
  // GitHub
  repositories?: GitHubRepository[];
  issues?: GitHubIssue[];
  pullRequests?: GitHubPullRequest[];
  workflows?: GitHubWorkflow[];

  // Fathom
  meetings?: FathomMeeting[];
  transcripts?: FathomTranscript[];
  summaries?: FathomSummary[];
  teams?: FathomTeam[];
  teamMembers?: FathomTeamMember[];

  // Notion
  pages?: NotionPage[];
  databases?: NotionDatabase[];
  blocks?: NotionBlock[];

  // Slack
  channels?: Channel[];
  messages?: MessageElement[];
  users?: Member[];
}

// Categorized context for work vs casual data
export interface CategorizedContext {
  work: RelationshipContext;
  casual: RelationshipContext;
}
