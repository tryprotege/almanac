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
    reasoningEffort?: "low" | "medium" | "high"; // Legacy format (backwards compatibility)
    reasoning?: {
      effort: "low" | "medium" | "high" | "none";
    }; // New format (preferred)
    frequencyPenalty?: number;
    responseFormat?:
      | { type: "json_object" }
      | {
          type: "json_schema";
          json_schema: {
            name: string;
            schema: Record<string, unknown>;
            strict?: boolean;
          };
        };
  }
): Promise<string> {
  const completion = await client.chat.completions.create({
    model: options?.model || env.LLM_CHAT_MODEL,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens,
    stream: false,
    frequency_penalty: options?.frequencyPenalty,
    // Prioritize new reasoning format, fall back to legacy reasoningEffort
    ...(options?.reasoning && {
      reasoning: options.reasoning,
    }),
    ...(options?.reasoningEffort &&
      !options?.reasoning && {
        reasoning_effort: options.reasoningEffort,
      }),
    ...(options?.responseFormat && {
      response_format: options.responseFormat,
    }),
  });

  return completion.choices[0]?.message?.content || "";
}
