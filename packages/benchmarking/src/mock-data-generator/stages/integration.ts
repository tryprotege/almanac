import type {
  IntegrationData,
  FoundationData,
  ConnectionData,
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
 * Stage 3: Integration - Generate data with deep links
 * Functional approach - no classes
 */

export async function generateIntegration(
  foundation: FoundationData,
  connection: ConnectionData,
  context: GenerationContext,
  config: GeneratorConfig,
  volumes: VolumeConfig
): Promise<IntegrationData> {
  console.log("🔀 Stage 3: Integration (20% of data)");

  const dates = generateTimeline(config.timelineDays);

  // Calculate 20% of volumes for integration stage
  const integrationVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.2),
    githubIssues: Math.floor(volumes.githubIssues * 0.2),
    githubPRs: Math.floor(volumes.githubPRs * 0.2),
    notionPages: Math.floor(volumes.notionPages * 0.2),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.2),
  };

  // Generate data with richer context
  const [slackMessages, githubIssues, githubPRs, notionPages, fathomMeetings] =
    await Promise.all([
      generateSlackMessages(
        integrationVolumes.slackMessages,
        dates,
        config,
        context
      ),
      generateGitHubIssues(
        integrationVolumes.githubIssues,
        dates,
        config,
        context
      ),
      generateGitHubPRs(integrationVolumes.githubPRs, dates, config, context),
      generateNotionPages(
        integrationVolumes.notionPages,
        dates,
        config,
        context
      ),
      generateFathomMeetings(
        integrationVolumes.fathomMeetings,
        dates,
        config,
        context
      ),
    ]);

  console.log(`✅ Generated ${slackMessages.length} integrated Slack messages`);
  console.log(`✅ Generated ${githubIssues.length} integrated GitHub issues`);
  console.log(`✅ Generated ${githubPRs.length} integrated GitHub PRs`);
  console.log(`✅ Generated ${notionPages.length} integrated Notion pages`);
  console.log(
    `✅ Generated ${fathomMeetings.length} integrated Fathom meetings`
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
