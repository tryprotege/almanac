import type {
  ToolClassification,
  ToolCategory,
} from "@ebee-oss/indexing-engine";
import { generateToolClassificationPrompt } from "./prompts/tool-classification.js";
import { createLLMClient, chat } from "../../llm/index.js";
import { ModelConfigModel } from "../../../models/model-config.model.js";
import logger from "../../../utils/logger.js";

export interface ClassifyToolsOptions {
  serverName: string;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>;
}

export interface ClassificationResult {
  classifications: Record<string, ToolClassification>;
  readTools: string[];
  searchTools: string[];
  writeTools: string[];
}

/**
 * Classify MCP tools using LLM into read/search/write categories
 */
export async function classifyTools(
  options: ClassifyToolsOptions
): Promise<ClassificationResult> {
  const { serverName, tools } = options;

  logger.info(
    `Classifying ${tools.length} tools for MCP server: ${serverName}`
  );

  if (tools.length === 0) {
    return {
      classifications: {},
      readTools: [],
      searchTools: [],
      writeTools: [],
    };
  }

  // Generate classification prompt
  const prompt = generateToolClassificationPrompt({ tools });

  // Call LLM for classification
  const classificationsArray = await callLLMForClassification(prompt);

  // Build classification map
  const classifications: Record<string, ToolClassification> = {};
  const readTools: string[] = [];
  const searchTools: string[] = [];
  const writeTools: string[] = [];

  for (const classification of classificationsArray) {
    classifications[classification.toolName] = classification;

    // Categorize tools
    switch (classification.category) {
      case "read":
        readTools.push(classification.toolName);
        break;
      case "search":
        searchTools.push(classification.toolName);
        break;
      case "write":
        writeTools.push(classification.toolName);
        break;
    }
  }

  logger.info(
    {
      serverName,
      readTools: readTools.length,
      searchTools: searchTools.length,
      writeTools: writeTools.length,
    },
    "Tool classification complete"
  );

  return {
    classifications,
    readTools,
    searchTools,
    writeTools,
  };
}

/**
 * Filter tools to only include read operations
 * @param skipSearch - If true, also skip search tools (default: true)
 */
export function filterReadTools(
  tools: any[],
  classifications: Record<string, ToolClassification>,
  options?: { skipSearch?: boolean }
): any[] {
  const skipSearch = options?.skipSearch ?? true;

  return tools.filter((tool) => {
    const classification = classifications[tool.name];

    if (!classification) {
      // If not classified, assume it's safe (read) - log warning
      logger.warn(
        { toolName: tool.name },
        "Tool not classified, assuming READ"
      );
      return true;
    }

    // Always include read tools
    if (classification.category === "read") {
      return true;
    }

    // Optionally include search tools
    if (classification.category === "search" && !skipSearch) {
      return true;
    }

    // Never include write tools for indexing
    if (classification.category === "write") {
      logger.info({ toolName: tool.name }, "Skipping WRITE tool for indexing");
      return false;
    }

    // Skip search tools if configured
    if (classification.category === "search" && skipSearch) {
      logger.info({ toolName: tool.name }, "Skipping SEARCH tool for indexing");
      return false;
    }

    return true;
  });
}

/**
 * Call LLM to classify tools
 */
async function callLLMForClassification(
  prompt: string
): Promise<ToolClassification[]> {
  const response = await callLLM(prompt);

  // Parse JSON response
  const classifications = parseClassificationFromLLM(response);

  return classifications;
}

/**
 * Call LLM API using user-configured model from UI Settings
 */
async function callLLM(prompt: string): Promise<string> {
  // Load model config from MongoDB (user settings from UI)
  const modelConfig = await ModelConfigModel.findOne({ _id: "default" });

  if (!modelConfig) {
    throw new Error(
      "No model configuration found. Please configure LLM settings in UI."
    );
  }

  // Create LLM client with user settings
  const client = createLLMClient(
    modelConfig.llmProvider,
    modelConfig.llmApiKey || undefined,
    modelConfig.llmBaseURL || undefined
  );

  // Use dedicated indexing config model if set, otherwise fall back to chat model
  const modelToUse =
    modelConfig.llmIndexingConfigModel || modelConfig.llmChatModel;

  logger.info(
    `Calling LLM for tool classification: ${
      modelConfig.llmProvider
    } / ${modelToUse}${
      modelConfig.llmIndexingConfigModel
        ? " (indexing config model)"
        : " (chat model fallback)"
    }`
  );

  // Call LLM with the prompt
  const response = await chat(client, [{ role: "user", content: prompt }], {
    model: modelToUse,
    temperature: 0.2, // Lower temperature for more consistent classification
    maxTokens: 4000,
  });

  return response;
}

/**
 * Parse LLM response into ToolClassification array
 */
function parseClassificationFromLLM(response: string): ToolClassification[] {
  // Extract JSON from markdown code blocks if present
  let jsonContent = response.trim();

  // Remove markdown code fences if present
  const jsonMatch = jsonContent.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
  } else {
    // Try generic code block
    const codeMatch = jsonContent.match(/```\n([\s\S]*?)\n```/);
    if (codeMatch) {
      jsonContent = codeMatch[1];
    }
  }

  // Parse JSON
  try {
    const parsed = JSON.parse(jsonContent);

    if (!Array.isArray(parsed)) {
      throw new Error("Expected an array of classifications");
    }

    // Validate each classification
    const validated: ToolClassification[] = parsed.map((item: any) => {
      if (!item.toolName || !item.category) {
        throw new Error(`Invalid classification: ${JSON.stringify(item)}`);
      }

      if (!["read", "search", "write"].includes(item.category)) {
        throw new Error(`Invalid category: ${item.category}`);
      }

      return {
        toolName: item.toolName,
        category: item.category as ToolCategory,
        confidence: item.confidence ?? 1.0,
        reasoning: item.reasoning ?? "",
      };
    });

    return validated;
  } catch (error) {
    logger.error(
      { error, response: jsonContent },
      "Failed to parse tool classifications"
    );
    throw new Error(`Failed to parse LLM classification response: ${error}`);
  }
}
