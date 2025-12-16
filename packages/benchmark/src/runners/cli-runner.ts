/**
 * Enhanced CLI Agent Runner - Execute queries using CLI-based agents
 * Supports Amp Code CLI, Claude Code CLI, and Cline
 *
 * This implementation uses actual CLI tools instead of TypeScript SDKs to:
 * - Get accurate token usage from CLI output
 * - Measure real-world execution time including process overhead
 * - Compare agents in identical execution environments
 * - Track actual tool calls and costs
 */

import { exec } from "child_process";
import { promisify } from "util";
import type { AgentConfig, MCPCall } from "../types/index.js";
import { getApiKeyForAgent } from "../env.js";

const execAsync = promisify(exec);

// ============================================
// Types
// ============================================

export interface CLIQueryResult {
  response: string;
  mcpCalls: MCPCall[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionTime: number;
  rawOutput: string;
  cost?: number;
}

export interface CLIMetrics {
  agent: string;
  success: boolean;
  duration: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  mcpCallCount: number;
  error?: string;
}

// ============================================
// Cost Calculation
// ============================================

const MODEL_COSTS = {
  // Claude models (per 1M tokens)
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet-20240620": { input: 3.0, output: 15.0 },
  "claude-3-opus-20240229": { input: 15.0, output: 75.0 },
  "claude-3-sonnet-20240229": { input: 3.0, output: 15.0 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },

  // GPT models (per 1M tokens)
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
} as const;

export const calculateCost = (
  model: string,
  inputTokens: number,
  outputTokens: number
): number => {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
  if (!costs) {
    console.warn(`Unknown model for cost calculation: ${model}`);
    return 0;
  }

  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;

  return inputCost + outputCost;
};

// ============================================
// Output Parsers for Different CLI Tools
// ============================================

interface ParsedCLIOutput {
  response: string;
  inputTokens: number;
  outputTokens: number;
  mcpCalls: MCPCall[];
  metadata?: Record<string, any>;
}

/**
 * Parse Claude CLI output
 * Expected format includes token usage in the output
 */
export const parseClaudeOutput = (output: string): ParsedCLIOutput => {
  let inputTokens = 0;
  let outputTokens = 0;
  const mcpCalls: MCPCall[] = [];
  let response = output;

  // Try to extract token usage from output
  // Claude CLI may output: "Input tokens: 123, Output tokens: 456"
  const tokenMatch = output.match(
    /Input tokens:\s*(\d+).*Output tokens:\s*(\d+)/i
  );
  if (tokenMatch) {
    inputTokens = parseInt(tokenMatch[1], 10);
    outputTokens = parseInt(tokenMatch[2], 10);
  } else {
    // Fallback: estimate based on character count (rough: 4 chars per token)
    const lines = output.split("\n");
    const contentLines = lines.filter(
      (line) =>
        !line.includes("token") &&
        !line.includes("API") &&
        line.trim().length > 0
    );
    const content = contentLines.join("\n");
    outputTokens = Math.ceil(content.length / 4);
  }

  // Try to extract MCP tool calls from output
  const toolCallPattern = /Using tool:\s*(\w+)/gi;
  let toolMatch;
  while ((toolMatch = toolCallPattern.exec(output)) !== null) {
    mcpCalls.push({
      toolName: toolMatch[1],
      arguments: {},
      result: "parsed from output",
      duration: 0,
      tokensUsed: 0,
    });
  }

  // Clean up response by removing metadata lines
  response = output
    .split("\n")
    .filter((line) => !line.match(/^(Input|Output|Total)\s+tokens:/i))
    .join("\n")
    .trim();

  return {
    response,
    inputTokens,
    outputTokens,
    mcpCalls,
  };
};

/**
 * Parse Amp Code CLI output
 * Amp CLI has its own output format
 */
export const parseAmpOutput = (output: string): ParsedCLIOutput => {
  let inputTokens = 0;
  let outputTokens = 0;
  const mcpCalls: MCPCall[] = [];
  let response = output;

  // Amp may output token usage in format: "Tokens used: 1234 (input: 123, output: 456)"
  const tokenMatch = output.match(
    /Tokens used:\s*\d+\s*\(input:\s*(\d+),\s*output:\s*(\d+)\)/i
  );
  if (tokenMatch) {
    inputTokens = parseInt(tokenMatch[1], 10);
    outputTokens = parseInt(tokenMatch[2], 10);
  } else {
    // Fallback estimation
    outputTokens = Math.ceil(output.length / 4);
  }

  // Extract tool usage
  const toolPattern = /Called tool:\s*(\w+)/gi;
  let toolMatch;
  while ((toolMatch = toolPattern.exec(output)) !== null) {
    mcpCalls.push({
      toolName: toolMatch[1],
      arguments: {},
      result: "parsed from output",
      duration: 0,
      tokensUsed: 0,
    });
  }

  // Clean response
  response = output
    .split("\n")
    .filter((line) => !line.match(/^(Tokens|Called)\s+/i))
    .join("\n")
    .trim();

  return {
    response,
    inputTokens,
    outputTokens,
    mcpCalls,
  };
};

/**
 * Parse Cline CLI output
 */
export const parseClineOutput = (output: string): ParsedCLIOutput => {
  // Cline may have different output format - add specific parsing here
  return parseClaudeOutput(output); // Default to Claude format for now
};

/**
 * Generic parser - tries to extract tokens from various formats
 */
export const parseGenericOutput = (output: string): ParsedCLIOutput => {
  let inputTokens = 0;
  let outputTokens = 0;

  // Try various token extraction patterns
  const patterns = [
    /input[:\s]+(\d+).*output[:\s]+(\d+)/i,
    /prompt[:\s]+(\d+).*completion[:\s]+(\d+)/i,
    /(\d+)\s+input.*(\d+)\s+output/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      inputTokens = parseInt(match[1], 10);
      outputTokens = parseInt(match[2], 10);
      break;
    }
  }

