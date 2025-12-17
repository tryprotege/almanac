/**
 * Matrix Benchmark Configuration
 * Tests Agent × MCP Setup × Scenario combinations
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                         TEST MATRIX OVERVIEW                               ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  This benchmark will test ALL combinations of:                            ║
 * ║  - Agents (amp, claude-cli)                                               ║
 * ║  - MCP Setups (ebee, direct)                                              ║
 * ║  - Scenarios (decisions, multi-source)                                    ║
 * ║                                                                           ║
 * ║  Total Test Cases: 2 agents × 2 setups × 2 scenarios = 8 test cases      ║
 * ║                                                                           ║
 * ║  To skip a configuration:                                                 ║
 * ║  - Comment out an agent to skip all tests with that agent                ║
 * ║  - Comment out an MCP setup to skip all tests with that setup            ║
 * ║  - Comment out a scenario to skip that query across all configurations   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import type { MatrixBenchmarkConfig } from "../types/index.js";
import { env } from "../env.js";

export const matrixBenchmarkConfig: MatrixBenchmarkConfig = {
  name: "Agent × MCP Matrix Comparison",
  description:
    "Compare different CLI agents (Amp, Claude) with eBee vs Direct MCP setups",
  type: "matrix",
  iterations: env.BENCHMARK_ITERATIONS,
  outputDir: env.BENCHMARK_OUTPUT_DIR,

  // ============================================================================
  // AGENTS TO TEST
  // ============================================================================
  // Comment out any agent you don't want to test
  // Each agent will be tested with ALL MCP setups and ALL scenarios
  agents: [
    // {
    //   name: "amp",
    //   model: "claude-haiku-4-5-20251001",
    // },
    {
      name: "claude-cli",
      model: "claude-haiku-4-5-20251001",
    },
  ],

  // ============================================================================
  // MCP SETUP CONFIGURATIONS
  // ============================================================================
  // Comment out any setup you don't want to test
  // Each setup will be tested with ALL agents and ALL scenarios
  mcpSetups: [
    // ── eBee Setup ────────────────────────────────────────────────────────
    // Uses centralized eBee server for MCP orchestration
    {
      name: "ebee",
      url: "http://localhost:3000/mcp",
    },
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
  // TEST SCENARIOS
  // ============================================================================
  // Comment out any scenario you don't want to test
  // Each scenario will be tested with ALL agents and ALL MCP setups
  scenarios: [
    // ── Entity-Focused Query ──────────────────────────────────────────────
    {
      id: "decisions",
      query: "What were the key decisions from last week's team meeting?",
      category: "entity_focused",
      targetServers: ["fathom"],
    },

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
// ACTIVE TEST CASES
// ============================================================================
// Based on the current configuration, the following test cases will run:
//
// 1. amp + ebee + decisions
// 2. amp + ebee + multi-source
// 3. claude-cli + ebee + decisions
// 4. claude-cli + ebee + multi-source
//
// (direct setup is currently commented out)
// ============================================================================
