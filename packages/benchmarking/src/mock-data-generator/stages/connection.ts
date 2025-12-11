import type {
  AllGeneratedData,
  GeneratorConfig,
  VolumeConfig,
  GenerationContext,
  CategorizedContext,
} from "../types.js";
import { generateTimeline } from "../utils/dates.js";
import { generateSlackMessages } from "../generators/slack.js";
import { generateNotionPages } from "../generators/notion.js";
import {
  generateFathomMeetings,
  generateFathomTranscripts,
  generateFathomSummaries,
} from "../generators/fathom.js";
import { generateGitHubPRs } from "../generators/github.js";

/**
 * Stage 2: Connection - Generate data with first-level links
 * Functional approach - no classes
 */

export async function generateConnection(
  foundation: AllGeneratedData,
  categorizedContext: CategorizedContext,
  config: GeneratorConfig,
  volumes: VolumeConfig
): Promise<{
  slack: any[];
  notion: any[];
  fathom: any[];
  fathomTranscripts: any[];
  fathomSummaries: any[];
  githubPRs: any[];
}> {
  console.log("🔗 Stage 2: Connection (20% of data)");

  const timeline = generateTimeline(config.timelineDays);
  const generationContext: GenerationContext = {
    startDate: timeline[0],
    endDate: timeline[timeline.length - 1],
    config,
  };

  // Calculate 20% of volumes for connection stage
  const connectionVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.2),
    notionPages: Math.floor(volumes.notionPages * 0.2),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
    githubPRs: Math.floor(volumes.githubPRs * 0.2),
  };

  // Generate data WITH context (filtered by category)
  // Split Fathom meetings: 80% work, 20% casual
  const workMeetingsCount = Math.floor(connectionVolumes.fathomMeetings * 0.8);
  const casualMeetingsCount =
    connectionVolumes.fathomMeetings - workMeetingsCount;

  const [slackMessages, notionPages, workMeetings, casualMeetings, githubPRs] =
    await Promise.all([
      generateSlackMessages(
        connectionVolumes.slackMessages,
        timeline,
        config,
        categorizedContext.work
      ),
      generateNotionPages(
        connectionVolumes.notionPages,
        timeline,
        config,
        categorizedContext.work
      ),
      generateFathomMeetings(
        connectionVolumes.fathomMeetings,
        foundation.fathom.teamMembers,
        generationContext
      ),
      generateFathomMeetings(
        connectionVolumes.fathomMeetings,
        foundation.fathom.teamMembers,
        generationContext
      ),
      generateGitHubPRs(
        connectionVolumes.githubPRs,
        timeline,
        config,
        categorizedContext.work
      ),
    ]);

  // Combine meetings
  const fathomMeetings = [...workMeetings, ...casualMeetings];

  // Generate transcripts and summaries with context
  const [workTranscripts, casualTranscripts, workSummaries, casualSummaries] =
    await Promise.all([
      generateFathomTranscripts(workMeetings, config, categorizedContext.work),
      generateFathomTranscripts(
        casualMeetings,
        config,
        categorizedContext.casual
      ),
      generateFathomSummaries(workMeetings, config, categorizedContext.work),
      generateFathomSummaries(
        casualMeetings,
        config,
        categorizedContext.casual
      ),
    ]);

  const fathomTranscripts = [...workTranscripts, ...casualTranscripts];
  const fathomSummaries = [...workSummaries, ...casualSummaries];

  console.log(`✅ Generated ${slackMessages.length} connected Slack messages`);
  console.log(`✅ Generated ${notionPages.length} connected Notion pages`);
  console.log(
    `✅ Generated ${fathomMeetings.length} connected Fathom meetings (${workMeetingsCount} work, ${casualMeetingsCount} casual)`
  );
  console.log(
    `✅ Generated ${fathomTranscripts.length} Fathom transcripts with context`
  );
  console.log(
    `✅ Generated ${fathomSummaries.length} Fathom summaries with context`
  );
  console.log(
    `✅ Generated ${githubPRs.length} GitHub PRs with issue references`
  );

  return {
    slack: slackMessages,
    notion: notionPages,
    fathom: fathomMeetings,
    fathomTranscripts,
    fathomSummaries,
    githubPRs,
  };
}