  // Fallback estimation if no match
  if (inputTokens === 0 && outputTokens === 0) {
    outputTokens = Math.ceil(output.length / 4);
  }

  return {
    response: output.trim(),
    inputTokens,
    outputTokens,
    mcpCalls: [],
  };
};

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
  const startTime = Date.now();
  const mcpConfigJson = JSON.stringify(agent.mcpConfig || {});

  // Build the command
  // Format: claude --mcp-config '{...}' -x "query"
  const escapedQuery = query.replace(/"/g, '\\"').replace(/'/g, "\\'");
  const command = agent.command
    ? `${agent.command} "${escapedQuery}"`
    : `claude --mcp-config '${mcpConfigJson}' -x "${escapedQuery}"`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 180000, // 3 minute timeout
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: agent.apiKey || getApiKeyForAgent(agent.name),
      },
    });

    if (stderr && !stderr.includes("warning")) {
      console.warn("Claude CLI stderr:", stderr);
    }

    const executionTime = Date.now() - startTime;
    const parsed = parseClaudeOutput(stdout);

    // Add query tokens to input estimate
    const queryTokens = Math.ceil(query.length / 4);
    const totalInputTokens = parsed.inputTokens || queryTokens;

    const cost = calculateCost(
      agent.model,
      totalInputTokens,
      parsed.outputTokens
    );

    return {
      response: parsed.response,
      mcpCalls: parsed.mcpCalls,
      inputTokens: totalInputTokens,
      outputTokens: parsed.outputTokens,
      totalTokens: totalInputTokens + parsed.outputTokens,
      executionTime,
      rawOutput: stdout,
      cost,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error("Claude CLI execution failed:", error);
    throw new Error(
      `Claude CLI failed after ${executionTime}ms: ${
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
  const startTime = Date.now();
  const mcpConfigJson = JSON.stringify(agent.mcpConfig || {});

  const escapedQuery = query.replace(/"/g, '\\"').replace(/'/g, "\\'");
  const command = agent.command
    ? `${agent.command} "${escapedQuery}"`
    : `amp --mcp-config '${mcpConfigJson}' -x "${escapedQuery}"`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 180000,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: agent.apiKey || getApiKeyForAgent(agent.name),
      },
    });

    if (stderr && !stderr.includes("warning")) {
      console.warn("Amp CLI stderr:", stderr);
    }

    const executionTime = Date.now() - startTime;
    const parsed = parseAmpOutput(stdout);

    const queryTokens = Math.ceil(query.length / 4);
    const totalInputTokens = parsed.inputTokens || queryTokens;

    const cost = calculateCost(
      agent.model,
      totalInputTokens,
      parsed.outputTokens
    );

    return {
      response: parsed.response,
      mcpCalls: parsed.mcpCalls,
      inputTokens: totalInputTokens,
      outputTokens: parsed.outputTokens,
      totalTokens: totalInputTokens + parsed.outputTokens,
      executionTime,
      rawOutput: stdout,
      cost,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error("Amp CLI execution failed:", error);
    throw new Error(
      `Amp CLI failed after ${executionTime}ms: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * Execute query using Cline CLI
 */
export const executeClineCLI = async (
  agent: AgentConfig,
  query: string
): Promise<CLIQueryResult> => {
  const startTime = Date.now();

  const escapedQuery = query.replace(/"/g, '\\"').replace(/'/g, "\\'");
  const command = agent.command || `cline "${escapedQuery}"`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 180000,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: agent.apiKey || getApiKeyForAgent(agent.name),
      },
    });

    if (stderr && !stderr.includes("warning")) {
      console.warn("Cline CLI stderr:", stderr);
    }

    const executionTime = Date.now() - startTime;
    const parsed = parseClineOutput(stdout);

    const queryTokens = Math.ceil(query.length / 4);
    const totalInputTokens = parsed.inputTokens || queryTokens;

    const cost = calculateCost(
      agent.model,
      totalInputTokens,
      parsed.outputTokens
    );

    return {
      response: parsed.response,
      mcpCalls: parsed.mcpCalls,
      inputTokens: totalInputTokens,
      outputTokens: parsed.outputTokens,
      totalTokens: totalInputTokens + parsed.outputTokens,
      executionTime,
      rawOutput: stdout,
      cost,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error("Cline CLI execution failed:", error);
    throw new Error(
      `Cline CLI failed after ${executionTime}ms: ${
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
  const agentName = agent.name.toLowerCase();

  if (agentName.includes("claude")) {
    return executeClaudeCLI(agent, query);
  } else if (agentName.includes("amp")) {
    return executeAmpCLI(agent, query);
  } else if (agentName.includes("cline")) {
    return executeClineCLI(agent, query);
  } else {
    throw new Error(`Unsupported CLI agent: ${agent.name}`);
  }
};

// ============================================
// CLI Validation
// ============================================

/**
 * Check if CLI tool is available
 */
export const checkCLIAvailable = async (toolName: string): Promise<boolean> => {
  try {
    await execAsync(`which ${toolName}`);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get CLI version
 */
export const getCLIVersion = async (toolName: string): Promise<string> => {
  try {
    const { stdout } = await execAsync(`${toolName} --version`);
    return stdout.trim();
  } catch {
    return "unknown";
  }
};

/**
 * Validate CLI agent configuration
 */
export const validateCLIAgent = async (agent: AgentConfig): Promise<void> => {
  const agentName = agent.name.toLowerCase();
  let cliCommand = "";

  if (agentName.includes("claude")) {
    cliCommand = "claude";
  } else if (agentName.includes("amp")) {
    cliCommand = "amp";
  } else if (agentName.includes("cline")) {
    cliCommand = "cline";
  }

  if (cliCommand) {
    const available = await checkCLIAvailable(cliCommand);
    if (!available) {
      const installInstructions = {
        claude: "https://claude.ai/code",
        amp: "curl -fsSL https://ampcode.com/install.sh | bash",
        cline: "Install Cline from VS Code marketplace",
      };

      throw new Error(
        `${cliCommand} CLI not found. Install it: ${
          installInstructions[cliCommand as keyof typeof installInstructions]
        }`
      );
    }

    const version = await getCLIVersion(cliCommand);
    console.log(`✓ ${cliCommand} CLI found (version: ${version})`);
  }

  if (!agent.apiKey && !process.env.ANTHROPIC_API_KEY) {
    console.warn(
      `Warning: No API key provided for ${agent.name}. Ensure ANTHROPIC_API_KEY is set.`
    );
  }
};

/**
 * Get CLI metrics summary
 */
export const getCLIMetrics = (
  result: CLIQueryResult,
  agent: string
): CLIMetrics => {
  return {
    agent,
    success: true,
    duration: result.executionTime,
    tokens: {
      input: result.inputTokens,
      output: result.outputTokens,
      total: result.totalTokens,
    },
    cost: result.cost,
    mcpCallCount: result.mcpCalls.length,
  };
};
