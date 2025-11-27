import OpenAI from "openai";
import { env } from "../../env.js";

/**
 * Provider configurations for different LLM services
 */
const PROVIDER_CONFIGS: Record<
  string,
  {
    defaultBaseURL: string;
  }
> = {
  openrouter: {
    defaultBaseURL: "https://openrouter.ai/api/v1",
  },
};

/**
 * Create an OpenAI-compatible client for any provider
 */
export function createLLMClient(
  provider?: string,
  apiKey?: string,
  baseURL?: string
): OpenAI {
  const selectedProvider = provider || env.LLM_PROVIDER;
  const selectedApiKey = apiKey || env.LLM_API_KEY || "";
  const selectedBaseURL =
    baseURL ||
    env.LLM_BASE_URL ||
    PROVIDER_CONFIGS[selectedProvider]?.defaultBaseURL ||
    "";

  return new OpenAI({
    baseURL: selectedBaseURL,
    apiKey: selectedApiKey,
  });
}
