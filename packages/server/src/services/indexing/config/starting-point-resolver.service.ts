import logger from "../../../utils/logger.js";
import type {
  StartingPointConfig,
  FetcherConfig,
} from "@ebee-oss/indexing-engine";
import { fetchAll } from "./paginated-fetcher.js";
import { JSONPath } from "jsonpath-plus";

/**
 * Service to resolve starting points from config and user-provided values
 */
export class StartingPointResolver {
  /**
   * Resolve all starting points in a config
   * @param startingPoints Starting point definitions from config
   * @param userProvidedValues User-provided values (for userProvided starting points)
   * @param serverName MCP server name for discovery
   * @param fetchers Available fetchers for discovery
   * @returns Map of starting point name to resolved values
   */
  static async resolve(
    startingPoints: StartingPointConfig[] | undefined,
    userProvidedValues: Record<string, string[]> | undefined,
    serverName?: string,
    fetchers?: Record<string, FetcherConfig>
  ): Promise<Record<string, string[]>> {
    if (!startingPoints || startingPoints.length === 0) {
      return {};
    }

    const resolved: Record<string, string[]> = {};

    for (const startingPoint of startingPoints) {
      try {
        const values = await this.resolveOne(
          startingPoint,
          userProvidedValues,
          serverName,
          fetchers
        );
        resolved[startingPoint.name] = values;

        logger.debug(
          {
            name: startingPoint.name,
            userProvided: startingPoint.userProvided,
            discoveryUsed:
              !!startingPoint.discovery &&
              values.length > 0 &&
              (!userProvidedValues?.[startingPoint.name] ||
                userProvidedValues[startingPoint.name].length === 0),
            valueCount: values.length,
          },
          "Resolved starting point"
        );
      } catch (error) {
        logger.error(
          { err: error, name: startingPoint.name },
          "Failed to resolve starting point"
        );
        throw error;
      }
    }

    return resolved;
  }

  /**
   * Resolve a single starting point
   */
  private static async resolveOne(
    startingPoint: StartingPointConfig,
    userProvidedValues: Record<string, string[]> | undefined,
    serverName?: string,
    fetchers?: Record<string, FetcherConfig>
  ): Promise<string[]> {
    // First, try to get user-provided values
    const userValues = userProvidedValues?.[startingPoint.name].filter(Boolean);

    if (userValues && userValues.length > 0) {
      logger.info(
        { name: startingPoint.name, count: userValues.length },
        "Using user-provided starting point values"
      );
      return userValues;
    }

    // No user values - try discovery if configured
    if (startingPoint.discovery && serverName && fetchers) {
      logger.info(
        { name: startingPoint.name, fetcher: startingPoint.discovery.fetcher },
        "No user values, attempting discovery"
      );

      try {
        const discoveredValues = await this.runDiscovery(
          startingPoint,
          serverName,
          fetchers
        );

        if (discoveredValues.length > 0) {
          logger.info(
            {
              name: startingPoint.name,
              count: discoveredValues.length,
              description: startingPoint.discovery.description,
            },
            "Successfully discovered starting point values"
          );
          return discoveredValues;
        }
      } catch (error) {
        logger.error(
          { err: error, name: startingPoint.name },
          "Discovery failed for starting point"
        );
        // Fall through to required check
      }
    }

    // Check if required
    if (startingPoint.required) {
      throw new Error(
        `Required starting point '${startingPoint.name}' has no values. ` +
          `User must provide values via the UI before indexing can start.`
      );
    }

    return [];
  }

  /**
   * Run discovery to find starting point values
   */
  private static async runDiscovery(
    startingPoint: StartingPointConfig,
    serverName: string,
    fetchers: Record<string, FetcherConfig>
  ): Promise<string[]> {
    const { discovery } = startingPoint;
    if (!discovery) {
      return [];
    }

    // Get the discovery fetcher config
    const fetcherConfig = fetchers[discovery.fetcher];
    if (!fetcherConfig) {
      throw new Error(
        `Discovery fetcher '${discovery.fetcher}' not found in config`
      );
    }

    logger.debug(
      {
        startingPoint: startingPoint.name,
        fetcher: discovery.fetcher,
        tool: fetcherConfig.tool,
      },
      "Executing discovery fetcher"
    );

    // Fetch all records from the discovery fetcher
    const allRecords: any[] = [];
    for await (const pageResult of fetchAll(serverName, fetcherConfig)) {
      allRecords.push(...pageResult.records);
    }

    logger.debug(
      {
        startingPoint: startingPoint.name,
        totalRecords: allRecords.length,
      },
      "Discovery fetcher returned records"
    );

    // Apply filter if configured
    let filteredRecords = allRecords;
    if (discovery.filter) {
      try {
        const filterFn = new Function(
          "record",
          `return ${discovery.filter}`
        ) as (record: any) => boolean;
        filteredRecords = allRecords.filter(filterFn);

        logger.debug(
          {
            startingPoint: startingPoint.name,
            totalRecords: allRecords.length,
            filteredRecords: filteredRecords.length,
            filter: discovery.filter,
          },
          "Applied discovery filter"
        );
      } catch (error) {
        logger.error(
          { err: error, filter: discovery.filter },
          "Failed to apply discovery filter"
        );
        throw new Error(`Invalid filter expression: ${discovery.filter}`);
      }
    }

    // Extract values using valuePath
    try {
      const values = JSONPath({
        path: discovery.valuePath,
        json: filteredRecords,
      });

      logger.debug(
        {
          startingPoint: startingPoint.name,
          valuePath: discovery.valuePath,
          extractedCount: values.length,
        },
        "Extracted values from discovery results"
      );

      // Ensure we return strings
      return values.map((v: any) => String(v));
    } catch (error) {
      logger.error(
        { err: error, valuePath: discovery.valuePath },
        "Failed to extract values from discovery results"
      );
      throw new Error(`Invalid valuePath expression: ${discovery.valuePath}`);
    }
  }

  /**
   * Get required user inputs from a config
   * Used by UI to determine what to ask the user
   */
  static getRequiredInputs(
    startingPoints: StartingPointConfig[] | undefined,
    currentValues: Record<string, string[]> | undefined
  ): Array<{
    name: string;
    description: string;
    required: boolean;
    examples?: string[];
    currentValues: string[];
  }> {
    if (!startingPoints || startingPoints.length === 0) {
      return [];
    }

    const requiredInputs: Array<{
      name: string;
      description: string;
      required: boolean;
      examples?: string[];
      currentValues: string[];
    }> = [];

    for (const startingPoint of startingPoints) {
      if (startingPoint.userProvided) {
        requiredInputs.push({
          name: startingPoint.name,
          description: startingPoint.description,
          required: startingPoint.required ?? false,
          examples: startingPoint.examples,
          currentValues: currentValues?.[startingPoint.name] || [],
        });
      }
    }

    return requiredInputs;
  }
}
