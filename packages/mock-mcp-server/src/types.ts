import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";
import type { Channel } from "@slack/web-api/dist/types/response/ConversationsListResponse.js";
import type { Member } from "@slack/web-api/dist/types/response/UsersListResponse.js";

/**
 * Supported source types
 */
export type SourceType = "slack" | "fathom" | "notion" | "github";

/**
 * Extended MessageElement with channel property
 */
export interface MessageWithChannel extends MessageElement {
  channel?: string;
}

/**
 * Mock data structure loaded from JSON
 */
export interface MockData {
  slack?: {
    channels: Channel[];
    users: Member[];
    messages: MessageWithChannel[];
  };
  github?: {
    user: any;
    organizationMembers: any[];
    repositories: any[];
    issues: any[];
    pullRequests: any[];
    workflows?: any[];
    workflowRuns?: any[];
    releases?: any[];
    discussions?: any[];
    codeScanningAlerts?: any[];
    dependabotAlerts?: any[];
  };
  notion?: {
    users: any[];
    databases: any[];
    pages: any[];
    blocks: any[];
  };
  fathom?: {
    teams: any[];
    teamMembers: any[];
    meetings: any[];
    transcripts: any[];
    summaries: any[];
  };
}

/**
 * Tool input schemas - Slack
 */
export interface ListChannelsInput {
  types?: string;
}

export interface ListUsersInput {
  // No parameters needed
}

export interface GetChannelMessagesInput {
  channel_id: string;
  limit?: number;
  oldest?: string;
  latest?: string;
}

export interface SearchMessagesInput {
  query: string;
  channel_id?: string;
  limit?: number;
}

export interface GetUserInfoInput {
  user_id: string;
}

export interface GetChannelInfoInput {
  channel_id: string;
}

/**
 * Tool input schemas - GitHub
 */
export interface ListRepositoriesInput {
  // No parameters needed
}

export interface ListIssuesInput {
  repo?: string;
  state?: "open" | "closed" | "all";
  limit?: number;
}

export interface ListPullRequestsInput {
  repo?: string;
  state?: "open" | "closed" | "all";
  limit?: number;
}

export interface GetIssueInput {
  issue_number: number;
}

export interface GetPullRequestInput {
  pr_number: number;
}

/**
 * Tool input schemas - Notion
 */
export interface ListDatabasesInput {
  // No parameters needed
}

export interface ListPagesInput {
  database_id?: string;
  limit?: number;
}

export interface GetPageInput {
  page_id: string;
}

export interface SearchPagesInput {
  query: string;
  limit?: number;
}

/**
 * Tool input schemas - Fathom
 */
export interface ListMeetingsInput {
  limit?: number;
  start_date?: string;
  end_date?: string;
}

export interface GetMeetingInput {
  meeting_id: string;
}

export interface GetTranscriptInput {
  recording_id: string;
}

export interface GetSummaryInput {
  recording_id: string;
}

export interface SearchMeetingsInput {
  query: string;
  limit?: number;
}
