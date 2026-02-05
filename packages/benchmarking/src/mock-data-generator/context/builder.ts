import type { AllGeneratedData, CategorizedContext, RelationshipContext } from '../types.js';
import { buildWorkContext, buildCasualContext } from './filter.js';

/**
 * Build contexts for each generation stage
 * Properly accumulates data from all providers (GitHub, Slack, Notion, Fathom)
 * Including transcripts, summaries, and blocks
 */

export function buildFoundationContext(): null {
  // Foundation stage has no context
  return null;
}

export function buildConnectionContext(foundation: AllGeneratedData): CategorizedContext {
  return {
    work: buildWorkContext(foundation) as RelationshipContext,
    casual: buildCasualContext(foundation) as RelationshipContext,
  };
}

export function buildIntegrationContext(
  foundation: AllGeneratedData,
  connection: {
    slack: any[];
    notion: any[];
    fathom: any[];
    fathomTranscripts: any[];
    fathomSummaries: any[];
    githubPRs: any[];
  },
): CategorizedContext {
  // Build base contexts from foundation
  const workContext = buildWorkContext(foundation) as RelationshipContext;
  const casualContext = buildCasualContext(foundation) as RelationshipContext;

  // Merge connection stage data into contexts
  // Work context gets connection PRs and work-related Slack/Notion
  const enrichedWorkContext: RelationshipContext = {
    ...workContext,
    pullRequests: [...(workContext.pullRequests || []), ...(connection.githubPRs || [])],
    messages: [
      ...(workContext.messages || []),
      ...(connection.slack?.filter((msg: any) => msg.category === 'work-related') || []),
    ],
    pages: [
      ...(workContext.pages || []),
      ...(connection.notion?.filter((page: any) => page.category === 'work') || []),
    ],
    meetings: [
      ...(workContext.meetings || []),
      ...(connection.fathom?.filter((m: any) => m.type === 'work') || []),
    ],
    transcripts: [...(workContext.transcripts || []), ...(connection.fathomTranscripts || [])],
    summaries: [...(workContext.summaries || []), ...(connection.fathomSummaries || [])],
  };

  // Casual context gets casual Slack/Notion and social meetings
  const enrichedCasualContext: RelationshipContext = {
    ...casualContext,
    messages: [
      ...(casualContext.messages || []),
      ...(connection.slack?.filter((msg: any) => msg.category === 'casual') || []),
    ],
    pages: [
      ...(casualContext.pages || []),
      ...(connection.notion?.filter((page: any) => page.category === 'personal') || []),
    ],
    meetings: [
      ...(casualContext.meetings || []),
      ...(connection.fathom?.filter((m: any) => m.type === 'social') || []),
    ],
  };

  return {
    work: enrichedWorkContext,
    casual: enrichedCasualContext,
  };
}

export function buildSynthesisContext(
  foundation: AllGeneratedData,
  connection: {
    slack: any[];
    notion: any[];
    fathom: any[];
    fathomTranscripts: any[];
    fathomSummaries: any[];
    githubPRs: any[];
  },
  integration: {
    slack: any[];
    github: { issues: any[]; prs: any[] };
    notion: any[];
    fathom: any[];
    fathomTranscripts: any[];
    fathomSummaries: any[];
  },
): CategorizedContext {
  // Build base contexts from foundation
  const workContext = buildWorkContext(foundation) as RelationshipContext;
  const casualContext = buildCasualContext(foundation) as RelationshipContext;

  // Merge ALL previous stages into full contexts
  const fullWorkContext: RelationshipContext = {
    ...workContext,
    // Add connection PRs
    pullRequests: [
      ...(workContext.pullRequests || []),
      ...(connection.githubPRs || []),
      ...(integration.github?.prs || []),
    ],
    // Add connection + integration issues
    issues: [...(workContext.issues || []), ...(integration.github?.issues || [])],
    // Add connection + integration work Slack
    messages: [
      ...(workContext.messages || []),
      ...(connection.slack?.filter((msg: any) => msg.category === 'work-related') || []),
      ...(integration.slack?.filter((msg: any) => msg.category === 'work-related') || []),
    ],
    // Add connection + integration work Notion
    pages: [
      ...(workContext.pages || []),
      ...(connection.notion?.filter((page: any) => page.category === 'work') || []),
      ...(integration.notion?.filter((page: any) => page.category === 'work') || []),
    ],
    // Add connection + integration work meetings
    meetings: [
      ...(workContext.meetings || []),
      ...(connection.fathom?.filter((m: any) => m.type === 'work') || []),
      ...(integration.fathom?.filter((m: any) => m.type === 'work') || []),
    ],
    // Add all transcripts and summaries
    transcripts: [
      ...(workContext.transcripts || []),
      ...(connection.fathomTranscripts || []),
      ...(integration.fathomTranscripts || []),
    ],
    summaries: [
      ...(workContext.summaries || []),
      ...(connection.fathomSummaries || []),
      ...(integration.fathomSummaries || []),
    ],
  };

  // Full casual context with all stages
  const fullCasualContext: RelationshipContext = {
    ...casualContext,
    messages: [
      ...(casualContext.messages || []),
      ...(connection.slack?.filter((msg: any) => msg.category === 'casual') || []),
      ...(integration.slack?.filter((msg: any) => msg.category === 'casual') || []),
    ],
    pages: [
      ...(casualContext.pages || []),
      ...(connection.notion?.filter((page: any) => page.category === 'personal') || []),
      ...(integration.notion?.filter((page: any) => page.category === 'personal') || []),
    ],
    meetings: [
      ...(casualContext.meetings || []),
      ...(connection.fathom?.filter((m: any) => m.type === 'social') || []),
      ...(integration.fathom?.filter((m: any) => m.type === 'social') || []),
    ],
  };

  return {
    work: fullWorkContext,
    casual: fullCasualContext,
  };
}
