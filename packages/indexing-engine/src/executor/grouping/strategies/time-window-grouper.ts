import {
  IGroupingStrategy,
  RecordGroup,
  TransformedRecord,
  TimeWindowGroupingConfig,
} from '../types.js';
import { extractValue } from '../engine.js';

/**
 * Time window grouping strategy
 * Groups records that occur within a specified time window
 */
export class TimeWindowGrouper implements IGroupingStrategy {
  async group(
    records: TransformedRecord[],
    config: TimeWindowGroupingConfig,
  ): Promise<RecordGroup[]> {
    // Sort records by timestamp
    const sortedRecords = [...records].sort((a, b) => {
      const tsA = this.extractTimestamp(a, config.timestampPath);
      const tsB = this.extractTimestamp(b, config.timestampPath);
      return tsA - tsB;
    });

    const groups: RecordGroup[] = [];
    let currentGroup: TransformedRecord[] = [];
    let groupStartTime: number | null = null;
    let groupContext: any = null;

    for (const record of sortedRecords) {
      const timestamp = this.extractTimestamp(record, config.timestampPath);

      // Extract optional context fields
      const userId = config.sameUserPath ? extractValue(record.rawData, config.sameUserPath) : null;
      const context = config.sameContextPath
        ? extractValue(record.rawData, config.sameContextPath)
        : null;

      // Check if we should start a new group
      const shouldStartNewGroup =
        currentGroup.length === 0 ||
        (groupStartTime !== null && timestamp - groupStartTime > config.windowSeconds * 1000) ||
        (config.sameUserPath && userId !== groupContext?.userId) ||
        (config.sameContextPath && context !== groupContext?.context);

      if (shouldStartNewGroup) {
        // Save current group if it exists
        if (currentGroup.length > 0) {
          groups.push({
            groupId: `time_${groupStartTime}`,
            records: currentGroup,
            metadata: {
              startTime: groupStartTime,
              strategy: 'time_window',
              ...groupContext,
            },
          });
        }

        // Start new group
        currentGroup = [record];
        groupStartTime = timestamp;
        groupContext = { userId, context };
      } else {
        // Add to current group
        currentGroup.push(record);
      }
    }

    // Add final group
    if (currentGroup.length > 0) {
      groups.push({
        groupId: `time_${groupStartTime}`,
        records: currentGroup,
        metadata: {
          startTime: groupStartTime,
          strategy: 'time_window',
          ...groupContext,
        },
      });
    }

    return groups;
  }

  /**
   * Extract timestamp from record
   */
  private extractTimestamp(record: TransformedRecord, path: string): number {
    const value = extractValue(record.rawData, path);

    if (typeof value === 'number') {
      // Assume Unix timestamp
      return value < 10000000000 ? value * 1000 : value;
    }

    if (typeof value === 'string') {
      return new Date(value).getTime();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    // Fallback to record's primaryDate
    return record.primaryDate ? new Date(record.primaryDate).getTime() : 0;
  }
}
