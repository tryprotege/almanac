import {
  IGroupingStrategy,
  RecordGroup,
  TransformedRecord,
  LLMGroupingConfig,
  Batch,
  BatchResult,
} from "../types";
import { extractValue } from "../engine";

/**
 * LLM-based conversation grouping strategy
 * Uses AI to semantically group messages into conversations
 */
export class LLMConversationGrouper implements IGroupingStrategy {
  constructor(
    private llmClient: {
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
    }
  ) {}

  async group(
    records: TransformedRecord[],
    config: LLMGroupingConfig
  ): Promise<RecordGroup[]> {
    if (records.length === 0) {
      return [];
    }

    // Sort records if configured
    let sortedRecords = records;
    if (config.sortBy) {
      sortedRecords = this.sortRecords(records, config);
    }

    // Extract analysis data from records
    const analysisData = sortedRecords.map((record) =>
      this.extractAnalysisData(record, config.analysisFields)
    );

    // Split into batches with overlap
    const batches = this.createBatches(
      sortedRecords,
      analysisData,
      config.batchSize || 50,
      config.batchOverlap || 10
    );

    // Process batches with concurrency control
    const concurrency = config.concurrency || 3;
    const batchResults: BatchResult[] = [];

    for (let i = 0; i < batches.length; i += concurrency) {
      const batchGroup = batches.slice(i, i + concurrency);
      const results = await Promise.all(
        batchGroup.map((batch) =>
          this.processBatch(batch, config.model, config.systemPrompt)
        )
      );
      batchResults.push(...results);
    }

    // Merge overlapping batch results
    const finalGrouping = this.mergeBatchResults(batchResults, records.length);

    // Create groups from grouping assignments
    return this.createGroups(sortedRecords, finalGrouping);
  }

  /**
   * Sort records by configured field
   */
  private sortRecords(
    records: TransformedRecord[],
    config: LLMGroupingConfig
  ): TransformedRecord[] {
    if (!config.sortBy) return records;

    return [...records].sort((a, b) => {
      const valueA = extractValue(a.rawData, config.sortBy!);
      const valueB = extractValue(b.rawData, config.sortBy!);

      // Handle timestamps
      const tsA =
        typeof valueA === "number"
          ? valueA
          : valueA instanceof Date
          ? valueA.getTime()
          : new Date(valueA).getTime();
      const tsB =
        typeof valueB === "number"
          ? valueB
          : valueB instanceof Date
          ? valueB.getTime()
          : new Date(valueB).getTime();

      return config.sortOrder === "desc" ? tsB - tsA : tsA - tsB;
    });
  }

  /**
   * Extract analysis data from a record
   */
  private extractAnalysisData(
    record: TransformedRecord,
    fields: string[]
  ): Record<string, any> {
    const data: Record<string, any> = {};

    for (const field of fields) {
      const value = extractValue(record.rawData, field);
      const fieldName = field.split(".").pop() || field;
      data[fieldName] = value;
    }

    return data;
  }

  /**
   * Create batches with overlap for context continuity
   */
  private createBatches(
    records: TransformedRecord[],
    analysisData: Record<string, any>[],
    batchSize: number,
    overlap: number
  ): Batch[] {
    const batches: Batch[] = [];
    let startIndex = 0;

    while (startIndex < records.length) {
      const endIndex = Math.min(startIndex + batchSize, records.length);

      batches.push({
        records: records.slice(startIndex, endIndex),
        startIndex,
        endIndex: endIndex - 1,
      });

      // Move forward, accounting for overlap
      startIndex += batchSize - overlap;

      // Prevent infinite loop on small datasets
      if (startIndex >= records.length) break;
    }

    return batches;
  }

  /**
   * Process a single batch with LLM
   */
  private async processBatch(
    batch: Batch,
    model: string | undefined,
    systemPrompt: string
  ): Promise<BatchResult> {
    // Format messages for LLM
    const messagesText = batch.records
      .map((record, idx) => {
        const localIdx = idx;
        return `[${localIdx}] ${JSON.stringify(record.rawData)}`;
      })
      .join("\n");

    const userPrompt = `Analyze these ${batch.records.length} messages and group them into conversations. Each message is prefixed with its index.

Messages:
${messagesText}

Return a JSON array of grouping assignments in this format:
[
  {"messageIndex": 0, "groupId": 1},
  {"messageIndex": 1, "groupId": 1},
  {"messageIndex": 2, "groupId": 2}
]

Where groupId identifies which conversation each message belongs to. Messages in the same conversation should have the same groupId.`;

    try {
      const response = await this.llmClient.chat.completions.create({
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      // Handle both array and object with groupings key
      const groupings = Array.isArray(parsed) ? parsed : parsed.groupings || [];

      return {
        startIndex: batch.startIndex,
        endIndex: batch.endIndex,
        grouping: groupings.map((g: any) => ({
          messageIndex: batch.startIndex + g.messageIndex,
          groupId: g.groupId,
        })),
      };
    } catch (error) {
      console.error("LLM grouping failed for batch:", error);
      // Fallback: each message in its own group
      return {
        startIndex: batch.startIndex,
        endIndex: batch.endIndex,
        grouping: batch.records.map((_, idx) => ({
          messageIndex: batch.startIndex + idx,
          groupId: batch.startIndex + idx,
        })),
      };
    }
  }

  /**
   * Merge overlapping batch results
   */
  private mergeBatchResults(
    batchResults: BatchResult[],
    totalRecords: number
  ): Map<number, number> {
    const grouping = new Map<number, number>();

    // Process batches in order
    for (const result of batchResults) {
      for (const assignment of result.grouping) {
        // Only assign if not already assigned (first assignment wins)
        if (!grouping.has(assignment.messageIndex)) {
          grouping.set(assignment.messageIndex, assignment.groupId);
        }
      }
    }

    // Ensure all records have an assignment
    for (let i = 0; i < totalRecords; i++) {
      if (!grouping.has(i)) {
        grouping.set(i, i); // Standalone group
      }
    }

    // Normalize group IDs to be sequential
    return this.normalizeGroupIds(grouping);
  }

  /**
   * Normalize group IDs to sequential numbers
   */
  private normalizeGroupIds(
    grouping: Map<number, number>
  ): Map<number, number> {
    const uniqueGroupIds = new Set(grouping.values());
    const groupIdMap = new Map<number, number>();
    let nextId = 0;

    for (const oldId of uniqueGroupIds) {
      groupIdMap.set(oldId, nextId++);
    }

    const normalized = new Map<number, number>();
    for (const [msgIdx, oldGroupId] of grouping.entries()) {
      normalized.set(msgIdx, groupIdMap.get(oldGroupId)!);
    }

    return normalized;
  }

  /**
   * Create RecordGroup array from grouping assignments
   */
  private createGroups(
    records: TransformedRecord[],
    grouping: Map<number, number>
  ): RecordGroup[] {
    const groups = new Map<number, TransformedRecord[]>();

    for (let i = 0; i < records.length; i++) {
      const groupId = grouping.get(i) || i;

      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }
      groups.get(groupId)!.push(records[i]);
    }

    return Array.from(groups.entries()).map(([groupId, records]) => ({
      groupId: `conversation_${groupId}`,
      records,
      metadata: {
        groupId,
        strategy: "llm_conversation",
        recordCount: records.length,
      },
    }));
  }
}
