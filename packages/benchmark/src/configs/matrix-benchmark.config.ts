/**
 * Matrix Benchmark Configuration
 * Tests Agent × MCP Setup × Scenario combinations
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                         TEST MATRIX OVERVIEW                               ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  This benchmark will test ALL combinations of:                            ║
 * ║  - Agents (amp, claude-cli)                                               ║
 * ║  - MCP Setups (ebee, direct, clone-mcp)                                  ║
 * ║  - Queries (generated from JSON or hardcoded scenarios)                   ║
 * ║                                                                           ║
 * ║  To skip a configuration:                                                 ║
 * ║  - Comment out an agent to skip all tests with that agent                ║
 * ║  - Comment out an MCP setup to skip all tests with that setup            ║
 * ║  - For generated queries: add workflow IDs to skipWorkflows               ║
 * ║  - For hardcoded queries: comment out scenario in scenarios array         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import type { MatrixBenchmarkConfig } from "../types/index.js";
import { env } from "../env.js";
import path from "path";
import { fileURLToPath } from "url";
import { McpStdioServerConfig } from "@anthropic-ai/claude-agent-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const matrixBenchmarkConfig: MatrixBenchmarkConfig = {
  name: "Agent × MCP Matrix Comparison",
  description:
    "Compare different CLI agents (Amp, Claude) with eBee vs Direct MCP setups",
  type: "matrix",
  iterations: env.BENCHMARK_ITERATIONS,
  outputDir: env.BENCHMARK_OUTPUT_DIR,
  verbose: false,

  // ============================================================================
  // QUERY SOURCE - Comment/uncomment to switch
  // ============================================================================

  // Option A: Use generated queries from JSON file (DEFAULT)
  // Runs all workflows by default. Add workflow IDs to skipWorkflows to skip specific ones.
  queriesSource: {
    type: "generated",
    file: "../../generated-queries.json", // Relative to this file
    // Uncomment and add workflow IDs to skip:
    // skipWorkflows: [
    //   "workflow-meeting-873431",
    //   "workflow-issue-55676",
    // ],
  },

  // Option B: Use hardcoded scenarios (comment out Option A above, uncomment below)
  // queriesSource: {
  //   type: "hardcoded",
  // },

  // ============================================================================
  // AGENTS TO TEST
  // ============================================================================
  // Comment out any agent you don't want to test
  // Each agent will be tested with ALL MCP setups and ALL queries
  agents: [
    {
      name: "amp",
      model: "claude-haiku-4-5-20251001",
    },
    {
      name: "claude-cli",
      model: "claude-haiku-4-5-20251001",
    },
  ],

  // ============================================================================
  // MCP SETUP CONFIGURATIONS
  // ============================================================================
  // Comment out any setup you don't want to test
  // Each setup will be tested with ALL agents and ALL queries
  mcpSetups: [
    // ── eBee Setup ────────────────────────────────────────────────────────
    // Uses centralized eBee server for MCP orchestration
    {
      name: "ebee",
      servers: ["ebee-oss"],
      packages: {
        "ebee-oss": {
          command: "npx",
          args: [
            "-y",
            "tsx",
            path.join(__dirname, "../../../server/src/mcp/stdio.ts"),
          ],
        },
      },
    },

    // TODO: uncomment for testing clone MCP server
    // ── Clone MCP Server (stdio) ──────────────────────────────────────────
    // Mock data server with Fathom, Slack, Notion, GitHub tools
    {
      name: "clone-mcp",
      servers: ["clone-mcp"],
      packages: ["github", "fathom", "notion", "slack"].reduce<
        Record<string, McpStdioServerConfig>
      >((acc, curr) => {
        acc[curr] = {
          command: "npx",
          args: [
            "-y",
            "tsx",
            path.join(__dirname, "../../../clone-mcp-server/src/index.ts"),
          ],
          env: {
            SOURCE_TYPE: curr,
            STDIO: "true",
          },
        };
        return acc;
      }, {}),
    },

    // ── Clone MCP Server (HTTP) ───────────────────────────────────────────
    // Mock data server via HTTP (must be running: pnpm --filter @ebee-oss/clone-mcp-server dev)
    // {
    //   name: "clone-mcp-http",
    //   url: "http://localhost:3001/mcp",
    // },

    // ── Direct Setup ──────────────────────────────────────────────────────
    // Connects directly to individual MCP servers
    // {
    //   name: "direct",
    //   servers: ["fathom", "notion"],
    //   packages: {
    //     // Local fathom MCP server from packages/fathom-mcp-server
    //     fathom: {
    //       command: "pnpm",
    //       args: ["--filter", "fathom-mcp-server", "start"],
    //     },
    //     // Remote notion MCP server via npm
    //     notion: "@notionhq/notion-mcp-server",
    //   },
    // },
  ],

  // ============================================================================
  // HARDCODED TEST SCENARIOS (only used if queriesSource.type = "hardcoded")
  // ============================================================================
  // Comment out any scenario you don't want to test
  scenarios: [
    // ── Entity-Focused Query ──────────────────────────────────────────────
    // {
    //   id: "decisions",
    //   query: "What were the key decisions from last week's team meeting?",
    //   category: "entity_focused",
    //   targetServers: ["fathom"],
    // },
    // // ── Multi-Source Aggregation ──────────────────────────────────────────
    // {
    //   id: "multi-source",
    //   query: "Find all project updates from meetings and documents",
    //   category: "aggregation",
    //   targetServers: ["fathom", "notion"],
    // },
  ],
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================
//
// Example 1: Test generated queries with eBee (DEFAULT)
//   - queriesSource: { type: "generated", file: "..." }
//   - mcpSetups: [{ name: "ebee", url: "..." }]
//   - Runs all 5 workflows × 3 test cases = 15 queries
//
// Example 2: Test generated queries, skip some workflows
//   - queriesSource: {
//       type: "generated",
//       skipWorkflows: ["workflow-meeting-873431"]
//     }
//   - Runs 4 workflows × 3 test cases = 12 queries
//
// Example 3: Test with Clone MCP Server
//   - Comment out eBee setup
//   - Uncomment clone-mcp or clone-mcp-http setup
//
// Example 4: Compare eBee vs Clone MCP
//   - Uncomment both eBee and clone-mcp setups
//   - Results show performance and accuracy comparison
//
// Example 5: Test hardcoded scenarios
//   - Change queriesSource to { type: "hardcoded" }
//   - Uses scenarios array defined above
// ============================================================================
