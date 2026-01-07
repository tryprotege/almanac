import logger from "../../../utils/logger.js";
import type { StartingPointConfig } from "@ebee-oss/indexing-engine";

/**
 * Service to resolve starting points from config and user-provided values
 */
export class StartingPointResolver {
  /**
   * Resolve all starting points in a config
   * @param startingPoints Starting point definitions from config
   * @param userProvidedValues User-provided values (for userProvided starting points)
   * @returns Map of starting point name to resolved values
   */
  static resolve(
    startingPoints: StartingPointConfig[] | undefined,
    userProvidedValues: Record<string, string[]> | undefined
  ): Record<string, string[]> {
    if (!startingPoints || startingPoints.length === 0) {
      return {};
    }

    const resolved: Record<string, string[]> = {};

    for (const startingPoint of startingPoints) {
      try {
        const values = this.resolveOne(startingPoint, userProvidedValues);
        resolved[startingPoint.name] = values;

        logger.debug(
          {
            name: startingPoint.name,
            userProvided: startingPoint.userProvided,
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
  private static resolveOne(
    startingPoint: StartingPointConfig,
    userProvidedValues: Record<string, string[]> | undefined
  ): string[] {
    // Check if this starting point requires user-provided values
    if (startingPoint.userProvided) {
      return this.resolveUserProvided(startingPoint, userProvidedValues);
    }

    // If not user-provided, it should have been resolved earlier
    // or we return empty array (will be handled upstream)
    return [];
  }

  /**
   * Resolve user-provided starting point values
   */
  private static resolveUserProvided(
    startingPoint: StartingPointConfig,
    userProvidedValues: Record<string, string[]> | undefined
  ): string[] {
    // Get user-provided values
    const values = userProvidedValues?.[startingPoint.name];

    // Check if required
    if (startingPoint.required && (!values || values.length === 0)) {
      throw new Error(
        `Required starting point '${startingPoint.name}' has no values. ` +
          `User must provide values via the UI before indexing can start.`
      );
    }

    return values || [];
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
