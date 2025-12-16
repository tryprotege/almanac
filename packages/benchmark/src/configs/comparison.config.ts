/**
 * Example Comparison Benchmark Configuration
 * eBee vs Direct MCP Server Access
 */

import type { ComparisonBenchmarkConfig } from "../types/index.js";

export const comparisonBenchmarkConfig: ComparisonBenchmarkConfig = {
  name: "ebee-vs-direct-comparison",
  description: "Compare eBee server performance against direct MCP access",
  type: "comparison",
  iterations: 3,
  outputDir: "./benchmark-results",

  // Agents to test
  agents: [
    {
      name: "amp",
      model: "claude-sonnet-4-20250514",
      command: "amp",
      mcpConfig: {
        ebee: {
          url: "http://localhost:3000/.api/mcp/v1",
          description: "eBee MCP server with graph-enhanced search",
        },
      },
    },
    {
      name: "claude-cli",
      model: "claude-sonnet-4-20250514",
      command: "claude",
      mcpConfig: {
        ebee: {
          command: "node",
          args: ["../server/dist/mcp/index.js"],
          description: "eBee MCP server",
        },
      },
    },
  ],

  // Test scenarios
  scenarios: [
    {
      id: "single-source-fathom",
      query: "What were the key decisions from last week's team meeting?",
      sourceServers: ["fathom"],
    },
    {
      id: "single-source-notion",
      query: "Find all documentation about the API authentication flow",
      sourceServers: ["notion"],
    },
    {
      id: "multi-source",
      query:
        "Summarize all project updates from the past week across meetings and documents",
      sourceServers: ["fathom", "notion"],
    },
    {
      id: "entity-focused",
      query: "Who was mentioned in discussions about the Q4 roadmap?",
      sourceServers: ["fathom", "notion"],
    },
  ],

  // Source server configurations (for direct access)
  sourceServers: {
    fathom: "fathom-mcp-server",
    notion: "notion-mcp-server",
  },
};
