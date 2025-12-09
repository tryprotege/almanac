import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { env } from "../../env.js";

// ============================================================================
// Core LLM Functions
// ============================================================================

/**
 * Generic chat completion
 */
export async function chat(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    reasoning_effort?: "low" | "medium" | "high";
  }
): Promise<string> {
  const completion = await client.chat.completions.create({
    model: options?.model || env.LLM_CHAT_MODEL,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens,
    stream: false,
    ...(options?.reasoning_effort && {
      reasoning_effort: options.reasoning_effort,
    }),
  });

  return completion.choices[0]?.message?.content || "";
}
