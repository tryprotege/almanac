import type {
  IndexingConfig,
  GeneratedSyncConfigResult,
  ValidationResult,
} from '@almanac/indexing-engine';
import { env } from '../../../env.js';
import { mcpClientManager } from '../../../mcp/client.js';
import { chat } from '../../../services/llm/index.js';
import logger from '../../../utils/logger.js';
import { llm } from '../../llm/llm.js';
import { testConfigDryRun, type TestRunResult } from './config-validator.service.js';
import { generateDebugPrompt, parseDebugResponse } from './prompts/config-debug.js';
import { generateConfigPrompt } from './prompts/config-generation.js';
import { classifyTools, filterReadTools } from './tool-classifier.service.js';
import { validateConfigPost } from './config-post-validator.service.js';
import { discoverToolData } from './tool-discovery.service.js';

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
  options: ConfigGeneratorOptions,
): Promise<IterativeGenerationResult> {
  const { serverName, maxIterations = 3 } = options;

  logger.info(
    `Starting iterative config generation for: ${serverName} (max ${maxIterations} attempts)`,
  );

  const iterations: IterationResult[] = [];
  let currentConfig: IndexingConfig | null = null;
  let samples: Record<string, any> = {};
  let toolsUsed: string[] = [];

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
        `Config still has errors after ${maxIterations} attempts. Returning best effort.`,
      );
      break;
    }

    // Generate debug prompt and fix config
    logger.info(`Config has ${testResult.errors.length} errors, attempting fix...`);

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
  options: ConfigGeneratorOptions,
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
    { skipSearch: true }, // Skip search tools by default
  );

  logger.info(
    `Filtered to ${readOnlyTools.length} read-only tools (${classificationResult.readTools.length} read, skipped ${classificationResult.searchTools.length} search, ${classificationResult.writeTools.length} write)`,
  );

  if (readOnlyTools.length === 0) {
    throw new Error(
      `No read-only tools found for MCP server: ${serverName}. All tools are either write or search operations.`,
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
    'Tool discovery complete',
  );

  // Step 5: Build LLM prompt (updated to include classifications, user guidance, and failure reasons)
  // Convert ToolFailureReason objects to strings for the prompt
  const failureReasonsAsStrings: Record<string, string> = {};
  for (const [toolName, reason] of Object.entries(discoveryResult.failureReasons)) {
    failureReasonsAsStrings[toolName] =
      typeof reason === 'string' ? reason : reason.details || 'Unknown error';
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
  const postValidation = await validateConfigPost(config, discoveryResult.samples);

  if (!postValidation.valid) {
    logger.warn({ issues: postValidation.issues }, 'Post-generation validation found issues');
  }

  // Step 9: Validate generated config
  const validation = validateConfig(config);

  // Merge post-validation issues into validation result
  if (postValidation.issues.length > 0) {
    for (const issue of postValidation.issues) {
      if (issue.severity === 'error') {
        validation.errors.push({
          path: issue.path,
          message: issue.message,
          code: 'POST_VALIDATION_ERROR',
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
  logger.debug({ prompt }, 'Full prompt sent to LLM for config generation');

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
 * Call LLM to generate IndexingConfig
 */
async function callLLMForConfig(prompt: string): Promise<IndexingConfig> {
  const response = await callLLM(prompt);

  logger.info(`LLM response received: ${response.length} characters`);
  logger.debug({ msg: `LLM response preview...`, response });

  // Parse JSON response to IndexingConfig
  const config = parseConfigFromLLM(response);

  logger.info('Successfully parsed config from LLM response');

  return config;
}

/**
 * Call LLM API using user-configured model from UI Settings
 */
async function callLLM(prompt: string): Promise<string> {
  logger.debug(`Prompt length: ${prompt.length} characters`);

  // LOG PROMPT IMMEDIATELY at DEBUG level
  logger.debug(prompt);

  try {
    // Call LLM with the prompt
    const response = await chat(llm, [{ role: 'user', content: prompt }], {
      model: env.LLM_INDEXING_CONFIG_MODEL,
      temperature: 0.15, // Lower temperature for structured output
      maxTokens: 16000, // Allow large configs (increased for complex servers)
      reasoningEffort: 'high',
    });

    logger.info('LLM call completed successfully');
    return response;
  } catch (err) {
    logger.error({ err }, 'LLM call failed');
    throw new Error(`LLM API call failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Parse LLM response into IndexingConfig
 */
function parseConfigFromLLM(response: string): IndexingConfig {
  // Extract JSON from markdown code blocks if present
  let jsonContent = response.trim();

  logger.debug('Extracting JSON from LLM response...');

  // Remove markdown code fences if present
  const jsonMatch = jsonContent.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
    logger.debug('Found JSON code block');
  } else {
    // Try generic code block
    const codeMatch = jsonContent.match(/```\n([\s\S]*?)\n```/);
    if (codeMatch) {
      jsonContent = codeMatch[1];
      logger.debug('Found generic code block');
    } else {
      logger.debug('No code blocks found, using raw response');
    }
  }

  logger.debug(`JSON content length: ${jsonContent.length} characters`);
  logger.debug(`JSON content preview:\n${jsonContent.substring(0, 500)}...`);

  // Parse JSON
  try {
    const config = JSON.parse(jsonContent) as IndexingConfig;
    logger.info('Successfully parsed JSON into IndexingConfig');
    logger.debug(
      `Config has ${Object.keys(config.fetchers || {}).length} fetchers and ${
        Object.keys(config.recordTypes || {}).length
      } record types`,
    );
    return config;
  } catch (error) {
    logger.error({ error, jsonContent }, 'Failed to parse JSON from LLM response');
    throw new Error(`Failed to parse LLM response as JSON: ${error}`);
  }
}

/**
 * Validate generated config
 */
function validateConfig(config: IndexingConfig): ValidationResult {
  logger.info('Validating generated config...');

  const errors = [];
  const warnings = [];

  // Basic validation
  if (!config.version) {
    errors.push({
      path: 'version',
      message: 'Missing version field',
      code: 'MISSING_VERSION',
    });
  }

  if (!config.source) {
    errors.push({
      path: 'source',
      message: 'Missing source field',
      code: 'MISSING_SOURCE',
    });
  }

  if (!config.fetchers || Object.keys(config.fetchers).length === 0) {
    errors.push({
      path: 'fetchers',
      message: 'No fetchers defined',
      code: 'NO_FETCHERS',
    });
  }

  if (!config.recordTypes || Object.keys(config.recordTypes).length === 0) {
    errors.push({
      path: 'recordTypes',
      message: 'No record types defined',
      code: 'NO_RECORD_TYPES',
    });
  }

  // Validate field mappings
  for (const [typeName, recordType] of Object.entries(config.recordTypes)) {
    if (!recordType.fields.title) {
      warnings.push({
        path: `recordTypes.${typeName}.fields.title`,
        message: 'Missing title field mapping',
        suggestion: 'Add a title field mapping for better searchability',
      });
    }

    if (!recordType.fields.content) {
      warnings.push({
        path: `recordTypes.${typeName}.fields.content`,
        message: 'Missing content field mapping',
        suggestion: 'Add a content field mapping for better search results',
      });
    }
  }

  const isValid = errors.length === 0;

  logger.info(`Validation complete: ${isValid ? 'PASSED' : 'FAILED'}`);
  if (errors.length > 0) {
    logger.error({ errors }, 'Config validation errors');
  }
  if (warnings.length > 0) {
    logger.warn({ warnings }, 'Config validation warnings');
  }

  return {
    valid: isValid,
    errors,
    warnings,
  };
}
