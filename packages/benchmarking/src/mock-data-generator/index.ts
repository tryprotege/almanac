import { loadConfig, calculateVolumes } from "./config.js";
import { initializeLLM } from "./utils/llm.js";
import { generateFoundation } from "./stages/foundation.js";
import { generateConnection } from "./stages/connection.js";
import { generateIntegration } from "./stages/integration.js";
import { generateSynthesis } from "./stages/synthesis.js";
import { buildConnectionContext } from "./context/builder.js";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { createGroupedOutput } from "./utils/grouping.js";
import {
  loadMetadata,
  saveMetadata,
  createInitialMetadata,
  updateMetadata,
  calculateDateRange,
} from "./utils/metadata.js";

/**
 * Main orchestrator for mock data generation
 * Functional approach - no classes
 */

async function main() {
  console.log("🚀 Mock Data Generator");
  console.log("=".repeat(50));

  // Load configuration
  const config = loadConfig();
  const volumes = calculateVolumes(config.timelineDays);

  // Load or create metadata
  const existingMetadata = loadMetadata(config.outputDir);
  const dateRange = calculateDateRange(existingMetadata, config.timelineDays);

  console.log(`📊 Configuration:`);
  console.log(
    `  Mode: ${dateRange.isInitialRun ? "Initial Run" : "Append Mode"}`
  );
  console.log(`  Timeline: ${config.timelineDays} days`);
  console.log(
    `  Date Range: ${dateRange.startDate.toISOString().split("T")[0]} to ${
      dateRange.endDate.toISOString().split("T")[0]
    }`
  );
  if (!dateRange.isInitialRun) {
    console.log(
      `  Dataset Start: ${existingMetadata!.startDate.split("T")[0]}`
    );
    console.log(`  Total Days So Far: ${existingMetadata!.totalDays}`);
  }
  console.log(`  Slack Messages: ${volumes.slackMessages}`);
  console.log(`  GitHub Issues: ${volumes.githubIssues}`);
  console.log(`  GitHub PRs: ${volumes.githubPRs}`);
  console.log(`  Notion Pages: ${volumes.notionPages}`);
  console.log(`  Fathom Meetings: ${volumes.fathomMeetings}`);
  console.log("=".repeat(50));

  // Initialize LLM
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;

  if (!apiKey || !baseUrl) {
    throw new Error("LLM_API_KEY or LLM_BASE_URL not found in environment");
  }

  initializeLLM(apiKey, baseUrl, config.concurrency);

  // Create output directories
  mkdirSync(join(config.outputDir, "foundation"), { recursive: true });
  mkdirSync(join(config.outputDir, "connection"), { recursive: true });
  mkdirSync(join(config.outputDir, "integration"), { recursive: true });
  mkdirSync(join(config.outputDir, "synthesis"), { recursive: true });
  mkdirSync(join(config.outputDir, "combined"), { recursive: true });

  // Load existing data if in append mode
  let existingData: any = null;
  if (!dateRange.isInitialRun) {
    const combinedPath = join(config.outputDir, "combined", "data.json");
    if (existsSync(combinedPath)) {
      console.log("📖 Loading existing data...");
      existingData = JSON.parse(readFileSync(combinedPath, "utf-8"));
      console.log(
        `  Loaded ${existingData.github.issues.length} GitHub issues`
      );
      console.log(
        `  Loaded ${existingData.github.pullRequests.length} GitHub PRs`
      );
      console.log(
        `  Loaded ${existingData.slack.messages.length} Slack messages`
      );
      console.log(`  Loaded ${existingData.notion.pages.length} Notion pages`);
      console.log(
        `  Loaded ${existingData.fathom.meetings.length} Fathom meetings`
      );
      console.log("=".repeat(50));
    }
  }

  // Stage 1: Foundation (40%)
  const foundation = await generateFoundation(
    config,
    volumes,
    dateRange.startDate
  );

  // Convert Map to flat array for JSON serialization
  const foundationForJson = {
    ...foundation,
    slack: {
      ...foundation.slack,
      messages: Array.from(foundation.slack.messages.values()).flat(),
    },
  };

  writeFileSync(
    join(config.outputDir, "foundation", "data.json"),
    JSON.stringify(foundationForJson, null, 2)
  );

  // Stage 2: Connection (20%)
  const connectionContext = buildConnectionContext(foundation);
  const connection = await generateConnection(
    foundation,
    connectionContext,
    config,
    volumes,
    dateRange.startDate
  );
  writeFileSync(
    join(config.outputDir, "connection", "data.json"),
    JSON.stringify(connection, null, 2)
  );

  // Stage 3: Integration (20%)
  const integration = await generateIntegration(
    foundation,
    connection,
    config,
    volumes,
    dateRange.startDate
  );
  writeFileSync(
    join(config.outputDir, "integration", "data.json"),
    JSON.stringify(integration, null, 2)
  );

  // Stage 4: Synthesis (20%)
  const synthesis = await generateSynthesis(
    foundation,
    connection,
    integration,
    config,
    volumes,
    dateRange.startDate
  );
  writeFileSync(
    join(config.outputDir, "synthesis", "data.json"),
    JSON.stringify(synthesis, null, 2)
  );

  // Combine all stages
  const newData = {
    github: {
      issues: [
        ...foundation.github.issues,
        ...(integration.github?.issues || []),
        ...(synthesis.github?.issues || []),
      ],
      pullRequests: [
        ...foundation.github.pullRequests,
        ...(connection.githubPRs || []),
        ...(integration.github?.prs || []),
        ...(synthesis.github?.prs || []),
      ],
      user: foundation.github.user,
      organizationMembers: foundation.github.organizationMembers,
      repositories: foundation.github.repositories,
    },
    slack: {
      messages: (() => {
        // Start with foundation messages (Map)
        const allMessages = new Map(foundation.slack.messages);

        // Merge connection messages
        if (connection.slack) {
          for (const msg of connection.slack) {
            const channelId = msg.channel;
            if (!allMessages.has(channelId)) {
              allMessages.set(channelId, []);
            }
            allMessages.get(channelId)!.push(msg);
          }
        }

        // Merge integration messages
        if (integration.slack) {
          for (const msg of integration.slack) {
            const channelId = msg.channel;
            if (!allMessages.has(channelId)) {
              allMessages.set(channelId, []);
            }
            allMessages.get(channelId)!.push(msg);
          }
        }

        // Merge synthesis messages
        if (synthesis.slack) {
          for (const msg of synthesis.slack) {
            const channelId = msg.channel;
            if (!allMessages.has(channelId)) {
              allMessages.set(channelId, []);
            }
            allMessages.get(channelId)!.push(msg);
          }
        }

        // Flatten all messages from all channels into a single array
        return Array.from(allMessages.values()).flat();
      })(),
      channels: foundation.slack.channels,
      users: foundation.slack.users,
    },
    notion: {
      pages: [
        ...foundation.notion.pages,
        ...(connection.notion || []),
        ...(integration.notion || []),
        ...(synthesis.notion || []),
      ],
      users: foundation.notion.users,
      databases: foundation.notion.databases,
      blocks: foundation.notion.blocks,
    },
    fathom: {
      meetings: [
        ...foundation.fathom.meetings,
        ...(connection.fathom || []),
        ...(integration.fathom || []),
        ...(synthesis.fathom || []),
      ],
      teams: foundation.fathom.teams,
      teamMembers: foundation.fathom.teamMembers,
      transcripts: [
        ...foundation.fathom.transcripts,
        ...(connection.fathomTranscripts || []),
        ...(integration.fathomTranscripts || []),
        ...(synthesis.fathomTranscripts || []),
      ],
      summaries: [
        ...foundation.fathom.summaries,
        ...(connection.fathomSummaries || []),
        ...(integration.fathomSummaries || []),
        ...(synthesis.fathomSummaries || []),
      ],
    },
  };

  // Merge with existing data if in append mode
  // New data goes BEFORE existing data since we're appending backward
  const combined = existingData
    ? {
        github: {
          issues: [...newData.github.issues, ...existingData.github.issues],
          pullRequests: [
            ...newData.github.pullRequests,
            ...existingData.github.pullRequests,
          ],
          user: existingData.github.user,
          organizationMembers: existingData.github.organizationMembers,
          repositories: existingData.github.repositories,
        },
        slack: {
          messages: [...newData.slack.messages, ...existingData.slack.messages],
          channels: existingData.slack.channels,
          users: existingData.slack.users,
        },
        notion: {
          pages: [...newData.notion.pages, ...existingData.notion.pages],
          users: existingData.notion.users,
          databases: existingData.notion.databases,
          blocks: existingData.notion.blocks,
        },
        fathom: {
          meetings: [
            ...newData.fathom.meetings,
            ...existingData.fathom.meetings,
          ],
          teams: existingData.fathom.teams,
          teamMembers: existingData.fathom.teamMembers,
          transcripts: [
            ...newData.fathom.transcripts,
            ...existingData.fathom.transcripts,
          ],
          summaries: [
            ...newData.fathom.summaries,
            ...existingData.fathom.summaries,
          ],
        },
      }
    : newData;

  writeFileSync(
    join(config.outputDir, "combined", "data.json"),
    JSON.stringify(combined, null, 2)
  );

  // Update metadata
  const metadata = existingMetadata
    ? updateMetadata(
        existingMetadata,
        config.timelineDays,
        {
          slackMessages: newData.slack.messages.length,
          githubIssues: newData.github.issues.length,
          githubPRs: newData.github.pullRequests.length,
          notionPages: newData.notion.pages.length,
          fathomMeetings: newData.fathom.meetings.length,
        },
        dateRange.startDate
      )
    : createInitialMetadata(dateRange.startDate);

  // For initial run, set lastRunDate to end date
  // For append mode, keep existing lastRunDate (it represents the end of the dataset)
  if (!existingMetadata) {
    metadata.lastRunDate = dateRange.endDate.toISOString();
  }
  metadata.totalDays = existingMetadata
    ? existingMetadata.totalDays + config.timelineDays
    : config.timelineDays;

  saveMetadata(config.outputDir, metadata);

  // Create improved grouped output format
  console.log("=".repeat(50));
  const grouped = createGroupedOutput(combined);
  writeFileSync(
    join(config.outputDir, "combined", "grouped.json"),
    JSON.stringify(grouped, null, 2)
  );

  console.log("=".repeat(50));

  console.log("✅ Generation complete!");
  console.log(`📁 Output directory: ${config.outputDir}`);
  console.log(
    `📅 Metadata saved with start date: ${metadata.startDate.split("T")[0]}`
  );
  console.log(
    `📊 Total records in dataset: ${
      combined.github.issues.length +
      combined.github.pullRequests.length +
      combined.notion.pages.length +
      combined.fathom.meetings.length
    }`
  );
  console.log(
    `📊 New records added this run: ${
      newData.github.issues.length +
      newData.github.pullRequests.length +
      newData.notion.pages.length +
      newData.fathom.meetings.length
    }`
  );
  console.log(`\n📦 Output (grouped.json):`);
  console.log(
    `  🔗 Workflow groups: ${grouped.metadata.summary.totalWorkflows}`
  );
  console.log(
    `  📊 Records in workflows: ${grouped.metadata.summary.totalRecordsInWorkflows}`
  );
  console.log(
    `  📝 Standalone items: ${grouped.metadata.summary.totalStandaloneRecords}`
  );
}

main().catch(console.error);
