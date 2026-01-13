import type {
  GitHubIssue,
  GitHubPullRequest,
  NotionPage,
  FathomMeeting,
  FathomTranscript,
} from '@ebee-oss/shared-util';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse.js';

/**
 * Workflow templates define common patterns of cross-service interactions
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stages: WorkflowStage[];
  frequency: number; // Weight for random selection
}

export interface WorkflowStage {
  order: number;
  service: 'github' | 'slack' | 'notion' | 'fathom';
  type: string; // "issue", "message", "page", "meeting", etc.
  delayFromPrevious: { min: number; max: number }; // hours
  references: string[]; // Which previous stages this references (by order number as string)
}

export interface WorkflowInstance {
  templateId: string;
  topic: string;
  artifacts: Map<string, any>; // stage order -> generated artifact
  timeline: Date[]; // When each stage occurred
}

/**
 * Workflow topics represent coherent subjects that span all services
 */
export interface WorkflowTopic {
  id: string;
  title: string;
  description: string;
  category: 'bug' | 'feature' | 'infrastructure' | 'design' | 'process';
  technicalDetails: string;
  affectedRepo: string;
  participants: string[]; // Team member names
}

/**
 * Extended message type with channel info
 */
export interface MessageWithChannel extends MessageElement {
  channel?: string;
}

/**
 * Cross-reference chain for deterministic linking
 */
export interface CrossReferenceChain {
  githubIssue?: GitHubIssue;
  slackThread?: MessageWithChannel[];
  notionPage?: NotionPage;
  fathomMeeting?: FathomMeeting;
  fathomTranscript?: FathomTranscript;
  pullRequest?: GitHubPullRequest;
}
