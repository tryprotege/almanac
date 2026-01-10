import { JSONPath } from "jsonpath-plus";
import {
  GroupingConfig,
  GroupingStrategy,
  IGroupingStrategy,
  TransformedRecord,
  RecordGroup,
  GroupingResult,
  GroupingStatistics,
} from "./types";
import { ThreadGrouper } from "./strategies/thread-grouper";
import { TimeWindowGrouper } from "./strategies/time-window-grouper";
import { UserSessionGrouper } from "./strategies/session-grouper";
import { LLMConversationGrouper } from "./strategies/llm-grouper";
import { HybridGrouper } from "./strategies/hybrid-grouper";
import { ParentRecordBuilder } from "./parent-builder";

/**
 * Main grouping engine that orchestrates record grouping
 */
export class GroupingEngine {
  constructor(private llmClient?: any, private defaultModel?: string) {}

  /**
   * Group records according to the provided configuration
   */
  async group(
    records: TransformedRecord[],
    config: GroupingConfig
  ): Promise<GroupingResult> {
    const startTime = Date.now();

    // Get the appropriate strategy
    const strategy = this.getStrategy(config.strategy);

    // Execute grouping strategy
    const groups = await strategy.group(records, config.config);

    // Filter groups by minimum size if specified
    const filteredGroups =
      config.minGroupSize && config.minGroupSize > 0
        ? groups.filter((g) => g.records.length >= config.minGroupSize!)
        : groups;

    // Build parent records if configured
    let allRecords: TransformedRecord[];
    if (config.parentRecord) {
      const builder = new ParentRecordBuilder();
      allRecords = await builder.build(filteredGroups, config.parentRecord);
    } else {
      // Just return the grouped child records
      allRecords = filteredGroups.flatMap((g) => g.records);
    }

    // Generate statistics
    const statistics = this.generateStatistics(
      records,
      filteredGroups,
      config.parentRecord ? allRecords.filter((r) => r.isParentRecord) : [],
      Date.now() - startTime
    );

    return {
      records: allRecords,
      statistics,
    };
  }

  /**
   * Get the appropriate grouping strategy
   */
  private getStrategy(strategyType: GroupingStrategy): IGroupingStrategy {
    switch (strategyType) {
      case "thread":
        return new ThreadGrouper();
      case "time_window":
        return new TimeWindowGrouper();
      case "user_session":
        return new UserSessionGrouper();
      case "llm_conversation":
        if (!this.llmClient) {
          throw new Error(
            "LLM conversation grouper requires an LLM client to be provided"
          );
        }
        return new LLMConversationGrouper(this.llmClient, this.defaultModel);
      case "hybrid":
        if (!this.llmClient) {
          throw new Error(
            "Hybrid grouper requires an LLM client to be provided"
          );
        }
        return new HybridGrouper(this.llmClient, this.defaultModel);
      default:
        throw new Error(`Unknown grouping strategy: ${strategyType}`);
    }
  }

  /**
   * Generate grouping statistics
   */
  private generateStatistics(
    originalRecords: TransformedRecord[],
    groups: RecordGroup[],
    parentRecords: TransformedRecord[],
    durationMs: number
  ): GroupingStatistics {
    const childRecords = groups.flatMap((g) => g.records);
    const ungroupedRecords = originalRecords.length - childRecords.length;

    return {
      totalRecords: originalRecords.length,
      groupsCreated: groups.length,
      parentRecordsCreated: parentRecords.length,
      childRecordsGrouped: childRecords.length,
      ungroupedRecords,
      averageGroupSize:
        groups.length > 0 ? childRecords.length / groups.length : 0,
      durationMs,
    };
  }
}

/**
 * Helper function to extract value from record using JSONPath
 */
export function extractValue(record: any, path: string): any {
  try {
    const results = JSONPath({ path, json: record, wrap: false });
    return results;
  } catch (error) {
    return undefined;
  }
}

/**
 * Helper function to extract multiple values from record using JSONPath
 */
export function extractValues(record: any, path: string): any[] {
  try {
    const results = JSONPath({ path, json: record });
    return Array.isArray(results) ? results : [results];
  } catch (error) {
    return [];
  }
}
