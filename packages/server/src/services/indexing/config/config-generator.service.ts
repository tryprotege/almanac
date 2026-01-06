import type {
  IndexingConfig,
  GeneratedSyncConfigResult,
  ValidationResult,
} from "@ebee-oss/indexing-engine";
import { mcpClientManager } from "../../../mcp/client.js";
import { generateConfigPrompt } from "./prompts/config-generation.js";
import {
  generateDebugPrompt,
  parseDebugResponse,
} from "./prompts/config-debug.js";
import { createLLMClient, chat } from "../../../services/llm/index.js";
import { ModelConfigModel } from "../../../models/model-config.model.js";
import logger from "../../../utils/logger.js";
import { classifyTools, filterReadTools } from "./tool-classifier.service.js";
import {
  testConfigDryRun,
  formatErrorsForLLM,
  type TestRunResult,
} from "./config-validator.service.js";
import {
  validateConfigPost,
  type PostValidationIssue,
} from "./config-post-validator.service.js";
import { discoverToolData } from "./tool-discovery.service.js";

export interface ConfigGeneratorOptions {
  serverName: string;
  displayName?: string;
  sampleLimit?: number; // Limit sample records per tool
  maxIterations?: number; // Max debug iterations (default: 3)
  userGuidance?: string; // Optional user-provided guidance for config generation
}

/**
 * Iteration result for tracking debug attempts
 */
export interface IterationResult {
  attempt: number;
  config: IndexingConfig;
  testResult: TestRunResult;
  fixed: boolean;
}

/**
 * Result of iterative config generation
 */
export interface IterativeGenerationResult extends GeneratedSyncConfigResult {
  iterations: IterationResult[];
  totalAttempts: number;
  finalTestResult?: TestRunResult;
}

/**
 * Generate an IndexingConfig with iterative debugging
 * Runs a dry test and automatically fixes errors up to maxIterations times
 */
export async function generateConfigIterative(
  options: ConfigGeneratorOptions
): Promise<IterativeGenerationResult> {
  const {
    serverName,
    displayName,
    sampleLimit = 3,
    maxIterations = 3,
  } = options;

  logger.info(
    `Starting iterative config generation for: ${serverName} (max ${maxIterations} attempts)`
  );

  const iterations: IterationResult[] = [];
  let currentConfig: IndexingConfig | null = null;
  let samples: Record<string, any> = {};
  let toolsUsed: string[] = [];
  let classificationResult: any = null;

  // Step 1: Generate initial config
  const initialResult = await generateConfig(options);
  currentConfig = initialResult.config;
  samples = initialResult.samples || {};
  toolsUsed = initialResult.toolsUsed || [];

  // Step 2: Test and iterate
  for (let attempt = 1; attempt <= maxIterations; attempt++) {
    logger.info(`Testing config: attempt ${attempt}/${maxIterations}`);

    // Run dry test
    const testResult = await testConfigDryRun(currentConfig, serverName);

    iterations.push({
      attempt,
      config: { ...currentConfig },
      testResult,
      fixed: testResult.success,
    });

    if (testResult.success) {
      logger.info(`Config passed validation on attempt ${attempt}`);
      return {
        config: currentConfig,
        validation: validateConfig(currentConfig),
        samples,
        toolsUsed,
        iterations,
        totalAttempts: attempt,
        finalTestResult: testResult,
      };
    }

    // If this is the last attempt, return what we have
    if (attempt === maxIterations) {
      logger.warn(
        `Config still has errors after ${maxIterations} attempts. Returning best effort.`
      );
      break;
    }

    // Generate debug prompt and fix config
    logger.info(
      `Config has ${testResult.errors.length} errors, attempting fix...`
    );

    try {
      const debugPrompt = generateDebugPrompt({
        originalConfig: currentConfig,
        testResult,
        samples,
        attemptNumber: attempt + 1,
        maxAttempts: maxIterations,
      });

      logger.info(`Sending debug prompt to LLM (attempt ${attempt + 1})...`);
      const fixedResponse = await callLLM(debugPrompt);
      const fixedConfig = parseDebugResponse(fixedResponse);

      // Preserve tool classifications
      fixedConfig.toolClassifications = currentConfig.toolClassifications;

      currentConfig = fixedConfig;
      logger.info(`Received fixed config from LLM, testing again...`);
    } catch (err) {
      logger.error({ err }, `Failed to parse fixed config, continuing...`);
      // Continue with current config for next iteration
    }
  }

  // Return the last config we have (may still have errors)
  const finalTestResult = iterations[iterations.length - 1]?.testResult;

  return {
    config: currentConfig,
    validation: validateConfig(currentConfig),
    samples,
    toolsUsed,
    iterations,
    totalAttempts: iterations.length,
    finalTestResult,
  };
}

