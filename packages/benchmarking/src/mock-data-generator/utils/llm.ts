import OpenAI from "openai";
import type { GeneratorConfig } from "../types.js";

let openaiClient: OpenAI | null = null;

export function initializeLLM(apiKey: string, baseUrl: string): void {
  openaiClient = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });
}

export async function generateWithLLM(
  prompt: string,
  config: GeneratorConfig
): Promise<string> {
  if (!openaiClient) {
    throw new Error("LLM not initialized. Call initializeLLM first.");
  }

  const response = await openaiClient.chat.completions.create({
    model: process.env.LLM_CHAT_MODEL!,
    messages: [{ role: "user", content: prompt }],
    temperature: config.temperature,
    max_tokens: 3000,
    stream: false,
  });

  return response.choices[0]?.message?.content || "";
}

export async function generateBatch(
  prompts: string[],
  config: GeneratorConfig
): Promise<string[]> {
  const results: string[] = [];

  for (const prompt of prompts) {
    try {
      const result = await generateWithLLM(prompt, config);
      results.push(result);

      // Rate limiting
      await new Promise((resolve) =>
        setTimeout(resolve, config.rateLimitDelay)
      );
    } catch (error) {
      console.error("Error generating with LLM:", error);
      results.push("");
    }
  }

  return results;
}
