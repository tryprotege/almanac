/**
 * CLI Agent Runner - Execute queries using CLI-based agents
 * Supports Amp Code CLI and Claude Code CLI
 */

import { exec } from "child_process";
import { promisify } from "util";
import type { AgentConfig, MCPCall } from "../types/index.js";

const execAsync = promisify(exec);

// ============================================
// Types
// ============================================

export interface CLIQueryResult {
  response: string;
  mcpCalls: MCPCall[];
  inputTokens: number;
  outputTokens: number;
}

// ============================================
// CLI Execution Functions
// ============================================

/**
 * Execute query using Claude Code CLI
 */
export const executeClaudeCLI = async (
  agent: AgentConfig,
  query: string
): Promise<CLIQueryResult> => {
  const mcpConfigJson = JSON.stringify(agent.mcpConfig || {});

  // Build the command
  // claude --mcp-config '{...}' -x "query"
  const command = `claude --mcp-config '${mcpConfigJson}' -x "${query.replace(
    /"/g,
    '\\"'
  )}"`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 120000, // 2 minute timeout
    });

    if (stderr && !stderr.includes("warning")) {
      console.warn("Claude CLI stderr:", stderr);
    }

    // Parse response
    const response = stdout.trim();

    // Estimate tokens (rough approximation: 4 chars per token)
    const inputTokens = Math.ceil(query.length / 4);
    const outputTokens = Math.ceil(response.length / 4);

    // MCP calls are implicit - we don't get detailed tracking from CLI
    const mcpCalls: MCPCall[] = [
      {
        toolName: "lightrag_search",
        arguments: { query },
        result: response,
        duration: 0, // Not tracked by CLI
        tokensUsed: inputTokens + outputTokens,
      },
    ];

    return {
      response,
      mcpCalls,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    console.error("Claude CLI execution failed:", error);
    throw new Error(
      `Claude CLI failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * Execute query using Amp Code CLI
 */
export const executeAmpCLI = async (
  agent: AgentConfig,
  query: string
): Promise<CLIQueryResult> => {
  const mcpConfigJson = JSON.stringify(agent.mcpConfig || {});

  // Build the command
  // amp --mcp-config '{...}' -x "query"
  const command = `amp --mcp-config '${mcpConfigJson}' -x "${query.replace(
    /"/g,
    '\\"'
  )}"`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 120000, // 2 minute timeout
    });

    if (stderr && !stderr.includes("warning")) {
      console.warn("Amp CLI stderr:", stderr);
    }

    // Parse response
    const response = stdout.trim();

    // Estimate tokens (rough approximation: 4 chars per token)
    const inputTokens = Math.ceil(query.length / 4);
    const outputTokens = Math.ceil(response.length / 4);

    // MCP calls are implicit - we don't get detailed tracking from CLI
    const mcpCalls: MCPCall[] = [
      {
        toolName: "lightrag_search",
        arguments: { query },
        result: response,
        duration: 0, // Not tracked by CLI
        tokensUsed: inputTokens + outputTokens,
      },
    ];

    return {
      response,
      mcpCalls,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    console.error("Amp CLI execution failed:", error);
    throw new Error(
      `Amp CLI failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * Execute query using the appropriate CLI based on agent configuration
 */
export const executeCLIQuery = async (
  agent: AgentConfig,
  query: string
): Promise<CLIQueryResult> => {
  if (agent.name === "claude-cli") {
    return executeClaudeCLI(agent, query);
  } else if (agent.name === "amp") {
    return executeAmpCLI(agent, query);
  } else {
    throw new Error(`Unsupported CLI agent: ${agent.name}`);
  }
};

/**
 * Check if CLI tool is available
 */
export const checkCLIAvailable = async (
  toolName: "claude" | "amp"
): Promise<boolean> => {
  try {
    await execAsync(`which ${toolName}`);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate CLI agent configuration
 */
export const validateCLIAgent = async (agent: AgentConfig): Promise<void> => {
  if (agent.name === "claude-cli") {
    const available = await checkCLIAvailable("claude");
    if (!available) {
      throw new Error(
        "Claude CLI not found. Please install it: https://claude.ai/code"
      );
    }
  } else if (agent.name === "amp") {
    const available = await checkCLIAvailable("amp");
    if (!available) {
      throw new Error(
        "Amp CLI not found. Please install it: curl -fsSL https://ampcode.com/install.sh | bash"
      );
    }
  }

  if (!agent.mcpConfig) {
    throw new Error(`Agent ${agent.name} requires mcpConfig to be set`);
  }
};
