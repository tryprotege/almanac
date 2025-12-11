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
  // Calculate TOTAL volumes across all stages (Foundation 40% + Connection 20% + Integration 20% + Synthesis 20%)
  // These are the final totals we want, so we don't need to multiply by stage percentages later
  // Minimums ensure at least 1-2 items per stage after percentage splits (with floor rounding)
  return {
    slackMessages: Math.max(40, Math.floor(timelineDays * 1000)), // 1000 messages/day, min 40 (10+ per stage)
    githubIssues: Math.max(8, Math.floor(timelineDays * 1.7)), // ~50/month, min 8 (2+ per stage)
    githubPRs: Math.max(8, Math.floor(timelineDays * 1.7)), // ~50/month, min 8 (2+ per stage)
    notionPages: Math.max(8, Math.floor(timelineDays * 2)), // 2/day, min 8 (2+ per stage)
    fathomMeetings: Math.max(8, Math.floor(timelineDays * 0.7)), // ~20/month, min 8 (2+ per stage)
  };
}
