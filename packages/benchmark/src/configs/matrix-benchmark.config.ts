/**
 * Matrix Benchmark Configuration
 * Tests Agent × MCP Setup combinations
 */

import type { MatrixBenchmarkConfig } from "../types/index.js";

export const matrixBenchmarkConfig: MatrixBenchmarkConfig = {
  name: "Agent × MCP Matrix Comparison",
  description:
    "Compare different CLI agents (Amp, Claude) with eBee vs Direct MCP setups",
  type: "matrix",
  iterations: 3,
  outputDir: "./benchmark-results/matrix",

  // All agents to test
  agents: [
    {
      name: "amp",
      model: "claude-3-5-sonnet-20241022",
    },
    {
      name: "claude-cli",
      model: "claude-3-5-sonnet-20241022",
    },
  ],

  // MCP setup configurations
  mcpSetups: {
    ebee: {
      url: "http://localhost:3000",
    },
    direct: {
      servers: ["fathom", "notion"],
      packages: {
        fathom: "@ebee-oss/fathom-mcp-server",
        notion: "@notionhq/notion-mcp-server",
      },
    },
  },

  // Test scenarios
  scenarios: [
    {
      id: "decisions",
      query: "What were the key decisions from last week's team meeting?",
      category: "entity_focused",
      targetServers: ["fathom"],
    },
    {
      id: "multi-source",
      query: "Find all project updates from meetings and documents",
      category: "aggregation",
      targetServers: ["fathom", "notion"],
    },
  ],
};
