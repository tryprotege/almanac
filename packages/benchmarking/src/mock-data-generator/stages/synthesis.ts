import type {
  AllGeneratedData,
  GeneratorConfig,
  VolumeConfig,
  GenerationContext,
} from '../types.js';
import { generateTimeline, generateTimelineFromDate } from '../utils/dates.js';
import { generateSlackMessages } from '../generators/slack.js';
import { generateGitHubIssues, generateGitHubPRs } from '../generators/github.js';
import { generateNotionPages } from '../generators/notion.js';
import {
  generateFathomMeetings,
  generateFathomTranscripts,
  generateFathomSummaries,
} from '../generators/fathom.js';
import { buildSynthesisContext } from '../context/builder.js';

/**
 * Stage 4: Synthesis - Generate data with complex multi-hop relationships
 * Functional approach - no classes
 */

export async function generateSynthesis(
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
  config: GeneratorConfig,
  volumes: VolumeConfig,
  startDate?: Date,
): Promise<{
  slack: any[];
  github: { issues: any[]; prs: any[] };
  notion: any[];
  fathom: any[];
  fathomTranscripts: any[];
  fathomSummaries: any[];
}> {
  console.log('🎯 Stage 4: Synthesis (20% of data)');

  // Build full context from foundation + connection + integration
  const categorizedContext = buildSynthesisContext(foundation, connection, integration);

  const timeline = startDate
    ? generateTimelineFromDate(startDate, config.timelineDays)
    : generateTimeline(config.timelineDays);

  const generationContext: GenerationContext = {
    startDate: timeline[0],
    endDate: timeline[timeline.length - 1],
    config,
  };

  // Calculate 20% of volumes for synthesis stage
  const synthesisVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.2),
    githubIssues: Math.floor(volumes.githubIssues * 0.2),
    githubPRs: Math.floor(volumes.githubPRs * 0.2),
    notionPages: Math.floor(volumes.notionPages * 0.2),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
  };

  // Split Fathom meetings: 80% work, 20% casual
  const workMeetingsCount = Math.floor(synthesisVolumes.fathomMeetings * 0.8);
  const casualMeetingsCount = synthesisVolumes.fathomMeetings - workMeetingsCount;

  const [workMeetings, casualMeetings] = await Promise.all([
    generateFathomMeetings(
      workMeetingsCount,
      foundation.fathom.teamMembers,
      generationContext,
      4000, // Synthesis: IDs 4000+
    ),
    generateFathomMeetings(
      casualMeetingsCount,
      foundation.fathom.teamMembers,
      generationContext,
      4000 + workMeetingsCount, // Synthesis casual: IDs 4000 + work count
    ),
  ]);

  // Combine meetings
  const fathomMeetings = [...workMeetings, ...casualMeetings];

  const [
    slackMessages,
    githubIssues,
    githubPRs,
    notionPages,
    workTranscripts,
    casualTranscripts,
    workSummaries,
    casualSummaries,
  ] = await Promise.all([
    generateSlackMessages(
      synthesisVolumes.slackMessages,
      timeline,
      config,
      categorizedContext.work,
      foundation.slack.users,
      foundation.slack.channels,
    ),
    generateGitHubIssues(synthesisVolumes.githubIssues, timeline, config, categorizedContext.work),
    generateGitHubPRs(synthesisVolumes.githubPRs, timeline, config, categorizedContext.work),
    generateNotionPages(synthesisVolumes.notionPages, timeline, config, categorizedContext.work),
    generateFathomTranscripts(workMeetings, config, categorizedContext.work),
    generateFathomTranscripts(casualMeetings, config, categorizedContext.casual),
    generateFathomSummaries(workMeetings, config, categorizedContext.work),
    generateFathomSummaries(casualMeetings, config, categorizedContext.casual),
  ]);

  const fathomTranscripts = [...workTranscripts, ...casualTranscripts];
  const fathomSummaries = [...workSummaries, ...casualSummaries];

  console.log(`✅ Generated ${slackMessages.length} synthesis Slack messages`);
  console.log(`✅ Generated ${githubIssues.length} synthesis GitHub issues`);
  console.log(`✅ Generated ${githubPRs.length} synthesis GitHub PRs`);
  console.log(`✅ Generated ${notionPages.length} synthesis Notion pages`);
  console.log(
    `✅ Generated ${fathomMeetings.length} synthesis Fathom meetings (${workMeetingsCount} work, ${casualMeetingsCount} casual)`,
  );
  console.log(`✅ Generated ${fathomTranscripts.length} Fathom transcripts with full context`);
  console.log(`✅ Generated ${fathomSummaries.length} Fathom summaries with full context`);

  return {
    slack: slackMessages,
    github: {
      issues: githubIssues,
      prs: githubPRs,
    },
    notion: notionPages,
    fathom: fathomMeetings,
    fathomTranscripts,
    fathomSummaries,
  };
}
