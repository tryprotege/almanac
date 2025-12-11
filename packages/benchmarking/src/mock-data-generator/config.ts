import dotenv from "dotenv";
import type { GeneratorConfig, VolumeConfig } from "./types.js";

dotenv.config();

export function loadConfig(): GeneratorConfig {
  const timelineDays = parseInt(process.env.TIMELINE_DAYS || "30", 10);

  return {
    timelineDays,
    temperature: parseFloat(process.env.TEMPERATURE || "0.8"),
    batchSize: parseInt(process.env.BATCH_SIZE || "20", 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || "3", 10),
    rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || "1000", 10),
    outputDir: process.env.OUTPUT_DIR || "./output",
  };
}

export function calculateVolumes(timelineDays: number): VolumeConfig {
  return {
    slackMessages: Math.floor(timelineDays * 100), // 100 messages/day
    githubIssues: Math.floor(timelineDays * 1.7), // ~50/month
    githubPRs: Math.floor(timelineDays * 1.7), // ~50/month
    notionPages: Math.floor(timelineDays * 2), // 2/day
    fathomMeetings: Math.floor(timelineDays * 0.7), // ~20/month
  };
}
