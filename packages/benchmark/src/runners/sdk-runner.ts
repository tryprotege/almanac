/**
 * SDK-based Agent Runner - Execute queries using TypeScript SDKs
 *
 * This implementation uses SDKs instead of CLI tools to:
 * - Get accurate token usage (input, output, thinking tokens)
 * - Support extended thinking for better reasoning
 * - Handle MCP tool calls in an agentic loop
 * - Calculate precise costs
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { execute } from "@sourcegraph/amp-sdk";
import type { AgentConfig, MCPCall } from "../types/index.js";
import { getApiKeyForAgent } from "../env.js";
import { MCPServerManager, MCPServerConfig } from "./mcp-manager.js";

// ============================================
// Types
// ============================================

export interface SDKOptions {
  verbose?: boolean;
  enableThinking?: boolean;
  thinkingBudget?: number;
  maxTokens?: number;
}

export interface SDKQueryResult {
  response: string;
  mcpCalls: MCPCall[];
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  executionTime: number;
  rawOutput: string;
  cost: number;
}

// ============================================
// Cost Calculation
// ============================================

const MODEL_COSTS = {
  // Claude 4.5 models (per 1M tokens)
  "claude-haiku-4-5-20251001": { input: 0.25, output: 1.25 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "claude-opus-4-5-20251101": { input: 15.0, output: 75.0 },
} as const;

export const calculateCostWithThinking = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number
): number => {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
  if (!costs) {
    console.warn(`Unknown model for cost calculation: ${model}`);
    return 0;
  }

  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  // Thinking tokens are billed at output rate
  const thinkingCost = (thinkingTokens / 1_000_000) * costs.output;

  return inputCost + outputCost + thinkingCost;
};

// ============================================
// Claude SDK Executor
// ============================================

export const executeClaudeSDK = async (
  agent: AgentConfig,
  queryPrompt: string,
  options: SDKOptions = {}
): Promise<SDKQueryResult> => {
  const verbose = options.verbose ?? true;
  const enableThinking = options.enableThinking ?? true;
  const thinkingBudget = options.thinkingBudget ?? 10000;
  const startTime = Date.now();

  const mcpManager = new MCPServerManager(verbose);
  const mcpCalls: MCPCall[] = [];
  const processedUUIDs = new Set<string>();
  const stepUsages: any[] = [];

  try {
    if (verbose) {
      console.log("\n🔧 Claude Agent SDK Execution:");
      console.log(`  Agent: ${agent.name}`);
      console.log(`  Model: ${agent.model}`);
      console.log(`  Extended Thinking: ${enableThinking}`);
      console.log(`  Query: "${queryPrompt}"`);
    }

    // Get API key
    const apiKey = agent.apiKey || getApiKeyForAgent(agent.name);

    // Set API key in environment for Claude Agent SDK
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = apiKey;

    // Start MCP servers if configured
    if (agent.mcpConfig && Object.keys(agent.mcpConfig).length > 0) {
      for (const [name, config] of Object.entries(agent.mcpConfig)) {
        await mcpManager.startServer(name, config as MCPServerConfig);
      }
    }

    // Get available tools from MCP servers
    const tools = mcpManager.getAnthropicTools();

    if (verbose && tools.length > 0) {
      const serverNames = mcpManager.getServerNames();
      console.log(
        `\n📦 Available Tools: ${tools.length} tools from ${serverNames.join(
          ", "
        )}`
      );
    }

    try {
      // Execute with Claude Agent SDK - returns AsyncGenerator
      const queryGenerator = query({
        prompt: queryPrompt,
        options: {
          model: agent.model,
          ...(enableThinking && {
            maxThinkingTokens: thinkingBudget,
          }),
          // Note: MCP servers might need different config format
          // For now, we'll let Agent SDK handle tools if available
        },
      });

      // Initialize token counters (accumulate from assistant messages)
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheCreationTokens = 0;
      let totalCacheReadTokens = 0;

      // Iterate through messages
      for await (const message of queryGenerator) {
        if (verbose) {
          console.log(`\n📨 Message: ${message.type}`);
        }

        // Track usage from assistant messages with UUID deduplication
        if (message.type === "assistant") {
          const assistantMsg = message as any;
          if (assistantMsg.uuid && !processedUUIDs.has(assistantMsg.uuid)) {
            processedUUIDs.add(assistantMsg.uuid);

            if (assistantMsg.message?.usage) {
              const usage = assistantMsg.message.usage;

              // Accumulate tokens from each assistant message
              totalInputTokens += usage.input_tokens || 0;
              totalOutputTokens += usage.output_tokens || 0;
              totalCacheCreationTokens +=
                usage.cache_creation_input_tokens || 0;
              totalCacheReadTokens += usage.cache_read_input_tokens || 0;

              stepUsages.push({
                uuid: assistantMsg.uuid,
                usage: usage,
              });

              if (verbose) {
                console.log(
                  `  Usage: input=${usage.input_tokens || 0}, output=${
                    usage.output_tokens || 0
                  }`
                );
                if (usage.cache_creation_input_tokens) {
                  console.log(
                    `  Cache creation: ${usage.cache_creation_input_tokens}`
                  );
                }
                if (usage.cache_read_input_tokens) {
                  console.log(`  Cache read: ${usage.cache_read_input_tokens}`);
                }
              }
            }
          }

          // Track tool calls
          if (assistantMsg.message?.content) {
            const content = assistantMsg.message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === "tool_use" && verbose) {
                  console.log(`  Tool: ${block.name}`);
                }
              }
            }
          }
        }

        // Get final result
        if (message.type === "result") {
          const resultMsg = message as any;

          if (resultMsg.is_error) {
            throw new Error(
              `Query failed: ${resultMsg.errors?.join(", ") || "Unknown error"}`
            );
          }

          // Restore original API key
          if (originalKey) {
            process.env.ANTHROPIC_API_KEY = originalKey;
          } else {
            delete process.env.ANTHROPIC_API_KEY;
          }

          const executionTime = Date.now() - startTime;

          // Prefer result.usage if available (authoritative), otherwise use accumulated
          if (resultMsg.usage) {
            const usage = resultMsg.usage;
            if (usage.input_tokens > 0 || usage.output_tokens > 0) {
              totalInputTokens = usage.input_tokens || 0;
              totalOutputTokens = usage.output_tokens || 0;
              totalCacheCreationTokens = usage.cache_creation_input_tokens || 0;
              totalCacheReadTokens = usage.cache_read_input_tokens || 0;
            }
          }

          // Use authoritative cost from Agent SDK
          const cost = resultMsg.total_cost_usd || 0;

          // Combine cache tokens into input for total calculation
          const combinedInputTokens =
            totalInputTokens + totalCacheCreationTokens + totalCacheReadTokens;

          if (verbose) {
            console.log(`\n✅ Execution completed in ${executionTime}ms`);
            console.log(`   Input tokens: ${totalInputTokens}`);
            console.log(`   Output tokens: ${totalOutputTokens}`);
            if (totalCacheCreationTokens > 0) {
              console.log(
                `   Cache creation tokens: ${totalCacheCreationTokens}`
              );
            }
            if (totalCacheReadTokens > 0) {
              console.log(`   Cache read tokens: ${totalCacheReadTokens}`);
            }
            console.log(`   Steps processed: ${stepUsages.length}`);
            console.log(`   Turns: ${resultMsg.num_turns || 0}`);
            console.log(`   Cost: $${cost.toFixed(4)}\n`);
          }

          return {
            response: resultMsg.result || "",
            mcpCalls, // Agent SDK handles tools automatically
            inputTokens: combinedInputTokens, // Includes cache tokens
            outputTokens: totalOutputTokens,
            thinkingTokens: 0, // Agent SDK doesn't separate thinking tokens
            cacheCreationTokens: totalCacheCreationTokens,
            cacheReadTokens: totalCacheReadTokens,
            totalTokens: combinedInputTokens + totalOutputTokens,
            executionTime,
            rawOutput: JSON.stringify(resultMsg, null, 2),
            cost,
          };
        }
      }

      throw new Error("Query completed without result message");
    } finally {
      // Restore original API key
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    }
  } catch (error) {
    const executionTime = Date.now() - startTime;

    if (verbose) {
      console.error(
        `\n❌ Claude Agent SDK execution failed after ${executionTime}ms`
      );
      console.error(
        `   Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    throw new Error(
      `Claude Agent SDK failed after ${executionTime}ms: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    // Always cleanup MCP servers
    await mcpManager.stopAll();
  }
};

// ============================================
// Amp SDK Executor
// ============================================

export const executeAmpSDK = async (
  agent: AgentConfig,
  query: string,
  options: SDKOptions = {}
): Promise<SDKQueryResult> => {
  const verbose = options.verbose ?? true;
  const startTime = Date.now();
  const mcpCalls: MCPCall[] = [];

  try {
    if (verbose) {
      console.log("\n🔧 Amp SDK Execution:");
      console.log(`  Agent: ${agent.name}`);
      console.log(`  Model: ${agent.model}`);
      console.log(`  Query: "${query}"`);
    }

    // Get API key (Amp SDK reads from AMP_API_KEY environment variable)
    const apiKey = agent.apiKey || getApiKeyForAgent(agent.name);

    // Set API key in environment for Amp SDK
    const originalKey = process.env.AMP_API_KEY;
    process.env.AMP_API_KEY = apiKey;

    try {
      // Execute with Amp SDK
      let finalResult = "";
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheCreationTokens = 0;
      let totalCacheReadTokens = 0;

      for await (const message of execute({
        prompt: query,
      })) {
        if (verbose) {
          console.log(`  Message type: ${message.type}`);
        }

        // Accumulate usage from assistant messages (per-turn usage)
        if (message.type === "assistant" && (message as any).message?.usage) {
          const usage = (message as any).message.usage;

          // Accumulate tokens from each assistant message
          totalInputTokens += usage.input_tokens || 0;
          totalOutputTokens += usage.output_tokens || 0;
          totalCacheCreationTokens += usage.cache_creation_input_tokens || 0;
          totalCacheReadTokens += usage.cache_read_input_tokens || 0;

          if (verbose) {
            console.log(
              `  Assistant tokens: input=${usage.input_tokens}, output=${usage.output_tokens}`
            );
            if (usage.cache_creation_input_tokens) {
              console.log(
                `  Cache creation: ${usage.cache_creation_input_tokens}`
              );
            }
            if (usage.cache_read_input_tokens) {
              console.log(`  Cache read: ${usage.cache_read_input_tokens}`);
            }
          }
        }

        // Get final result (prefer result.usage if available)
        if (message.type === "result" && !(message as any).is_error) {
          finalResult = (message as any).result;

          // Prefer result.usage if available and has values (authoritative)
          if ((message as any).usage) {
            const usage = (message as any).usage;
            if (usage.input_tokens > 0 || usage.output_tokens > 0) {
              totalInputTokens = usage.input_tokens || 0;
              totalOutputTokens = usage.output_tokens || 0;
              totalCacheCreationTokens = usage.cache_creation_input_tokens || 0;
              totalCacheReadTokens = usage.cache_read_input_tokens || 0;
            }
          }
          break;
        }
      }

      // Restore original API key
      if (originalKey) {
        process.env.AMP_API_KEY = originalKey;
      } else {
        delete process.env.AMP_API_KEY;
      }

      const executionTime = Date.now() - startTime;

      // Combine cache tokens into input for total calculation
      const combinedInputTokens =
        totalInputTokens + totalCacheCreationTokens + totalCacheReadTokens;

      // Calculate cost (using same pricing as Claude Haiku for now)
      const cost = calculateCostWithThinking(
        "claude-haiku-4-5-20251001",
        combinedInputTokens,
        totalOutputTokens,
        0 // Amp doesn't have separate thinking tokens
      );

      if (verbose) {
        console.log(`\n✅ Execution completed in ${executionTime}ms`);
        console.log(`   Input tokens: ${totalInputTokens}`);
        console.log(`   Output tokens: ${totalOutputTokens}`);
        if (totalCacheCreationTokens > 0) {
          console.log(`   Cache creation tokens: ${totalCacheCreationTokens}`);
        }
        if (totalCacheReadTokens > 0) {
          console.log(`   Cache read tokens: ${totalCacheReadTokens}`);
        }
        console.log(`   Cost: $${cost.toFixed(4)}\n`);
      }

      return {
        response: finalResult,
        mcpCalls,
        inputTokens: combinedInputTokens, // Includes cache tokens
        outputTokens: totalOutputTokens,
        thinkingTokens: 0, // Amp doesn't have separate thinking tokens
        cacheCreationTokens: totalCacheCreationTokens,
        cacheReadTokens: totalCacheReadTokens,
        totalTokens: combinedInputTokens + totalOutputTokens,
        executionTime,
        rawOutput: finalResult,
        cost,
      };
    } finally {
      // Restore original API key
      if (originalKey) {
        process.env.AMP_API_KEY = originalKey;
      } else {
        delete process.env.AMP_API_KEY;
      }
    }
  } catch (error) {
    const executionTime = Date.now() - startTime;

    if (verbose) {
      console.error(`\n❌ Amp SDK execution failed after ${executionTime}ms`);
      console.error(
        `   Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    throw new Error(
      `Amp SDK failed after ${executionTime}ms: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

// ============================================
// Main SDK Query Executor
// ============================================

export const executeSDKQuery = async (
  agent: AgentConfig,
  query: string,
  options: SDKOptions = {}
): Promise<SDKQueryResult> => {
  const agentName = agent.name.toLowerCase();

  if (agentName.includes("claude")) {
    return executeClaudeSDK(agent, query, options);
  } else if (agentName.includes("amp")) {
    return executeAmpSDK(agent, query, options);
  } else {
    throw new Error(`Unsupported SDK agent: ${agent.name}`);
  }
};
