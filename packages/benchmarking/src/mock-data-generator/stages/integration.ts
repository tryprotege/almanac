import type {
  AllGeneratedData,
  GeneratorConfig,
  VolumeConfig,
  GenerationContext,
} from "../types.js";
import { generateTimeline, generateTimelineFromDate } from "../utils/dates.js";
import { generateSlackMessages } from "../generators/slack.js";
import {
  generateGitHubIssues,
  generateGitHubPRs,
} from "../generators/github.js";
import { generateNotionPages } from "../generators/notion.js";
import {
  generateFathomMeetings,
  generateFathomTranscripts,
  generateFathomSummaries,
} from "../generators/fathom.js";
import { buildIntegrationContext } from "../context/builder.js";

/**
 * Stage 3: Integration - Generate data with deep links
 * Functional approach - no classes
 */

export async function generateIntegration(
  foundation: AllGeneratedData,
  connection: {
    slack: any[];
    notion: any[];
    fathom: any[];
    fathomTranscripts: any[];
    fathomSummaries: any[];
    githubPRs: any[];
  },
  config: GeneratorConfig,
  volumes: VolumeConfig,
  startDate?: Date
): Promise<{
  slack: any[];
  github: { issues: any[]; prs: any[] };
  notion: any[];
  fathom: any[];
  fathomTranscripts: any[];
  fathomSummaries: any[];
}> {
  console.log("🔀 Stage 3: Integration (20% of data)");

  // Build enriched context from foundation + connection
  const categorizedContext = buildIntegrationContext(foundation, connection);

  const timeline = startDate
    ? generateTimelineFromDate(startDate, config.timelineDays)
    : generateTimeline(config.timelineDays);

  const generationContext: GenerationContext = {
    startDate: timeline[0],
    endDate: timeline[timeline.length - 1],
    config,
  };

  // Calculate 20% of volumes for integration stage
  const integrationVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.2),
    githubIssues: Math.floor(volumes.githubIssues * 0.2),
    githubPRs: Math.floor(volumes.githubPRs * 0.2),
    notionPages: Math.floor(volumes.notionPages * 0.2),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
  };

  // Split Fathom meetings: 80% work, 20% casual
  const workMeetingsCount = Math.floor(integrationVolumes.fathomMeetings * 0.8);
  const casualMeetingsCount =
    integrationVolumes.fathomMeetings - workMeetingsCount;

  const [workMeetings, casualMeetings] = await Promise.all([
    generateFathomMeetings(
      workMeetingsCount,
      foundation.fathom.teamMembers,
      generationContext,
      3000 // Integration: IDs 3000+
    ),
    generateFathomMeetings(
      casualMeetingsCount,
      foundation.fathom.teamMembers,
      generationContext,
      3000 + workMeetingsCount // Integration casual: IDs 3000 + work count
    ),
  ]);

  // Combine meetings
  const fathomMeetings = [...workMeetings, ...casualMeetings];

  // Generate Slack messages with tracking
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
      integrationVolumes.slackMessages,
      timeline,
      config,
      categorizedContext.work
    ),
    generateGitHubIssues(
      integrationVolumes.githubIssues,
      timeline,
      config,
      categorizedContext.work
    ),
    generateGitHubPRs(
      integrationVolumes.githubPRs,
      timeline,
      config,
      categorizedContext.work
    ),
    generateNotionPages(
      integrationVolumes.notionPages,
      timeline,
      config,
      categorizedContext.work
    ),
    generateFathomTranscripts(workMeetings, config, categorizedContext.work),
    generateFathomTranscripts(
      casualMeetings,
      config,
      categorizedContext.casual
    ),
    generateFathomSummaries(workMeetings, config, categorizedContext.work),
    generateFathomSummaries(casualMeetings, config, categorizedContext.casual),
  ]);

  const fathomTranscripts = [...workTranscripts, ...casualTranscripts];
  const fathomSummaries = [...workSummaries, ...casualSummaries];

  console.log(`✅ Generated ${slackMessages.length} integrated Slack messages`);
  console.log(`✅ Generated ${githubIssues.length} integrated GitHub issues`);
  console.log(`✅ Generated ${githubPRs.length} integrated GitHub PRs`);
  console.log(`✅ Generated ${notionPages.length} integrated Notion pages`);
  console.log(
    `✅ Generated ${fathomMeetings.length} integrated Fathom meetings (${workMeetingsCount} work, ${casualMeetingsCount} casual)`
  );
  console.log(
    `✅ Generated ${fathomTranscripts.length} Fathom transcripts with richer context`
  );
  console.log(
    `✅ Generated ${fathomSummaries.length} Fathom summaries with richer context`
  );

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
