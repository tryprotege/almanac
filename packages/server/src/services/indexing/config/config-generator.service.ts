import type {
  IndexingConfig,
  GeneratedConfigResult,
  ValidationResult,
} from "@ebee-oss/indexing-engine";
import { mcpClientManager } from "../../../mcp/client.js";
import { generateConfigPrompt } from "./prompts/config-generation.js";
import { createLLMClient, chat } from "../../../services/llm/index.js";
import { ModelConfigModel } from "../../../models/model-config.model.js";
import logger from "../../../utils/logger.js";
import yaml from "yaml";

export interface ConfigGeneratorOptions {
  serverName: string;
  displayName?: string;
  sampleLimit?: number; // Limit sample records per tool
}

/**
 * Generate an IndexingConfig for an MCP server
 */
export async function generateConfig(
  options: ConfigGeneratorOptions
): Promise<GeneratedConfigResult> {
  const { serverName, displayName, sampleLimit = 3 } = options;

  logger.info(`Generating config for MCP server: ${serverName}`);

  // Step 1: Collect tool definitions
  const toolDefinitions = await collectToolDefinitions(serverName);

  if (toolDefinitions.length === 0) {
    throw new Error(`No tools found for MCP server: ${serverName}`);
  }

  // Step 2: Fetch sample data for each tool
  const samples = await fetchSampleData(
    serverName,
    toolDefinitions,
    sampleLimit
  );

  // Step 3: Build LLM prompt
  const prompt = generateConfigPrompt({
    serverName,
    displayName: displayName || serverName,
    tools: toolDefinitions,
    samples,
  });

  // Step 4: Call LLM to generate config
  const config = await callLLMForConfig(prompt);

  // Step 5: Validate generated config
  const validation = validateConfig(config);

  return {
    config,
    validation,
    samples,
    toolsUsed: toolDefinitions.map((t) => t.name),
  };
}

/**
 * Collect tool definitions from MCP server
 */
async function collectToolDefinitions(serverName: string): Promise<any[]> {
  const tools = mcpClientManager.getServerTools(serverName);
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/**
 * Fetch sample data for each tool
 */
async function fetchSampleData(
  serverName: string,
  toolDefinitions: any[],
  limit: number
): Promise<Record<string, any>> {
  const samples: Record<string, any> = {};

  for (const tool of toolDefinitions) {
    try {
      // Try to call tool with minimal/empty params
      const params = buildMinimalParams(tool.inputSchema);

      const response = await mcpClientManager.callTool(
        serverName,
        tool.name,
        params
      );

      // Limit response size
      samples[tool.name] = limitSampleSize(response, limit);

      logger.debug(
        `Fetched sample data for tool: ${tool.name} (${serverName})`
      );
    } catch (error) {
      logger.warn(
        { error, toolName: tool.name },
        `Failed to fetch sample data for tool`
      );
      samples[tool.name] = { error: "Failed to fetch sample" };
    }
  }

  return samples;
}

/**
 * Build minimal parameters for a tool based on its input schema
 */
function buildMinimalParams(inputSchema: any): Record<string, any> {
  const params: Record<string, any> = {};

  if (!inputSchema?.properties) {
    return params;
  }

  // Add required params only
  const required = inputSchema.required || [];

  for (const key of required) {
    const prop = inputSchema.properties[key];

    // Try to provide sensible defaults based on type
    switch (prop.type) {
      case "string":
        params[key] = "";
        break;
      case "number":
      case "integer":
        params[key] = 0;
        break;
      case "boolean":
        params[key] = false;
        break;
      case "array":
        params[key] = [];
        break;
      case "object":
        params[key] = {};
        break;
    }
  }

  return params;
}

/**
 * Limit sample response size
 */
function limitSampleSize(data: any, limit: number): any {
  if (Array.isArray(data)) {
    return data.slice(0, limit);
  }

  // If response has a common array field, limit it
  if (data.results && Array.isArray(data.results)) {
    return { ...data, results: data.results.slice(0, limit) };
  }

  if (data.records && Array.isArray(data.records)) {
    return { ...data, records: data.records.slice(0, limit) };
  }

  if (data.items && Array.isArray(data.items)) {
    return { ...data, items: data.items.slice(0, limit) };
  }

  return data;
}

/**
 * Call LLM to generate IndexingConfig
 */
async function callLLMForConfig(prompt: string): Promise<IndexingConfig> {
  const response = await callLLM(prompt);

  // Parse YAML response to IndexingConfig
  const config = parseConfigFromLLM(response);

  return config;
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

  logger.info(
    `Calling LLM: ${modelConfig.llmProvider} / ${modelConfig.llmChatModel}`
  );

  // Call LLM with the prompt
  const response = await chat(client, [{ role: "user", content: prompt }], {
    model: modelConfig.llmChatModel,
    temperature: 0.3, // Lower temperature for structured output
    maxTokens: 4000, // Allow large configs
  });

  return response;
}

/**
 * Parse LLM response into IndexingConfig
 */
function parseConfigFromLLM(response: string): IndexingConfig {
  // Extract YAML from markdown code blocks if present
  let yamlContent = response.trim();

  // Remove markdown code fences if present
  const yamlMatch = yamlContent.match(/```yaml\n([\s\S]*?)\n```/);
  if (yamlMatch) {
    yamlContent = yamlMatch[1];
  } else {
    // Try generic code block
    const codeMatch = yamlContent.match(/```\n([\s\S]*?)\n```/);
    if (codeMatch) {
      yamlContent = codeMatch[1];
    }
  }

  // Parse YAML
  try {
    const config = yaml.parse(yamlContent) as IndexingConfig;
    return config;
  } catch (error) {
    logger.error({ error, response: yamlContent }, "Failed to parse YAML");
    throw new Error(`Failed to parse LLM response as YAML: ${error}`);
  }
}

/**
 * Validate generated config
 */
function validateConfig(config: IndexingConfig): ValidationResult {
  const errors = [];
  const warnings = [];

  // Basic validation
  if (!config.version) {
    errors.push({
      path: "version",
      message: "Missing version field",
      code: "MISSING_VERSION",
    });
  }

  if (!config.source) {
    errors.push({
      path: "source",
      message: "Missing source field",
      code: "MISSING_SOURCE",
    });
  }

  if (!config.fetchers || Object.keys(config.fetchers).length === 0) {
    errors.push({
      path: "fetchers",
      message: "No fetchers defined",
      code: "NO_FETCHERS",
    });
  }

  if (!config.recordTypes || Object.keys(config.recordTypes).length === 0) {
    errors.push({
      path: "recordTypes",
      message: "No record types defined",
      code: "NO_RECORD_TYPES",
    });
  }

  // Validate field mappings
  for (const [typeName, recordType] of Object.entries(config.recordTypes)) {
    if (!recordType.fields.title) {
      warnings.push({
        path: `recordTypes.${typeName}.fields.title`,
        message: "Missing title field mapping",
        suggestion: "Add a title field mapping for better searchability",
      });
    }

    if (!recordType.fields.content) {
      warnings.push({
        path: `recordTypes.${typeName}.fields.content`,
        message: "Missing content field mapping",
        suggestion: "Add a content field mapping for better search results",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
