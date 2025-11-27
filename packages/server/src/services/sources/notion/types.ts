// Notion entity types for the indexer

export interface NotionUser {
  object: "user";
  id: string;
  type: "person" | "bot";
  name: string;
  avatar_url?: string;
  person?: {
    email: string;
  };
  bot?: {
    owner: {
      type: string;
      workspace?: boolean;
    };
    workspace_name?: string;
  };
}

export interface NotionPage {
  object: "page";
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: { object: "user"; id: string };
  last_edited_by: { object: "user"; id: string };
  cover?: {
    type: string;
    [key: string]: any;
  };
  icon?: {
    type: string;
    [key: string]: any;
  };
  parent: {
    type: string;
    [key: string]: any;
  };
  archived: boolean;
  properties: Record<string, any>;
  url: string;
  public_url?: string;
}

export interface NotionDatabase {
  object: "database";
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: { object: "user"; id: string };
  last_edited_by: { object: "user"; id: string };
  title: Array<{
    type: string;
    text: { content: string };
  }>;
  description: Array<{
    type: string;
    text: { content: string };
  }>;
  icon?: {
    type: string;
    [key: string]: any;
  };
  cover?: {
    type: string;
    [key: string]: any;
  };
  properties: Record<string, any>;
  parent: {
    type: string;
    [key: string]: any;
  };
  url: string;
  archived: boolean;
}

export interface NotionBlock {
  object: "block";
  id: string;
  parent: {
    type: string;
    [key: string]: any;
  };
  created_time: string;
  last_edited_time: string;
  created_by: { object: "user"; id: string };
  last_edited_by: { object: "user"; id: string };
  has_children: boolean;
  archived: boolean;
  type: string;
  [key: string]: any; // Block type-specific content
}

export interface NotionComment {
  object: "comment";
  id: string;
  parent: {
    type: string;
    [key: string]: any;
  };
  discussion_id: string;
  created_time: string;
  last_edited_time: string;
  created_by: { object: "user"; id: string };
  rich_text: Array<{
    type: string;
    text: { content: string };
    [key: string]: any;
  }>;
}

export interface PaginatedResponse<T> {
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface IndexerProgress {
  job_id: string;
  started_at: string;
  status: "running" | "completed" | "failed" | "paused";
  current_phase: string;
  progress: {
    users: { total: number; processed: number };
    databases: { total: number; processed: number };
    pages: { total: number; processed: number };
    blocks: { total: number; processed: number };
    comments: { total: number; processed: number };
  };
  errors: Array<{
    entity_id: string;
    entity_type: string;
    error: string;
    timestamp: string;
  }>;
  last_updated: string;
}

export interface IndexerOptions {
  include_comments: boolean;
  include_archived: boolean;
  since?: string; // ISO timestamp for incremental sync
  max_retries: number;
  rate_limit_delay: number; // milliseconds
}

export interface IndexerResult {
  success: boolean;
  job_id: string;
  progress: IndexerProgress;
  summary: {
    total_entities: number;
    successful: number;
    failed: number;
    duration_ms: number;
  };
}
