import { mcpClientManager } from "../../../mcp/client.js";
import logger from "../../../utils/logger.js";

/**
 * Discovered value from tool execution
 */
export interface DiscoveredValue {
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
export interface ToolDependency {
  tool: string;
  requiredParams: string[];
  idParams: string[];
  level: number;
  dependsOn: string[];
}

/**
 * Reason a tool failed to execute
 */
export interface ToolFailureReason {
  tool: string;
  category: "missing_ids" | "api_error" | "invalid_params" | "unresolvable";
  details: string;
  requiredParams?: string[];
  availableIds?: string[];
  suggestion?: string;
}

/**
 * Discovery options
 */
export interface DiscoveryOptions {
  sampleLimit?: number;
  maxDepth?: number;
  includeSchemaOnly?: boolean;
}

/**
 * Result of tool discovery process
 */
export interface ToolDiscoveryResult {
  samples: Record<string, any>; // Actual responses
  schemas: Record<string, any>; // Tool definitions
  successfulTools: string[]; // Tools that returned data
  failedTools: string[]; // Tools that errored
  skippedTools: string[]; // Tools we couldn't execute
  failureReasons: Record<string, ToolFailureReason>;
  registry: DiscoveredValue[]; // All IDs found
  executionOrder: ToolDependency[]; // Resolved execution order
  stats: {
    totalTools: number;
    withSamples: number;
    schemaOnly: number;
    unexecutable: number;
    idsDiscovered: number;
    executionLevels: number;
  };
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
 * Discover tool data by executing tools in dependency order
 *
 * This function analyzes tool dependencies, executes them level-by-level,
 * and collects both successful samples and schemas for all tools.
 *
 * @param serverName - MCP server name
 * @param toolDefinitions - Array of tool definitions
 * @param options - Discovery options
 * @returns Complete discovery result with samples, schemas, and metadata
 */
export async function discoverToolData(
  serverName: string,
  toolDefinitions: any[],
  options: DiscoveryOptions = {}
): Promise<ToolDiscoveryResult> {
  const { sampleLimit = 3, maxDepth = 5, includeSchemaOnly = true } = options;

  logger.info(
    `Discovering tool data from ${toolDefinitions.length} tools using multi-level discovery...`
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
  const schemas: Record<string, any> = {};
  const successfulTools: string[] = [];
  const failedTools: string[] = [];
  const skippedTools: string[] = [];
  const failureReasons: Record<string, ToolFailureReason> = {};

  // Build schemas map for ALL tools
  for (const tool of toolDefinitions) {
    schemas[tool.name] = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
  }

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
          const registryStats = registry.getStats();
          const availableIds = Object.keys(registryStats.byField);

          skippedTools.push(dep.tool);
          failureReasons[dep.tool] = {
            tool: dep.tool,
            category: "missing_ids",
            details: `Cannot satisfy required parameters`,
            requiredParams: dep.idParams,
            availableIds,
            suggestion:
              "Tool schema will be included for LLM without sample data",
          };

          logger.debug(
            {
              tool: dep.tool,
              requiredIds: dep.idParams,
              availableIds,
            },
            "Cannot satisfy required parameters - skipping execution"
          );
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
          failedTools.push(dep.tool);
          failureReasons[dep.tool] = {
            tool: dep.tool,
            category: "api_error",
            details: "Tool returned error response",
            suggestion:
              "Tool schema will be included for LLM without sample data",
          };

          logger.warn(
            { tool: dep.tool, params, response },
            `Tool returned error at level ${level}`
          );
          continue;
        }

        // Success - store sample and extract IDs
        samples[dep.tool] = limitSampleSize(response, sampleLimit);
        successfulTools.push(dep.tool);

        // Extract ALL IDs from response and register them
        const extractedIds = extractAllIds(response, "", maxDepth);
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
        failedTools.push(dep.tool);
        failureReasons[dep.tool] = {
          tool: dep.tool,
          category: "api_error",
          details: `Execution failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          suggestion:
            "Tool schema will be included for LLM without sample data",
        };

        logger.warn({ error, tool: dep.tool, level }, "Tool execution failed");
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
      skippedTools.push(dep.tool);
      failureReasons[dep.tool] = {
        tool: dep.tool,
        category: "unresolvable",
        details: `Circular dependency or no ID producer found`,
        requiredParams: dep.idParams,
        suggestion: "Tool schema will be included for LLM without sample data",
      };
    }
  }

  // Log final stats
  const registryStats = registry.getStats();
  const schemaOnlyCount = skippedTools.length + failedTools.length;

  logger.info(
    {
      totalSuccess: successfulTools.length,
      totalFailed: failedTools.length,
      totalSkipped: skippedTools.length,
      registryTotal: registryStats.totalValues,
      idFields: Object.keys(registryStats.byField),
    },
    "Multi-level discovery complete"
  );

  return {
    samples,
    schemas,
    successfulTools,
    failedTools,
    skippedTools,
    failureReasons,
    registry: registry.getValues(),
    executionOrder: dependencies,
    stats: {
      totalTools: toolDefinitions.length,
      withSamples: successfulTools.length,
      schemaOnly: schemaOnlyCount,
      unexecutable: unexecutable.length,
      idsDiscovered: registryStats.totalValues,
      executionLevels: maxLevel + 1,
    },
  };
}
