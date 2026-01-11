import { search } from "jmespath";
import type {
  AggregationConfig,
  FetcherConfig,
} from "@ebee-oss/indexing-engine";
import logger from "../../../utils/logger.js";

/**
 * ContentAggregatorService
 * Handles content aggregation from child fetchers into parent records
 */
export class ContentAggregatorService {
  constructor(private fetchers: Record<string, FetcherConfig>) {}

  /**
   * Aggregate content from multiple fetchers into the parent record
   */
  async aggregateContent(
    parentData: any,
    aggregationConfigs: Record<string, AggregationConfig>,
    context: {
      dataSourceId: string;
      syncConfigId: string;
    }
  ): Promise<Record<string, any>> {
    const aggregatedData: Record<string, any> = {};

    for (const [fieldName, config] of Object.entries(aggregationConfigs)) {
      try {
        const fetcherConfig = this.fetchers[config.fetcher];
        if (!fetcherConfig) {
          const error = `Aggregation fetcher '${config.fetcher}' not found`;
          if (config.required) {
            throw new Error(error);
          }
          console.warn(error);
          continue;
        }

        // Execute the aggregation fetcher
        const result = await this.executeFetcher(
          config.fetcher,
          fetcherConfig,
          parentData,
          context
        );

        // Apply merge strategy
        aggregatedData[fieldName] = result;
      } catch (error) {
        const errorMsg = `Failed to aggregate content for field '${fieldName}': ${error}`;
        if (config.required) {
          throw new Error(errorMsg);
        }
        console.warn(errorMsg);
      }
    }

    return aggregatedData;
  }

  /**
   * Execute a fetcher with parent context
   */
  private async executeFetcher(
    fetcherName: string,
    fetcherConfig: FetcherConfig,
    parentData: any,
    context: {
      dataSourceId: string;
      syncConfigId: string;
    }
  ): Promise<any> {
    // Resolve parameters from parent context
    const params = this.resolveParamsFromParent(fetcherConfig, parentData);

    logger.debug({
      msg: `[ContentAggregator] Executing fetcher '${fetcherName}' for aggregation with params:`,
      params,
    });

    // Use fetchPage to get properly extracted records with resultPath applied
    const { fetchPage } = await import("./paginated-fetcher.js");

    // Create a minimal config for the tool call
    const callConfig: FetcherConfig = {
      tool: fetcherConfig.tool,
      resultPath: fetcherConfig.resultPath,
      pagination: fetcherConfig.pagination,
      params,
      rateLimit: fetcherConfig.rateLimit,
      formatProcessor: (fetcherConfig as any).formatProcessor, // Include formatProcessor if present
    };

    const result = await fetchPage(
      context.dataSourceId,
      callConfig,
      params,
      fetcherConfig.rateLimit
    );

    // Return just the records array, not the full PageResult
    // Apply transformResult if configured
    if (fetcherConfig.transformResult) {
      return this.transformResult(
        result.records,
        fetcherConfig.transformResult
      );
    }

    return result.records;
  }

  /**
   * Resolve parameters from parent record
   * Supports $parent.field syntax
   */
  private resolveParamsFromParent(
    fetcherConfig: FetcherConfig,
    parentData: any
  ): Record<string, any> {
    const params: Record<string, any> = {};

    // First, include any static params
    if (fetcherConfig.params) {
      Object.assign(params, fetcherConfig.params);
    }

    // Then, resolve paramsFromParent
    if (fetcherConfig.paramsFromParent) {
      for (const [key, value] of Object.entries(
        fetcherConfig.paramsFromParent
      )) {
        if (typeof value === "string" && value.startsWith("$parent.")) {
          // Extract field from parent
          const fieldPath = value.substring(8); // Remove "$parent."
          const fieldValue = this.extractValue(parentData, fieldPath);
          params[key] = fieldValue;
        } else if (typeof value === "string" && value.startsWith("$")) {
          // JMESPath expression
          try {
            params[key] = search({ parent: parentData }, value);
          } catch (error) {
            console.warn(
              `Failed to evaluate JMESPath '${value}' in paramsFromParent:`,
              error
            );
            params[key] = value;
          }
        } else {
          params[key] = value;
        }
      }
    }

    return params;
  }

  /**
   * Extract a value from an object using dot notation
   */
  private extractValue(obj: any, path: string): any {
    const parts = path.split(".");
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Transform result using JMESPath expressions
   */
  private transformResult(
    data: any,
    transforms: Record<string, string>
  ): Record<string, any> {
    const transformed: Record<string, any> = {};

    for (const [fieldName, expression] of Object.entries(transforms)) {
      try {
        transformed[fieldName] = search(data, expression);
      } catch (error) {
        console.warn(
          `Failed to transform field '${fieldName}' with expression '${expression}':`,
          error
        );
      }
    }

    return transformed;
  }

  /**
   * Extract fields from aggregated data using JMESPath
   */
  extractFields(
    aggregatedData: Record<string, any>,
    extractConfig: Record<string, string>
  ): Record<string, any> {
    const extracted: Record<string, any> = {};

    for (const [fieldName, expression] of Object.entries(extractConfig)) {
      try {
        extracted[fieldName] = search(aggregatedData, expression);
      } catch (error) {
        console.warn(
          `Failed to extract field '${fieldName}' with expression '${expression}':`,
          error
        );
      }
    }

    return extracted;
  }

  /**
   * Merge aggregated data with parent using the specified strategy
   */
  mergeData(
    target: any,
    source: any,
    strategy: "replace" | "merge" | "append" = "merge"
  ): any {
    if (strategy === "replace") {
      return source;
    }

    if (strategy === "append") {
      if (Array.isArray(target) && Array.isArray(source)) {
        return [...target, ...source];
      }
      // If not arrays, treat as replace
      return source;
    }

    // merge strategy - deep merge
    if (
      typeof target === "object" &&
      target !== null &&
      typeof source === "object" &&
      source !== null
    ) {
      const merged = { ...target };

      for (const [key, value] of Object.entries(source)) {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          typeof merged[key] === "object" &&
          merged[key] !== null &&
          !Array.isArray(merged[key])
        ) {
          // Recursively merge objects
          merged[key] = this.mergeData(merged[key], value, "merge");
        } else if (Array.isArray(value) && Array.isArray(merged[key])) {
          // Concatenate arrays
          merged[key] = [...merged[key], ...value];
        } else {
          // Replace value
          merged[key] = value;
        }
      }

      return merged;
    }

    return source;
  }
}
