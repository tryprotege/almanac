import {
  IGroupingStrategy,
  RecordGroup,
  TransformedRecord,
  ThreadGroupingConfig,
} from "../types.js";
import { extractValue } from "../engine.js";

/**
 * Thread-based grouping strategy
 * Groups records that share the same thread identifier
 */
export class ThreadGrouper implements IGroupingStrategy {
  async group(
    records: TransformedRecord[],
    config: ThreadGroupingConfig
  ): Promise<RecordGroup[]> {
    const groups = new Map<string, TransformedRecord[]>();

    for (const record of records) {
      // Extract thread ID
      const threadId = extractValue(record.rawData, config.threadIdPath);

      if (!threadId) {
        // No thread ID - check if this is a parent message
        if (config.parentIndicatorPath) {
          const isParent = extractValue(
            record.rawData,
            config.parentIndicatorPath
          );
          if (isParent) {
            // This record itself is a thread parent
            // Use its own ID as the thread ID
            const selfThreadId = extractValue(
              record.rawData,
              config.threadIdPath.replace("thread_ts", "ts") // Fallback for Slack
            );
            if (selfThreadId) {
              if (!groups.has(selfThreadId)) {
                groups.set(selfThreadId, []);
              }
              groups.get(selfThreadId)!.push(record);
            }
          }
        }
        continue;
      }

      // Add to group
      if (!groups.has(threadId)) {
        groups.set(threadId, []);
      }
      groups.get(threadId)!.push(record);
    }

    // Convert to RecordGroup array
    return Array.from(groups.entries()).map(([threadId, records]) => ({
      groupId: threadId,
      records,
      metadata: {
        threadId,
        strategy: "thread",
      },
    }));
  }
}
