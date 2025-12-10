import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { env } from "../../env.js";

/**
 * Generic LLM Service - Provider-agnostic interface for LLM operations
 */
export class LLMService {
  private client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  /**
   * Generic chat completion
   */
  async chat(
    messages: ChatCompletionMessageParam[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: options?.model || env.LLM_CHAT_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      stream: false,
    });

    return completion.choices[0]?.message?.content || "";
  }
}
