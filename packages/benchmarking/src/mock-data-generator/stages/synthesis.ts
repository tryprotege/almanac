import type {
  SynthesisData,
  FoundationData,
  ConnectionData,
  IntegrationData,
  GeneratorConfig,
  VolumeConfig,
  GenerationContext,
} from "../types.js";
import { generateTimeline } from "../utils/dates.js";
import { generateSlackMessages } from "../generators/slack.js";
import {
  generateGitHubIssues,
  generateGitHubPRs,
} from "../generators/github.js";
import { generateNotionPages } from "../generators/notion.js";
import { generateFathomMeetings } from "../generators/fathom.js";

/**
 * Stage 4: Synthesis - Generate data with complex multi-hop relationships
 * Functional approach - no classes
 */

export async function generateSynthesis(
  foundation: FoundationData,
  connection: ConnectionData,
  integration: IntegrationData,
  context: GenerationContext,
  config: GeneratorConfig,
  volumes: VolumeConfig
): Promise<SynthesisData> {
  console.log("🎯 Stage 4: Synthesis (20% of data)");

  const dates = generateTimeline(config.timelineDays);

  // Calculate 20% of volumes for synthesis stage
  const synthesisVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.2),
    githubIssues: Math.floor(volumes.githubIssues * 0.2),
    githubPRs: Math.floor(volumes.githubPRs * 0.2),
    notionPages: Math.floor(volumes.notionPages * 0.2),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
  };

  // Generate data with full context
  const [slackMessages, githubIssues, githubPRs, notionPages, fathomMeetings] =
    await Promise.all([
      generateSlackMessages(
        synthesisVolumes.slackMessages,
        dates,
        config,
        context
      ),
      generateGitHubIssues(
        synthesisVolumes.githubIssues,
        dates,
        config,
        context
      ),
      generateGitHubPRs(synthesisVolumes.githubPRs, dates, config, context),
      generateNotionPages(synthesisVolumes.notionPages, dates, config, context),
      generateFathomMeetings(
        synthesisVolumes.fathomMeetings,
        dates,
        config,
        context
      ),
    ]);

  console.log(`✅ Generated ${slackMessages.length} synthesis Slack messages`);
  console.log(`✅ Generated ${githubIssues.length} synthesis GitHub issues`);
  console.log(`✅ Generated ${githubPRs.length} synthesis GitHub PRs`);
  console.log(`✅ Generated ${notionPages.length} synthesis Notion pages`);
  console.log(
    `✅ Generated ${fathomMeetings.length} synthesis Fathom meetings`
  );

  return {
    slack: slackMessages,
    github: {
      issues: githubIssues,
      prs: githubPRs,
    },
    notion: notionPages,
    fathom: fathomMeetings,
  };
}
