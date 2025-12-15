import OpenAI from "openai";
import pRetry from "p-retry";
import pLimit from "p-limit";
import type { GeneratorConfig } from "../types.js";
import { getPerformanceTracker } from "./performance.js";

let openaiClient: OpenAI | null = null;
let concurrencyLimit: ReturnType<typeof pLimit> | null = null;

export function initializeLLM(
  apiKey: string,
  baseUrl: string,
  concurrency: number = 10
): void {
  openaiClient = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });

  // Initialize concurrency limiter
  concurrencyLimit = pLimit(concurrency);
}

export async function generateWithLLM(
  prompt: string,
  config: GeneratorConfig
): Promise<string> {
  if (!openaiClient) {
    throw new Error("LLM not initialized. Call initializeLLM first.");
  }

  const startTime = Date.now();

  const result = await pRetry(
    async () => {
      const response = await openaiClient!.chat.completions.create(
        {
          model: process.env.LLM_CHAT_MODEL!,
          messages: [{ role: "user", content: prompt }],
          temperature: config.temperature,
          max_tokens: 3000,
          stream: false,
        },
        {
          timeout: 90_000,
          maxRetries: 3,
        }
      );

      return response.choices[0]?.message?.content || "";
    },
    {
      retries: 5,
      onFailedAttempt: (error) => {
        console.log(
          `Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`
        );
      },
    }
  );

  // Track API call latency
  const latency = Date.now() - startTime;
  getPerformanceTracker().recordApiCall(latency);

  return result;
}
