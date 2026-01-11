import {
  IGroupingStrategy,
  RecordGroup,
  TransformedRecord,
  HybridGroupingConfig,
} from "../types.js";
import { ThreadGrouper } from "./thread-grouper.js";
import { LLMConversationGrouper } from "./llm-grouper.js";

/**
 * Hybrid grouping strategy
 * Combines thread-based and LLM-based grouping intelligently:
 * 1. First groups messages by explicit threads
 * 2. Then applies LLM grouping to remaining ungrouped messages
 */
export class HybridGrouper implements IGroupingStrategy {
  private threadGrouper: ThreadGrouper;
  private llmGrouper: LLMConversationGrouper;

  constructor(
    llmClient: {
      chat: {
        completions: {
          create: (params: {
            model: string;
            messages: Array<{ role: string; content: string }>;
            temperature?: number;
            response_format?: { type: "json_object" };
          }) => Promise<{ choices: Array<{ message: { content: string } }> }>;
        };
      };
    },
    defaultModel?: string
  ) {
    this.threadGrouper = new ThreadGrouper();
    this.llmGrouper = new LLMConversationGrouper(llmClient, defaultModel);
  }

  async group(
    records: TransformedRecord[],
    config: HybridGroupingConfig
  ): Promise<RecordGroup[]> {
    if (records.length === 0) {
      return [];
    }

    // Phase 1: Group by explicit threads
    const threadGroups = await this.threadGrouper.group(
      records,
      config.threadConfig
    );

    // Track which records were grouped by threads
    const groupedRecordIds = new Set<string>();
    for (const group of threadGroups) {
      for (const record of group.records) {
        groupedRecordIds.add(record.sourceId);
      }
    }

    // Phase 2: Identify ungrouped records
    const ungroupedRecords = records.filter(
      (r) => !groupedRecordIds.has(r.sourceId)
    );

    // If no ungrouped records, return thread groups only
    if (ungroupedRecords.length === 0) {
      return threadGroups;
    }

    // Phase 3: Apply LLM grouping to ungrouped messages
    const conversationGroups = await this.llmGrouper.group(
      ungroupedRecords,
      config.llmConfig
    );

    // Phase 4: Filter out groups smaller than minConversationSize
    const minSize = config.minConversationSize || 2;
    const filteredConversationGroups = conversationGroups.filter(
      (group) => group.records.length >= minSize
    );

    // Phase 5: Handle filtered-out singles
    const conversationGroupedIds = new Set<string>();
    for (const group of filteredConversationGroups) {
      for (const record of group.records) {
        conversationGroupedIds.add(record.sourceId);
      }
    }

    // Create single-record groups for messages that didn't meet minSize threshold
    const singleRecordGroups: RecordGroup[] = ungroupedRecords
      .filter((r) => !conversationGroupedIds.has(r.sourceId))
      .map((record, idx) => ({
        groupId: `single_${idx}`,
        records: [record],
        metadata: {
          strategy: "hybrid_single",
          recordCount: 1,
        },
      }));

    // Merge all groups: threads + conversations + singles
    return [
      ...threadGroups,
      ...filteredConversationGroups,
      ...singleRecordGroups,
    ];
  }
}
