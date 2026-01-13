import OpenAI from 'openai';
import { env } from '../../env.js';

/**
 * Create an OpenAI-compatible client for any provider
 */
export function createLLMClient(apiKey?: string, baseURL?: string): OpenAI {
  const selectedApiKey = apiKey || env.LLM_API_KEY || '';
  const selectedBaseURL = baseURL || env.LLM_BASE_URL || '';

  return new OpenAI({
    baseURL: selectedBaseURL,
    apiKey: selectedApiKey,
  });
}
