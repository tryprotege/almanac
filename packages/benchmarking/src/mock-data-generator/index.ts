import { loadConfig, calculateVolumes } from "./config.js";
import { initializeLLM } from "./utils/llm.js";
import { generateFoundation } from "./stages/foundation.js";
import { generateConnection } from "./stages/connection.js";
import { generateIntegration } from "./stages/integration.js";
import { generateSynthesis } from "./stages/synthesis.js";
import {
  buildConnectionContext,
  buildIntegrationContext,
  buildSynthesisContext,
} from "./context/builder.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

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

  console.log(`📊 Configuration:`);
  console.log(`  Timeline: ${config.timelineDays} days`);
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

  initializeLLM(apiKey, baseUrl);

  // Create output directories
  mkdirSync(join(config.outputDir, "foundation"), { recursive: true });
  mkdirSync(join(config.outputDir, "connection"), { recursive: true });
  mkdirSync(join(config.outputDir, "integration"), { recursive: true });
  mkdirSync(join(config.outputDir, "synthesis"), { recursive: true });
  mkdirSync(join(config.outputDir, "combined"), { recursive: true });

  // Stage 1: Foundation (40%)
  const foundation = await generateFoundation(config, volumes);

  // Convert Map to plain object for JSON serialization
  const foundationForJson = {
    ...foundation,
    slack: {
      ...foundation.slack,
      messages: Object.fromEntries(foundation.slack.messages),
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
    volumes
  );
  writeFileSync(
    join(config.outputDir, "connection", "data.json"),
    JSON.stringify(connection, null, 2)
  );

  // // Stage 3: Integration (20%)
  // const integrationContext = buildIntegrationContext(foundation, connection);
  // const integration = await generateIntegration(
  //   foundation,
  //   connection,
  //   integrationContext,
  //   config,
  //   volumes
  // );
  // writeFileSync(
  //   join(config.outputDir, "integration", "data.json"),
  //   JSON.stringify(integration, null, 2)
  // );

  // // Stage 4: Synthesis (20%)
  // const synthesisContext = buildSynthesisContext(
  //   foundation,
  //   connection,
  //   integration
  // );
  // const synthesis = await generateSynthesis(
  //   foundation,
  //   connection,
  //   integration,
  //   synthesisContext,
  //   config,
  //   volumes
  // );
  // writeFileSync(
  //   join(config.outputDir, "synthesis", "data.json"),
  //   JSON.stringify(synthesis, null, 2)
  // );

  // // Combine all stages
  // const combined = {
  //   github: {
  //     issues: [
  //       ...foundation.github.issues,
  //       ...(integration.github?.issues || []),
  //       ...(synthesis.github?.issues || []),
  //     ],
  //     pullRequests: [
  //       ...foundation.github.pullRequests,
  //       ...(integration.github?.pullRequests || []),
  //       ...(synthesis.github?.pullRequests || []),
  //     ],
  //     user: foundation.github.user,
  //     organizationMembers: foundation.github.organizationMembers,
  //     repositories: foundation.github.repositories,
  //   },
  //   slack: {
  //     messages: foundation.slack.messages,
  //     channels: foundation.slack.channels,
  //     users: foundation.slack.users,
  //   },
  //   notion: {
  //     pages: [
  //       ...foundation.notion.pages,
  //       ...(connection.notion || []),
  //       ...(integration.notion || []),
  //       ...(synthesis.notion || []),
  //     ],
  //     users: foundation.notion.users,
  //     databases: foundation.notion.databases,
  //     blocks: foundation.notion.blocks,
  //   },
  //   fathom: {
  //     meetings: [
  //       ...foundation.fathom.meetings,
  //       ...(connection.fathom || []),
  //       ...(integration.fathom || []),
  //       ...(synthesis.fathom || []),
  //     ],
  //     teams: foundation.fathom.teams,
  //     teamMembers: foundation.fathom.teamMembers,
  //     transcripts: foundation.fathom.transcripts,
  //     summaries: foundation.fathom.summaries,
  //   },
  // };

  // writeFileSync(
  //   join(config.outputDir, "combined", "data.json"),
  //   JSON.stringify(combined, null, 2)
  // );

  // console.log("=".repeat(50));
  // console.log("✅ Generation complete!");
  // console.log(`📁 Output directory: ${config.outputDir}`);
  // console.log(
  //   `📊 Total records: ${
  //     combined.github.issues.length +
  //     combined.github.pullRequests.length +
  //     combined.notion.pages.length +
  //     combined.fathom.meetings.length
  //   }`
  // );
}

main().catch(console.error);
