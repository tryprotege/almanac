import { readFileSync } from "fs";
import { resolve } from "path";
import type { MockData } from "./types";

// Get configuration from environment variables
const MOCK_DATA_PATH =
  process.env.MOCK_DATA_PATH || "../benchmarking/output/combined/data.json";

/**
 * Load mock data from JSON file
 */
function loadMockDataFromFile(dataPath: string): MockData {
  const resolvedPath = resolve(dataPath);
  console.error(`[DataLoader] Loading mock data from: ${resolvedPath}`);

  try {
    const rawData = readFileSync(resolvedPath, "utf-8");
    const data = JSON.parse(rawData) as MockData;
    console.error(`[DataLoader] Mock data loaded successfully`);
    return data;
  } catch (error) {
    console.error(`[DataLoader] Error loading mock data:`, error);
    throw new Error(`Failed to load mock data from ${resolvedPath}: ${error}`);
  }
}

// Load and export mock data
export const mockData: MockData = loadMockDataFromFile(MOCK_DATA_PATH);
