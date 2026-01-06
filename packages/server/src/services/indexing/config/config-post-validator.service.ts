import type { IndexingConfig } from "@ebee-oss/indexing-engine";
import logger from "../../../utils/logger.js";

export interface PostValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
  suggestion?: string;
}

export interface PostValidationResult {
  valid: boolean;
  issues: PostValidationIssue[];
}

/**
 * Post-generation validation to catch common config issues
 * before attempting execution
 */
export async function validateConfigPost(
  config: IndexingConfig,
  samples: Record<string, any>
): Promise<PostValidationResult> {
  const issues: PostValidationIssue[] = [];

  // Run all validation checks
  issues.push(...detectPlaceholders(config));
  issues.push(...validateEnrichmentPaths(config, samples));
  issues.push(...validateDiscoveryMechanisms(config));
  issues.push(...validateArrayPaths(config, samples));
  issues.push(...validateRecordIdFields(config, samples));
  issues.push(...validateEnrichmentOnlyTools(config));

  // Auto-repair critical issues
  const repairedConfig = autoRepair(config, issues, samples);

  // Re-validate after repairs if config was modified
  if (repairedConfig !== config) {
    logger.info("Auto-repaired config, re-validating...");
    return validateConfigPost(repairedConfig, samples);
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  logger.info(
    {
      errors: errors.length,
      warnings: warnings.length,
    },
    "Post-generation validation complete"
  );

  return {
    valid: errors.length === 0,
    issues,
  };
}

/**
 * Detect placeholder/hardcoded values in fetcher parameters
 */
function detectPlaceholders(config: IndexingConfig): PostValidationIssue[] {
  const issues: PostValidationIssue[] = [];
  const placeholderPatterns = [
    /example/i,
    /placeholder/i,
    /your[-_]?/i,
    /test[-_]?/i,
    /dummy/i,
    /sample/i,
    /123+/,
    /abc+def/i,
    /\[.*\]/,
    /undefined/i,
    /null/i,
  ];

  for (const [fetcherName, fetcher] of Object.entries(config.fetchers || {})) {
    if (!fetcher.params) continue;

    for (const [paramName, paramValue] of Object.entries(fetcher.params)) {
      const valueStr = String(paramValue);

      // Check for placeholder patterns
      for (const pattern of placeholderPatterns) {
        if (pattern.test(valueStr)) {
          issues.push({
            severity: "error",
            path: `fetchers.${fetcherName}.params.${paramName}`,
            message: `Detected placeholder value: "${valueStr}". This fetcher won't work with hardcoded placeholder data.`,
            suggestion:
              "Remove this fetcher or replace with a tool that can discover records dynamically (e.g., list/search tools instead of single-fetch tools).",
          });
          break;
        }
      }

      // Check for very long IDs that look like examples
      if (valueStr.length > 50 && /[0-9a-f]{20,}/.test(valueStr)) {
        issues.push({
          severity: "warning",
          path: `fetchers.${fetcherName}.params.${paramName}`,
          message: `Parameter contains a long ID that may be a placeholder: "${valueStr.substring(
            0,
            50
          )}..."`,
          suggestion:
            "Verify this is a valid, dynamic parameter and not a hardcoded example.",
        });
      }
    }
  }

  return issues;
}

/**
 * Validate that enrichment paramMappings can be resolved from sample data
 */
function validateEnrichmentPaths(
  config: IndexingConfig,
  samples: Record<string, any>
): PostValidationIssue[] {
  const issues: PostValidationIssue[] = [];

  for (const [recordTypeName, recordType] of Object.entries(
    config.recordTypes || {}
  )) {
    if (!recordType.enrichments) continue;

    // Get sample data for this record type's fetcher
    const fetcherName = recordType.fetcher;
    const fetcherConfig = config.fetchers?.[fetcherName];
    if (!fetcherConfig) continue;

    const sampleData = samples[fetcherConfig.tool];

    if (!sampleData) {
      issues.push({
        severity: "warning",
        path: `recordTypes.${recordTypeName}.enrichments`,
        message: `No sample data available to validate enrichment paths for fetcher "${fetcherName}"`,
      });
      continue;
    }

    // Extract sample record
    const sampleRecord = extractSampleRecord(sampleData, fetcherConfig);
    if (!sampleRecord) continue;

    // Validate each enrichment
    for (const enrichment of recordType.enrichments) {
      if (!enrichment.paramMapping) continue;

      for (const [paramName, paramPath] of Object.entries(
        enrichment.paramMapping
      )) {
        // Try to resolve the path from sample record
        const resolved = resolvePath(sampleRecord, paramPath);

        if (resolved === undefined || resolved === null) {
          issues.push({
            severity: "error",
            path: `recordTypes.${recordTypeName}.enrichments[${enrichment.name}].paramMapping.${paramName}`,
            message: `Cannot resolve path "${paramPath}" from sample data. The enrichment will fail with undefined parameters.`,
            suggestion: `Check the sample data structure and update the path. Sample record keys: ${Object.keys(
              sampleRecord || {}
            ).join(", ")}`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check that each record type has a proper discovery mechanism
 */
function validateDiscoveryMechanisms(
  config: IndexingConfig
): PostValidationIssue[] {
  const issues: PostValidationIssue[] = [];

  for (const [recordTypeName, recordType] of Object.entries(
    config.recordTypes || {}
  )) {
    const fetcherName = recordType.fetcher;
    const fetcher = config.fetchers?.[fetcherName];

    if (!fetcher) {
      issues.push({
        severity: "error",
        path: `recordTypes.${recordTypeName}.fetcher`,
        message: `Referenced fetcher "${fetcherName}" does not exist`,
      });
      continue;
    }

    // Check if fetcher has hardcoded params (suggests single-fetch, not discovery)
    if (fetcher.params && Object.keys(fetcher.params).length > 0) {
      // Check if params look like identifiers (id, url, etc.)
      const paramKeys = Object.keys(fetcher.params);
      const identifierParams = paramKeys.filter((k) =>
        /^(id|url|key|slug|path)$/i.test(k)
      );

      if (identifierParams.length > 0) {
        issues.push({
          severity: "warning",
          path: `recordTypes.${recordTypeName}.fetcher`,
          message: `Fetcher "${fetcherName}" has hardcoded identifier parameters: ${identifierParams.join(
            ", "
          )}. This suggests it can only fetch a single record, not discover multiple records.`,
          suggestion:
            "Consider using a list/search tool instead for the primary fetcher. Single-fetch tools should be used in enrichments, not as the main record source.",
        });
      }
    }

    // Check if pagination is missing (suggests single record)
    if (!fetcher.pagination) {
      issues.push({
        severity: "warning",
        path: `fetchers.${fetcherName}.pagination`,
        message: `Fetcher "${fetcherName}" has no pagination configured. It may only return a single page of results.`,
        suggestion:
          "Add pagination configuration if this tool supports it, or verify that all records can be fetched in a single request.",
      });
    }
  }

  return issues;
}

/**
 * Validate that fetchers with array responses have arrayPath configured
 */
function validateArrayPaths(
  config: IndexingConfig,
  samples: Record<string, any>
): PostValidationIssue[] {
  const issues: PostValidationIssue[] = [];

  for (const [fetcherName, fetcher] of Object.entries(config.fetchers || {})) {
    const sample = samples[fetcher.tool];
    if (!sample) continue;

    // Check if sample contains an array that needs arrayPath
    const detectedArrayPath = detectArrayPath(sample);

    if (detectedArrayPath && !(fetcher as any).arrayPath) {
      issues.push({
        severity: "error",
        path: `fetchers.${fetcherName}.arrayPath`,
        message: `Fetcher returns an array response but is missing arrayPath configuration. This will cause "Record missing ID field" errors.`,
        suggestion: `Add arrayPath: "${detectedArrayPath}" to extract individual items from the array.`,
      });
    }
  }

  return issues;
}

/**
 * Validate that records have ID fields after extraction
 */
function validateRecordIdFields(
  config: IndexingConfig,
  samples: Record<string, any>
): PostValidationIssue[] {
  const issues: PostValidationIssue[] = [];

  // Common ID field names to check for
  const commonIdFields = ["id", "_id", "sourceId", "recordId", "uuid", "guid"];

  for (const [recordTypeName, recordType] of Object.entries(
    config.recordTypes || {}
  )) {
    const fetcherName = recordType.fetcher;
    const fetcherConfig = config.fetchers?.[fetcherName];

    if (!fetcherConfig) continue;

    const sampleData = samples[fetcherConfig.tool];
    if (!sampleData) continue;

    // Extract sample record using arrayPath if configured
    const sampleRecord = extractSampleRecord(sampleData, fetcherConfig);
    if (!sampleRecord || typeof sampleRecord !== "object") continue;

    // Check if sample record has any common ID field
    const hasCommonIdField = commonIdFields.some(
      (field) =>
        sampleRecord[field] !== undefined && sampleRecord[field] !== null
    );

    // Get all keys from sample record to suggest alternatives
    const sampleKeys = Object.keys(sampleRecord);

    // Look for fields that might be IDs (ending with _id or containing "id")
    const potentialIdFields = sampleKeys.filter(
      (key) =>
        key.endsWith("_id") ||
        key.endsWith("Id") ||
        key.toLowerCase().includes("id") ||
        key === "url" ||
        key === "uri"
    );

    if (!hasCommonIdField && potentialIdFields.length === 0) {
      // No ID field found at all - critical error
      issues.push({
        severity: "error",
        path: `recordTypes.${recordTypeName}`,
        message: `Records from fetcher "${fetcherName}" do not have an ID field. Found keys: ${sampleKeys
          .slice(0, 10)
          .join(", ")}${sampleKeys.length > 10 ? "..." : ""}`,
        suggestion: `Add an explicit ID field mapping in the record type config, or ensure the fetcher returns records with 'id', '_id', or 'sourceId' fields.`,
      });
    } else if (!hasCommonIdField && potentialIdFields.length > 0) {
      // Has potential ID fields but not standard ones - warning with suggestion
      issues.push({
        severity: "warning",
        path: `recordTypes.${recordTypeName}`,
        message: `Records from fetcher "${fetcherName}" don't have standard ID fields (id, _id, sourceId). Potential ID fields found: ${potentialIdFields.join(
          ", "
        )}`,
        suggestion: `Consider adding an explicit ID field mapping: "fields": { "id": { "type": "path", "path": "$.${potentialIdFields[0]}" } }`,
      });
    }
  }

  return issues;
}

/**
 * Validate that enrichment-only tools are not used as record types
 */
function validateEnrichmentOnlyTools(
  config: IndexingConfig
): PostValidationIssue[] {
  const issues: PostValidationIssue[] = [];

  for (const [recordTypeName, recordType] of Object.entries(
    config.recordTypes || {}
  )) {
    const fetcherName = recordType.fetcher;
    const fetcher = config.fetchers?.[fetcherName];

    if (!fetcher) continue;

    // Check if this looks like an enrichment-only tool
    const toolName = fetcher.tool;
    const isEnrichmentTool =
      toolName.startsWith("get_") ||
      toolName.startsWith("fetch_") ||
      (fetcher.params &&
        Object.keys(fetcher.params).some((k) => k.endsWith("_id")));

    if (isEnrichmentTool) {
      issues.push({
        severity: "error",
        path: `recordTypes.${recordTypeName}`,
        message: `Record type uses enrichment-only tool "${toolName}". Tools that require IDs should only be used in enrichments, not as primary record types.`,
        suggestion: `Remove this record type. If this data is needed, add it as an enrichment on the parent record type.`,
      });
    }
  }

  return issues;
}

/**
 * Auto-repair common config issues
 */
function autoRepair(
  config: IndexingConfig,
  issues: PostValidationIssue[],
  samples: Record<string, any>
): IndexingConfig {
  let repaired = false;
  const newConfig = JSON.parse(JSON.stringify(config)); // Deep clone

  // Fix 1: Add missing arrayPath
  for (const issue of issues) {
    if (issue.path.endsWith(".arrayPath") && issue.severity === "error") {
      const match = issue.path.match(/fetchers\.([^.]+)\.arrayPath/);
      if (match) {
        const fetcherName = match[1];
        const fetcher = newConfig.fetchers[fetcherName];
        const sample = samples[fetcher.tool];

        if (sample && fetcher && !fetcher.arrayPath) {
          const arrayPath = detectArrayPath(sample);
          if (arrayPath) {
            logger.info(
              { fetcherName, arrayPath },
              "Auto-repair: Adding missing arrayPath"
            );
            fetcher.arrayPath = arrayPath;
            repaired = true;
          }
        }
      }
    }
  }

  // Fix 2: Remove record types that use enrichment-only tools
  const recordTypesToRemove: string[] = [];
  for (const issue of issues) {
    if (
      issue.severity === "error" &&
      issue.message.includes("enrichment-only tool")
    ) {
      const match = issue.path.match(/recordTypes\.([^.]+)/);
      if (match) {
        const recordTypeName = match[1];
        recordTypesToRemove.push(recordTypeName);
      }
    }
  }

  for (const recordTypeName of recordTypesToRemove) {
    logger.warn(
      { recordTypeName },
      "Auto-repair: Removing invalid record type (enrichment-only tool)"
    );
    delete newConfig.recordTypes[recordTypeName];
    repaired = true;
  }

  // Fix 3: Remove fetchers that are only used in removed record types
  const usedFetchers = new Set<string>();
  for (const recordType of Object.values(newConfig.recordTypes) as any[]) {
    if (recordType && recordType.fetcher) {
      usedFetchers.add(recordType.fetcher);
    }
    if (recordType && recordType.enrichments) {
      for (const enrichment of recordType.enrichments) {
        // Enrichments reference tools directly, not fetcher names
        // So we don't add them to usedFetchers
      }
    }
  }

  const fetchersToRemove: string[] = [];
  for (const [fetcherName, fetcher] of Object.entries(newConfig.fetchers)) {
    if (!usedFetchers.has(fetcherName)) {
      fetchersToRemove.push(fetcherName);
    }
  }

  for (const fetcherName of fetchersToRemove) {
    logger.warn({ fetcherName }, "Auto-repair: Removing unused fetcher");
    delete newConfig.fetchers[fetcherName];
    // Remove from syncOrder too
    newConfig.syncOrder = newConfig.syncOrder.filter(
      (name: string) => name !== fetcherName
    );
    repaired = true;
  }

  return repaired ? newConfig : config;
}

/**
 * Detect arrayPath from sample data
 */
function detectArrayPath(sample: any): string | null {
  if (!sample || typeof sample !== "object") return null;

  // Common array field names
  const arrayFields = [
    "items",
    "results",
    "data",
    "records",
    "list",
    "entries",
    "content",
  ];

  for (const field of arrayFields) {
    if (Array.isArray(sample[field]) && sample[field].length > 0) {
      return `$.${field}[*]`;
    }
  }

  // Check nested under common wrapper keys
  const wrapperKeys = ["data", "response", "result", "body"];
  for (const wrapper of wrapperKeys) {
    if (sample[wrapper] && typeof sample[wrapper] === "object") {
      for (const field of arrayFields) {
        if (
          Array.isArray(sample[wrapper][field]) &&
          sample[wrapper][field].length > 0
        ) {
          return `$.${wrapper}.${field}[*]`;
        }
      }
    }
  }

  return null;
}

/**
 * Extract a sample record from fetcher response
 */
function extractSampleRecord(sampleData: any, fetcherConfig: any): any {
  if (!sampleData) return null;

  // If arrayPath is configured, use it
  if ((fetcherConfig as any).arrayPath) {
    const extracted = resolvePath(sampleData, (fetcherConfig as any).arrayPath);
    if (Array.isArray(extracted) && extracted.length > 0) {
      return extracted[0];
    }
  }

  // Try common array locations
  if (Array.isArray(sampleData) && sampleData.length > 0) {
    return sampleData[0];
  }

  const arrayFields = ["items", "results", "data", "records"];
  for (const field of arrayFields) {
    if (Array.isArray(sampleData[field]) && sampleData[field].length > 0) {
      return sampleData[field][0];
    }
  }

  // If it's an object, return as-is
  if (typeof sampleData === "object") {
    return sampleData;
  }

  return null;
}

/**
 * Simple JSONPath resolver (supports $.field and $.field.nested)
 */
function resolvePath(obj: any, path: string): any {
  if (!path || !obj) return undefined;

  // Remove $ prefix if present
  const cleanPath = path.replace(/^\$\.?/, "");

  if (!cleanPath) return obj;

  // Split by dots and traverse
  const parts = cleanPath.split(".");
  let current = obj;

  for (const part of parts) {
    // Handle array notation: field[0] or field[*]
    const arrayMatch = part.match(/^([^[]+)\[(\d+|\*)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current?.[key];

      if (index === "*") {
        // Return array as-is for [*]
        return current;
      } else {
        current = current?.[parseInt(index, 10)];
      }
    } else {
      current = current?.[part];
    }

    if (current === undefined) return undefined;
  }

  return current;
}
