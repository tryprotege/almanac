import { readFileSync } from "fs";
import { resolve } from "path";
import type { MockData, SourceType } from "./types.js";

/**
 * Load mock data from JSON file
 */
export function loadMockData(
  dataPath: string,
  sourceType: SourceType
): MockData {
  const resolvedPath = resolve(dataPath);
  console.error(`[DataLoader] Loading mock data from: ${resolvedPath}`);
  console.error(`[DataLoader] Source type: ${sourceType}`);

  try {
    const rawData = readFileSync(resolvedPath, "utf-8");
    const data = JSON.parse(rawData) as MockData;

    // Log what was loaded based on source type
    switch (sourceType) {
      case "slack":
        console.error(
          `[DataLoader] Loaded ${data.slack?.channels.length || 0} channels`
        );
        console.error(
          `[DataLoader] Loaded ${data.slack?.users.length || 0} users`
        );
        console.error(
          `[DataLoader] Loaded ${data.slack?.messages.length || 0} messages`
        );
        break;
      case "github":
        console.error(
          `[DataLoader] Loaded ${
            data.github?.repositories.length || 0
          } repositories`
        );
        console.error(
          `[DataLoader] Loaded ${data.github?.issues.length || 0} issues`
        );
        console.error(
          `[DataLoader] Loaded ${
            data.github?.pullRequests.length || 0
          } pull requests`
        );
        break;
      case "notion":
        console.error(
          `[DataLoader] Loaded ${data.notion?.databases.length || 0} databases`
        );
        console.error(
          `[DataLoader] Loaded ${data.notion?.pages.length || 0} pages`
        );
        console.error(
          `[DataLoader] Loaded ${data.notion?.blocks.length || 0} blocks`
        );
        break;
      case "fathom":
        console.error(
          `[DataLoader] Loaded ${data.fathom?.meetings.length || 0} meetings`
        );
        console.error(
          `[DataLoader] Loaded ${
            data.fathom?.transcripts.length || 0
          } transcripts`
        );
        console.error(
          `[DataLoader] Loaded ${data.fathom?.summaries.length || 0} summaries`
        );
        break;
    }

    return data;
  } catch (error) {
    console.error(`[DataLoader] Error loading mock data:`, error);
    throw new Error(`Failed to load mock data from ${resolvedPath}: ${error}`);
  }
}
