import type {
  AllGeneratedData,
  GeneratorConfig,
  VolumeConfig,
  GenerationContext,
} from "../types.js";
import { generateTimeline, generateTimelineFromDate } from "../utils/dates.js";
import {
  generateSlackMessages,
  generateSlackChannels,
  generateSlackUsers,
} from "../generators/slack.js";
import {
  generateGitHubIssues,
  generateGitHubPRs,
  generateGitHubUsers,
  generateGitHubRepositories,
} from "../generators/github.js";
import {
  generateNotionPages,
  generateNotionUsers,
  generateNotionDatabases,
  generateNotionBlocks,
} from "../generators/notion.js";
import {
  generateFathomMeetings,
  generateFathomTeams,
  generateFathomTeamMembers,
  generateFathomTranscripts,
  generateFathomSummaries,
} from "../generators/fathom.js";

/**
 * Stage 1: Foundation - Generate standalone data with NO cross-references
 * Functional approach - no classes
 */

export async function generateFoundation(
  config: GeneratorConfig,
  volumes: VolumeConfig,
  startDate?: Date
): Promise<AllGeneratedData> {
  console.log("📦 Stage 1: Foundation (40% of data)");

  // Use provided startDate or fall back to default timeline generation
  const timeline = startDate
    ? generateTimelineFromDate(startDate, config.timelineDays)
    : generateTimeline(config.timelineDays);

  const context: GenerationContext = {
    startDate: timeline[0],
    endDate: timeline[timeline.length - 1],
    config,
  };

  // Calculate 40% of volumes for foundation stage
  const foundationVolumes = {
    slackMessages: Math.floor(volumes.slackMessages * 0.4),
    githubIssues: Math.floor(volumes.githubIssues * 0.4),
    githubPRs: Math.floor(volumes.githubPRs * 0.4),
    notionPages: Math.floor(volumes.notionPages * 0.4),
    fathomMeetings: Math.floor(volumes.fathomMeetings * 0.4),
  };

  const [
    {
      fathomMeetings,
      fathomTeams,
      fathomTeamMembers,
      fathomTranscripts,
      fathomSummaries,
    },
    { githubIssues, githubPRs, githubUsers, githubRepositories },
    { notionPages, notionUsers, notionDatabases, notionBlocks },
    { slackMessages, slackUsers, slackChannels, messagesByChannel },
  ] = await Promise.all([
    generateFathomFoundation(foundationVolumes, context, config),
    generateGithubFoundation(foundationVolumes, timeline, config),
    generateNotionFoundation(foundationVolumes, timeline, config),
    generateSlackFoundation(foundationVolumes, timeline, config),
  ]);

  console.log(`✅ Generated ${fathomMeetings.length} Fathom meetings`);
  console.log(`✅ Generated ${githubIssues.length} GitHub issues`);
  console.log(`✅ Generated ${githubPRs.length} GitHub PRs`);
  console.log(`✅ Generated ${notionPages.length} Notion pages`);
  console.log(`✅ Generated ${slackMessages.length} Slack messages`);

  return {
    fathom: {
      teams: fathomTeams,
      teamMembers: fathomTeamMembers,
      meetings: fathomMeetings,
      transcripts: fathomTranscripts,
      summaries: fathomSummaries,
    },
    github: {
      user: githubUsers[0], // First user as authenticated user
      organizationMembers: githubUsers,
      repositories: githubRepositories,
      issues: githubIssues,
      pullRequests: githubPRs,
      workflows: [],
      workflowRuns: [],
      releases: [],
      discussions: [],
      codeScanningAlerts: [],
      dependabotAlerts: [],
    },
    notion: {
      users: notionUsers,
      databases: notionDatabases,
      pages: notionPages,
      blocks: notionBlocks,
    },
    slack: {
      users: slackUsers,
      channels: slackChannels,
      messages: messagesByChannel,
    },
  };
}

async function generateSlackFoundation(
  foundationVolumes: {
    slackMessages: number;
    githubIssues: number;
    githubPRs: number;
    notionPages: number;
    fathomMeetings: number;
  },
  timeline: Date[],
  config: GeneratorConfig
) {
  console.log("Generating Slack data...");
  const slackUsers = generateSlackUsers();
  const slackChannels = generateSlackChannels();
  const slackMessages = await generateSlackMessages(
    foundationVolumes.slackMessages,
    timeline,
    config
  );

  // Organize Slack messages by channel
  const messagesByChannel = new Map<string, any[]>();
  for (const channel of slackChannels) {
    // Filter messages that belong to this specific channel
    const channelMessages = slackMessages.filter((msg: any) => {
      return msg.channel === channel.id;
    });
    messagesByChannel.set(channel.id || "", channelMessages);
  }

  return { slackMessages, slackUsers, slackChannels, messagesByChannel };
}

async function generateNotionFoundation(
  foundationVolumes: {
    slackMessages: number;
    githubIssues: number;
    githubPRs: number;
    notionPages: number;
    fathomMeetings: number;
  },
  timeline: Date[],
  config: GeneratorConfig
) {
  console.log("Generating Notion data...");
  const notionUsers = generateNotionUsers();
  const notionDatabases = generateNotionDatabases(5);
  const notionPages = await generateNotionPages(
    foundationVolumes.notionPages,
    timeline,
    config
  );
  const notionBlocks = generateNotionBlocks(notionPages);
  return { notionPages, notionUsers, notionDatabases, notionBlocks };
}

async function generateGithubFoundation(
  foundationVolumes: {
    slackMessages: number;
    githubIssues: number;
    githubPRs: number;
    notionPages: number;
    fathomMeetings: number;
  },
  timeline: Date[],
  config: GeneratorConfig
) {
  console.log("Generating GitHub data...");
  const githubUsers = generateGitHubUsers();
  const githubRepositories = generateGitHubRepositories();
  const [githubIssues, githubPRs] = await Promise.all([
    generateGitHubIssues(foundationVolumes.githubIssues, timeline, config),
    generateGitHubPRs(foundationVolumes.githubPRs, timeline, config),
  ]);
  return { githubIssues, githubPRs, githubUsers, githubRepositories };
}

async function generateFathomFoundation(
  foundationVolumes: {
    slackMessages: number;
    githubIssues: number;
    githubPRs: number;
    notionPages: number;
    fathomMeetings: number;
  },
  context: GenerationContext,
  config: GeneratorConfig
) {
  console.log("Generating Fathom data...");

  const fathomTeams = generateFathomTeams(2);
  const fathomTeamMembers = generateFathomTeamMembers(fathomTeams);
  const fathomMeetings = generateFathomMeetings(
    foundationVolumes.fathomMeetings,
    fathomTeamMembers,
    context,
    1000 // Foundation: IDs 1000+
  );
  const [fathomTranscripts, fathomSummaries] = await Promise.all([
    generateFathomTranscripts(fathomMeetings, config),
    generateFathomSummaries(fathomMeetings, config),
  ]);
  return {
    fathomMeetings,
    fathomTeams,
    fathomTeamMembers,
    fathomTranscripts,
    fathomSummaries,
  };
}
