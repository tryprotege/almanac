import {
  IGroupingStrategy,
  RecordGroup,
  TransformedRecord,
  SessionGroupingConfig,
} from "../types.js";
import { extractValue } from "../engine.js";

/**
 * User session grouping strategy
 * Groups records by user activity sessions with configurable timeout
 */
export class UserSessionGrouper implements IGroupingStrategy {
  async group(
    records: TransformedRecord[],
    config: SessionGroupingConfig
  ): Promise<RecordGroup[]> {
    const sessionTimeout = (config.sessionTimeoutSeconds || 1800) * 1000; // Default 30 min

    // Sort records by timestamp
    const sortedRecords = [...records].sort((a, b) => {
      const tsA = this.extractTimestamp(a, config.timestampPath);
      const tsB = this.extractTimestamp(b, config.timestampPath);
      return tsA - tsB;
    });

    // Group by user
    const userRecords = new Map<string, TransformedRecord[]>();
    for (const record of sortedRecords) {
      const userId = extractValue(record.rawData, config.userIdPath);
      if (!userId) continue;

      if (!userRecords.has(userId)) {
        userRecords.set(userId, []);
      }
      userRecords.get(userId)!.push(record);
    }

    // Create sessions for each user
    const groups: RecordGroup[] = [];
    let sessionCounter = 0;

    for (const [userId, records] of userRecords.entries()) {
      let currentSession: TransformedRecord[] = [];
      let sessionStartTime: number | null = null;
      let lastActivityTime: number | null = null;
      let sessionContext: any = null;

      for (const record of records) {
        const timestamp = this.extractTimestamp(record, config.timestampPath);
        const context = config.contextPath
          ? extractValue(record.rawData, config.contextPath)
          : null;

        // Check if we should start a new session
        const shouldStartNewSession =
          currentSession.length === 0 ||
          (lastActivityTime !== null &&
            timestamp - lastActivityTime > sessionTimeout) ||
          (config.contextPath && context !== sessionContext);

        if (shouldStartNewSession) {
          // Save current session if it exists
          if (currentSession.length > 0) {
            groups.push({
              groupId: `session_${sessionCounter++}`,
              records: currentSession,
              metadata: {
                userId,
                sessionStart: sessionStartTime,
                sessionEnd: lastActivityTime,
                strategy: "user_session",
                context: sessionContext,
              },
            });
          }

          // Start new session
          currentSession = [record];
          sessionStartTime = timestamp;
          lastActivityTime = timestamp;
          sessionContext = context;
        } else {
          // Add to current session
          currentSession.push(record);
          lastActivityTime = timestamp;
        }
      }

      // Add final session for this user
      if (currentSession.length > 0) {
        groups.push({
          groupId: `session_${sessionCounter++}`,
          records: currentSession,
          metadata: {
            userId,
            sessionStart: sessionStartTime,
            sessionEnd: lastActivityTime,
            strategy: "user_session",
            context: sessionContext,
          },
        });
      }
    }

    return groups;
  }

  /**
   * Extract timestamp from record
   */
  private extractTimestamp(record: TransformedRecord, path: string): number {
    const value = extractValue(record.rawData, path);

    if (typeof value === "number") {
      // Assume Unix timestamp
      return value < 10000000000 ? value * 1000 : value;
    }

    if (typeof value === "string") {
      return new Date(value).getTime();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    // Fallback to record's primaryDate
    return record.primaryDate ? new Date(record.primaryDate).getTime() : 0;
  }
}