/**
 * Generate an IndexingConfig for an MCP server
 */
export async function generateConfig(
  options: ConfigGeneratorOptions
): Promise<GeneratedSyncConfigResult> {
  const { serverName, displayName, sampleLimit = 3 } = options;

  logger.info(`Generating config for MCP server: ${serverName}`);

  // Step 1: Collect tool definitions
  const toolDefinitions = await collectToolDefinitions(serverName);

  if (toolDefinitions.length === 0) {
    throw new Error(`No tools found for MCP server: ${serverName}`);
  }

  // Step 2: Classify tools using LLM (NEW)
  logger.info(`Classifying ${toolDefinitions.length} tools for indexing...`);
  const classificationResult = await classifyTools({
    serverName,
    tools: toolDefinitions,
  });

  // Step 3: Filter to read-only tools (NEW)
  const readOnlyTools = filterReadTools(
    toolDefinitions,
    classificationResult.classifications,
    { skipSearch: true } // Skip search tools by default
  );

  logger.info(
    `Filtered to ${readOnlyTools.length} read-only tools (${classificationResult.readTools.length} read, skipped ${classificationResult.searchTools.length} search, ${classificationResult.writeTools.length} write)`
  );

  if (readOnlyTools.length === 0) {
    throw new Error(
      `No read-only tools found for MCP server: ${serverName}. All tools are either write or search operations.`
    );
  }

  // Step 4: Discover tool data (samples + schemas) using new discovery service
  const discoveryResult = await discoverToolData(serverName, readOnlyTools, {
    sampleLimit,
    maxDepth: 5,
  });

  logger.info(
    {
      stats: discoveryResult.stats,
      failureReasons: Object.keys(discoveryResult.failureReasons).length,
    },
    "Tool discovery complete"
  );

  // Step 5: Build LLM prompt (updated to include classifications, user guidance, and failure reasons)
  // Convert ToolFailureReason objects to strings for the prompt
  const failureReasonsAsStrings: Record<string, string> = {};
  for (const [toolName, reason] of Object.entries(
    discoveryResult.failureReasons
  )) {
    failureReasonsAsStrings[toolName] =
      typeof reason === "string" ? reason : reason.details || "Unknown error";
  }

  const prompt = generateConfigPrompt({
    serverName,
    displayName: displayName || serverName,
    tools: readOnlyTools, // Only read tools
    samples: discoveryResult.samples,
    classifications: classificationResult.classifications,
    userGuidance: options.userGuidance,
    failureReasons: failureReasonsAsStrings,
  });

  // Step 6: Call LLM to generate config
  const config = await callLLMForConfig(prompt);

  // Step 7: Attach tool classifications to config
  config.toolClassifications = classificationResult.classifications;

  // Step 8: Run post-generation validation (NEW - Phase 1)
  const postValidation = await validateConfigPost(
    config,
    discoveryResult.samples
  );

  if (!postValidation.valid) {
    logger.warn(
      { issues: postValidation.issues },
      "Post-generation validation found issues"
    );
  }

  // Step 9: Validate generated config
  const validation = validateConfig(config);

  // Merge post-validation issues into validation result
  if (postValidation.issues.length > 0) {
    for (const issue of postValidation.issues) {
      if (issue.severity === "error") {
        validation.errors.push({
          path: issue.path,
          message: issue.message,
          code: "POST_VALIDATION_ERROR",
        });
      } else {
        validation.warnings.push({
          path: issue.path,
          message: issue.message,
          suggestion: issue.suggestion,
        });
      }
    }
    validation.valid = validation.errors.length === 0;
  }

  // Log the full prompt for debugging
  logger.debug({ prompt }, "Full prompt sent to LLM for config generation");

  return {
    config,
    validation,
    samples: discoveryResult.samples,
    toolsUsed: readOnlyTools.map((t) => t.name),
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
 * Discovered value from tool execution
 */
interface DiscoveredValue {
  value: any;
  fieldName: string;
  sourceTool: string;
  sourceLevel: number;
  parentPath?: string;
  fullObject?: any;
}

/**
 * Tool dependency information
 */
interface ToolDependency {
  tool: string;
  requiredParams: string[];
  idParams: string[];
  level: number;
  dependsOn: string[];
}

/**
 * Generic ID registry for multi-level discovery
 */
class GenericIDRegistry {
  private values: DiscoveredValue[] = [];

  register(
    value: any,
    fieldName: string,
    sourceTool: string,
    level: number,
    parentPath?: string,
    fullObject?: any
  ) {
    this.values.push({
      value,
      fieldName,
      sourceTool,
      sourceLevel: level,
      parentPath,
      fullObject,
    });
  }

  findForParameter(paramName: string, targetTool: string): any {
    // Strategy 1: Exact field name match
    const exactMatch = this.values.find((v) => v.fieldName === paramName);
    if (exactMatch) return exactMatch.value;

    // Strategy 2: Normalize and match (database_id matches databaseId)
    const normalizedParam = paramName.toLowerCase().replace(/_/g, "");
    const normalizedMatch = this.values.find(
      (v) => v.fieldName.toLowerCase().replace(/_/g, "") === normalizedParam
    );
    if (normalizedMatch) return normalizedMatch.value;

    // Strategy 3: Partial match (database_id contains "database")
    const partialMatch = this.values.find(
      (v) =>
        paramName.toLowerCase().includes(v.fieldName.toLowerCase()) ||
        v.fieldName.toLowerCase().includes(paramName.toLowerCase())
    );
    if (partialMatch) return partialMatch.value;

    // Strategy 4: Generic "id" field
    const genericId = this.values.find((v) => v.fieldName === "id");
    if (genericId) return genericId.value;

    return null;
  }

  getAllForFieldName(fieldName: string): any[] {
    return this.values
      .filter((v) => v.fieldName === fieldName)
      .map((v) => v.value);
  }

  getValues(): DiscoveredValue[] {
    return this.values;
  }

  getStats(): { totalValues: number; byField: Record<string, number> } {
    const byField: Record<string, number> = {};
    for (const v of this.values) {
      byField[v.fieldName] = (byField[v.fieldName] || 0) + 1;
    }
    return { totalValues: this.values.length, byField };
  }
}

/**
 * Analyze tool dependencies and assign execution levels
 */
function analyzeDependencies(tools: any[]): ToolDependency[] {
  const deps: ToolDependency[] = [];

  // Step 1: Build dependency info for each tool
  for (const tool of tools) {
    const required = tool.inputSchema?.required || [];

    // Identify ID parameters (params that look like they need IDs)
    const idParams = required.filter(
      (param: string) =>
        param.toLowerCase().includes("id") ||
        param.endsWith("_id") ||
        param.endsWith("Id")
    );

    deps.push({
      tool: tool.name,
      requiredParams: required,
      idParams,
      level: idParams.length === 0 ? 0 : -1, // -1 means needs resolution
      dependsOn: idParams,
    });
  }

  // Step 2: Assign execution levels using iterative resolution
  let currentLevel = 0;
  let unresolved = deps.filter((d) => d.level === -1);
  let resolved = deps.filter((d) => d.level >= 0);
  const maxIterations = 10; // Prevent infinite loops

  for (let iter = 0; iter < maxIterations && unresolved.length > 0; iter++) {
    const canExecuteNow = unresolved.filter((dep) => {
      // Can execute if all ID params can potentially be satisfied by lower levels
      return dep.idParams.every((param) => canBeSatisfiedBy(param, resolved));
    });

    if (canExecuteNow.length === 0) {
      // No progress - break out
      logger.warn(
        `Cannot resolve ${unresolved.length} tools - circular dependency or no producer`
      );
      break;
    }

    currentLevel++;
    canExecuteNow.forEach((dep) => (dep.level = currentLevel));
    resolved.push(...canExecuteNow);
    unresolved = unresolved.filter((d) => !canExecuteNow.includes(d));
  }

  // Mark any remaining unresolved tools as level 999 (unexecutable)
  unresolved.forEach((dep) => (dep.level = 999));

  return [...resolved, ...unresolved];
}

/**
 * Check if a parameter can potentially be satisfied by already-resolved tools
 */
function canBeSatisfiedBy(
  paramName: string,
  resolvedTools: ToolDependency[]
): boolean {
  // Heuristic: if ANY resolved tool might produce this type of ID, return true
  // We use simple name matching: a tool named "list_pages" likely produces page_ids

  const paramLower = paramName.toLowerCase();

  for (const tool of resolvedTools) {
    const toolLower = tool.tool.toLowerCase();

    // Direct match: tool name contains param name
    // e.g., "list_pages" can satisfy "page_id"
    if (
      toolLower.includes(paramLower.replace("_id", "").replace("id", "")) ||
      paramLower.includes(toolLower)
    ) {
      return true;
    }

    // Generic: Level 0 tools (no deps) can provide generic IDs
    if (tool.level === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively extract all ID-like values from a response
 */
function extractAllIds(
  obj: any,
  path: string = "",
  maxDepth: number = 5
): DiscoveredValue[] {
  const ids: DiscoveredValue[] = [];

  if (maxDepth <= 0 || obj === null || obj === undefined) {
    return ids;
  }

  // Handle MCP text content format
  if (obj?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse(obj.content[0].text);
      return extractAllIds(parsed, path, maxDepth);
    } catch {
      // Not JSON, continue
    }
  }

  if (typeof obj === "object" && !Array.isArray(obj)) {
    // Object: check each key
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${key}` : key;

      // If key looks like an ID field and value is primitive, record it
      if (
        (key.toLowerCase().includes("id") ||
          key === "id" ||
          key.endsWith("_id") ||
          key.endsWith("Id")) &&
        (typeof value === "string" || typeof value === "number") &&
        value !== null &&
        value !== ""
      ) {
        ids.push({
          value,
          fieldName: key,
          sourceTool: "",
          sourceLevel: -1,
          parentPath: path,
          fullObject: obj,
        });
      }

      // Recurse into nested objects/arrays
      if (typeof value === "object" && value !== null) {
        ids.push(...extractAllIds(value, fullPath, maxDepth - 1));
      }
    }
  } else if (Array.isArray(obj)) {
    // Array: extract from each item (limit to first few items)
    const itemsToCheck = obj.slice(0, 5); // Only check first 5 items
    for (let i = 0; i < itemsToCheck.length; i++) {
      const fullPath = path ? `${path}[${i}]` : `[${i}]`;
      ids.push(...extractAllIds(itemsToCheck[i], fullPath, maxDepth - 1));
    }
  }

  return ids;
}

/**
 * Build parameters for a tool using the ID registry
 */
function buildParametersFromRegistry(
  dep: ToolDependency,
  registry: GenericIDRegistry,
  toolDef: any
): Record<string, any> | null {
  const params: Record<string, any> = {};

  for (const paramName of dep.requiredParams) {
    if (dep.idParams.includes(paramName)) {
      // This is an ID parameter - find from registry
      const value = registry.findForParameter(paramName, dep.tool);
      if (!value) {
        logger.debug(
          { tool: dep.tool, param: paramName },
          "Cannot find value for ID parameter"
        );
        return null; // Can't satisfy
      }
      params[paramName] = value;
    } else {
      // Non-ID parameter - use default
      const schema = toolDef.inputSchema?.properties?.[paramName];
      params[paramName] = getDefaultValueForSchema(schema);
    }
  }

  return params;
}

/**
 * Get default value for a parameter schema
 */
function getDefaultValueForSchema(schema: any): any {
  if (!schema) return "";

  switch (schema.type) {
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "";
  }
}

/**
 * Check if a response contains an error
 */
function isErrorResponse(response: any): boolean {
  // Direct error field
  if (response?.error) return true;

  // Notion-style errors in content[0].text
  if (response?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse(response.content[0].text);
      if (parsed.status >= 400 || parsed.object === "error") {
        return true;
      }
    } catch {
      // Not JSON or parse error, continue checking
    }
  }

  // HTTP error status codes
  if (response?.status >= 400) return true;

  // Common error message fields
  if (
    response?.errorMessage ||
    response?.error_message ||
    (typeof response?.message === "string" &&
      response.message.toLowerCase().includes("error"))
  ) {
    return true;
  }

  // Check for empty or null data that might indicate an error
  if (response === null || response === undefined) return true;

  return false;
}

/**
 * Fetch sample data using multi-level dependency resolution
 */
async function fetchSampleData(
  serverName: string,
  toolDefinitions: any[],
  limit: number
): Promise<Record<string, any>> {
  logger.info(
    `Fetching sample data from ${toolDefinitions.length} tools using multi-level discovery...`
  );

  // Step 1: Analyze dependencies and assign execution levels
  const dependencies = analyzeDependencies(toolDefinitions);
  const maxLevel = Math.max(...dependencies.map((d) => d.level));

  logger.info(
    `Dependency analysis complete: ${maxLevel + 1} execution levels identified`
  );

  // Log level distribution
  const levelCounts: Record<number, number> = {};
  for (const dep of dependencies) {
    levelCounts[dep.level] = (levelCounts[dep.level] || 0) + 1;
  }
  logger.debug({ levelCounts }, "Tools per level");

  // Step 2: Execute tools level by level, building up ID registry
  const registry = new GenericIDRegistry();
  const samples: Record<string, any> = {};
  let totalSuccess = 0;
  let totalFail = 0;

  for (let level = 0; level <= maxLevel; level++) {
    const toolsAtLevel = dependencies.filter((d) => d.level === level);

    if (toolsAtLevel.length === 0) continue;

    logger.info(`Level ${level}: Executing ${toolsAtLevel.length} tools`);

    for (const dep of toolsAtLevel) {
      const toolDef = toolDefinitions.find((t) => t.name === dep.tool);
      if (!toolDef) {
        logger.warn({ tool: dep.tool }, "Tool definition not found");
        continue;
      }

      try {
        // Build parameters using registry
        const params = buildParametersFromRegistry(dep, registry, toolDef);

        if (!params) {
          logger.debug(
            { tool: dep.tool, requiredIds: dep.idParams },
            "Cannot satisfy required parameters - skipping"
          );
          samples[dep.tool] = {
            error: `Missing required IDs: ${dep.idParams.join(", ")}`,
          };
          totalFail++;
          continue;
        }

        // Execute tool
        logger.debug({ tool: dep.tool, params, level }, "Calling tool");
        const response = await mcpClientManager.callTool(
          serverName,
          dep.tool,
          params
        );

        // Check for errors
        if (isErrorResponse(response)) {
          totalFail++;
          logger.warn(
            { tool: dep.tool, params, response },
            `Tool returned error at level ${level}`
          );
          samples[dep.tool] = { error: "Tool returned error response" };
          continue;
        }

        // Success - store sample and extract IDs
        samples[dep.tool] = limitSampleSize(response, limit);
        totalSuccess++;

        // Extract ALL IDs from response and register them
        const extractedIds = extractAllIds(response);
        for (const id of extractedIds) {
          registry.register(
            id.value,
            id.fieldName,
            dep.tool,
            level,
            id.parentPath
          );
        }

        const registryStats = registry.getStats();
        logger.debug(
          {
            tool: dep.tool,
            level,
            extractedCount: extractedIds.length,
            registryTotal: registryStats.totalValues,
          },
          "Tool succeeded and IDs extracted"
        );
      } catch (error) {
        totalFail++;
        logger.warn({ error, tool: dep.tool, level }, "Tool execution failed");
        samples[dep.tool] = { error: "Execution failed" };
      }
    }
  }

  // Handle unexecutable tools (level 999)
  const unexecutable = dependencies.filter((d) => d.level === 999);
  if (unexecutable.length > 0) {
    logger.warn(
      { count: unexecutable.length, tools: unexecutable.map((d) => d.tool) },
      "Some tools could not be executed due to unresolvable dependencies"
    );
    for (const dep of unexecutable) {
      samples[dep.tool] = {
        error: `Unresolvable dependencies: ${dep.idParams.join(", ")}`,
      };
      totalFail++;
    }
  }

  // Log final stats
  const registryStats = registry.getStats();
  logger.info(
    {
      totalSuccess,
      totalFail,
      registryTotal: registryStats.totalValues,
      idFields: Object.keys(registryStats.byField),
    },
    "Multi-level discovery complete"
  );

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

  logger.info(`LLM response received: ${response.length} characters`);
  logger.debug({ msg: `LLM response preview...`, response });

  // Parse JSON response to IndexingConfig
  const config = parseConfigFromLLM(response);

  logger.info("Successfully parsed config from LLM response");

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

  // Use dedicated indexing config model if set, otherwise fall back to chat model
  const modelToUse =
    modelConfig.llmIndexingConfigModel || modelConfig.llmChatModel;

  logger.info(
    `Calling LLM: ${modelConfig.llmProvider} / ${modelToUse}${
      modelConfig.llmIndexingConfigModel
        ? " (indexing config model)"
        : " (chat model fallback)"
    }`
  );
  logger.debug(`Prompt length: ${prompt.length} characters`);

  // LOG PROMPT IMMEDIATELY at INFO level
  logger.info("=== LLM PROMPT START ===");
  logger.info(prompt);
  logger.info("=== LLM PROMPT END ===");

  try {
    // Build options for LLM call
    const options: any = {
      model: modelToUse,
      temperature: 0.15, // Lower temperature for structured output
      maxTokens: 16000, // Allow large configs (increased for complex servers)
      reasoning_effort: "high",
    };

    // Call LLM with the prompt
    const response = await chat(
      client,
      [{ role: "user", content: prompt }],
      options
    );

    logger.info("LLM call completed successfully");
    return response;
  } catch (err) {
    logger.error({ err }, "LLM call failed");
    throw new Error(
      `LLM API call failed: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );
  }
}

/**
 * Parse LLM response into IndexingConfig
 */
function parseConfigFromLLM(response: string): IndexingConfig {
  // Extract JSON from markdown code blocks if present
  let jsonContent = response.trim();

  logger.debug("Extracting JSON from LLM response...");

  // Remove markdown code fences if present
  const jsonMatch = jsonContent.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
    logger.debug("Found JSON code block");
  } else {
    // Try generic code block
    const codeMatch = jsonContent.match(/```\n([\s\S]*?)\n```/);
    if (codeMatch) {
      jsonContent = codeMatch[1];
      logger.debug("Found generic code block");
    } else {
      logger.debug("No code blocks found, using raw response");
    }
  }

  logger.debug(`JSON content length: ${jsonContent.length} characters`);
  logger.debug(`JSON content preview:\n${jsonContent.substring(0, 500)}...`);

  // Parse JSON
  try {
    const config = JSON.parse(jsonContent) as IndexingConfig;
    logger.info("Successfully parsed JSON into IndexingConfig");
    logger.debug(
      `Config has ${Object.keys(config.fetchers || {}).length} fetchers and ${
        Object.keys(config.recordTypes || {}).length
      } record types`
    );
    return config;
  } catch (error) {
    logger.error(
      { error, jsonContent },
      "Failed to parse JSON from LLM response"
    );
    throw new Error(`Failed to parse LLM response as JSON: ${error}`);
  }
}

/**
 * Validate generated config
 */
function validateConfig(config: IndexingConfig): ValidationResult {
  logger.info("Validating generated config...");

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

  const isValid = errors.length === 0;

  logger.info(`Validation complete: ${isValid ? "PASSED" : "FAILED"}`);
  if (errors.length > 0) {
    logger.error({ errors }, "Config validation errors");
  }
  if (warnings.length > 0) {
    logger.warn({ warnings }, "Config validation warnings");
  }

  return {
    valid: isValid,
    errors,
    warnings,
  };
}
