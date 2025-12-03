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
  }
): Promise<string> {
  const completion = await client.chat.completions.create({
    model: options?.model || env.LLM_CHAT_MODEL,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens,
    stream: false,
  });

  return completion.choices[0]?.message?.content || "";
}

/**
 * Generate a summary/title for content
 */
export async function generateTitle(
  client: OpenAI,
  content: string,
  maxLength: number = 100
): Promise<string> {
  const prompt = `Generate a concise, descriptive title (max ${maxLength} chars) for this content:

${content.substring(0, 1000)}

Return only the title, no other text.`;

  const response = await chat(client, [{ role: "user", content: prompt }], {
    temperature: 0.3,
  });

  return response.trim().substring(0, maxLength);
}

/**
 * Classify content into categories
 */
export async function classify(
  client: OpenAI,
  content: string,
  categories: string[]
): Promise<{ category: string; confidence: number }> {
  const prompt = `Classify this content into one of these categories: ${categories.join(
    ", "
  )}

Content: ${content.substring(0, 1000)}

Return JSON with: category (one from the list), confidence (0.0-1.0)`;

  const response = await chat(client, [
    {
      role: "system",
      content:
        "You are a classification assistant. Always respond with valid JSON.",
    },
    { role: "user", content: prompt },
  ]);

  try {
    return JSON.parse(response);
  } catch {
    return { category: categories[0], confidence: 0.5 };
  }
}

/**
 * Answer questions about content using RAG
 */
export async function answerQuestion(
  client: OpenAI,
  question: string,
  context: string[]
): Promise<string> {
  const prompt = `Answer the following question based on the provided context.

Question: ${question}

Context:
${context.join("\n\n")}

Answer:`;

  return chat(client, [
    {
      role: "system",
      content:
        "You are a helpful assistant that answers questions based on provided context. If you cannot answer from the context, say so.",
    },
    { role: "user", content: prompt },
  ]);
}
