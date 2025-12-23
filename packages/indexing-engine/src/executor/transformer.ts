/**
 * Record transformation engine
 */

import { JSONPath } from "jsonpath-plus";
import type {
  RecordTypeConfig,
  FieldMapping,
  PathMapping,
  PathsMapping,
  TemplateMapping,
  CodeMapping,
  ProcessorMapping,
} from "../types/config.js";
import type { TransformedRecord, EnrichedRecord } from "../types/execution.js";
import { executeSandboxCode, executeProcessor } from "./sandbox.js";
import { createHash } from "crypto";

export class RecordTransformer {
  constructor(private config: RecordTypeConfig, private source: string) {}

  /**
   * Transform a single record to unified format
   */
  async transform(enrichedRecord: EnrichedRecord): Promise<TransformedRecord> {
    const { record, enrichments } = enrichedRecord;

    const context = {
      record,
      enrichments,
    };

    // Generate record ID
    const sourceId = record.id || record._id || record.sourceId;
    if (!sourceId) {
      throw new Error(
        `Record missing ID field: ${JSON.stringify(record).substring(0, 100)}`
      );
    }

    const _id = this.generateRecordId(sourceId);

    // Resolve all fields
    const title = await this.resolveField(this.config.fields.title, context);
    const content = await this.resolveField(
      this.config.fields.content,
      context
    );
    const people = await this.resolveField(this.config.fields.people, context);
    const primaryDate = await this.resolveField(
      this.config.fields.primaryDate,
      context
    );
    const tags = await this.resolveField(this.config.fields.tags, context);
    const parentId = await this.resolveField(
      this.config.fields.parentId,
      context
    );

    // Compute checksum
    const checksum = this.computeChecksum(record);

    return {
      _id,
      source: this.source,
      sourceId,
      recordType: this.config.name,

      title: title || "Untitled",
      content: content || "",
      people: Array.isArray(people) ? people : people ? [people] : undefined,
      primaryDate: primaryDate ? this.parseDate(primaryDate) : null,
      tags: Array.isArray(tags) ? tags : tags ? [tags] : undefined,
      parentId,

      rawData: record,
      enrichments,
      checksum,
      version: 1,
    };
  }

  /**
   * Resolve a field mapping
   */
  private async resolveField(
    mapping: FieldMapping | undefined,
    context: { record: any; enrichments: Record<string, any> }
  ): Promise<any> {
    if (!mapping) return undefined;

    // Handle legacy format (without type field)
    if ("path" in mapping && !("type" in mapping)) {
      return this.resolvePathMapping(
        { type: "path", path: (mapping as any).path },
        context
      );
    }
    if ("paths" in mapping && !("type" in mapping)) {
      return this.resolvePathsMapping(
        {
          type: "paths",
          paths: (mapping as any).paths,
          join: (mapping as any).join,
        },
        context
      );
    }
    if ("template" in mapping && !("type" in mapping)) {
      return this.resolveTemplateMapping(
        { type: "template", template: (mapping as any).template },
        context
      );
    }
    if ("code" in mapping && !("type" in mapping)) {
      return this.resolveCodeMapping(
        { type: "code", code: (mapping as any).code },
        context
      );
    }
    if ("processor" in mapping && !("type" in mapping)) {
      return this.resolveProcessorMapping(
        {
          type: "processor",
          processor: (mapping as any).processor,
          input: (mapping as any).input,
          options: (mapping as any).options,
        },
        context
      );
    }

    // Handle typed format
    switch (mapping.type) {
      case "path":
        return this.resolvePathMapping(mapping, context);

      case "paths":
        return this.resolvePathsMapping(mapping, context);

      case "template":
        return this.resolveTemplateMapping(mapping, context);

      case "code":
        return this.resolveCodeMapping(mapping, context);

      case "processor":
        return this.resolveProcessorMapping(mapping, context);

      default:
        throw new Error(`Unknown mapping type: ${(mapping as any).type}`);
    }
  }

  /**
   * Resolve JSONPath mapping
   */
  private resolvePathMapping(
    mapping: PathMapping,
    context: { record: any; enrichments: Record<string, any> }
  ): any {
    try {
      const result = JSONPath({ path: mapping.path, json: context.record });
      return Array.isArray(result) && result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.warn(`JSONPath resolution failed for ${mapping.path}:`, error);
      return undefined;
    }
  }

  /**
   * Resolve multiple paths joined
   */
  private resolvePathsMapping(
    mapping: PathsMapping,
    context: { record: any; enrichments: Record<string, any> }
  ): any {
    const values = mapping.paths
      .map((path) => {
        try {
          const result = JSONPath({ path, json: context.record });
          return Array.isArray(result) && result.length > 0
            ? result[0]
            : undefined;
        } catch {
          return undefined;
        }
      })
      .filter((v) => v !== undefined && v !== null && v !== "");

    return values.length > 0 ? values.join(mapping.join || " ") : undefined;
  }

  /**
   * Resolve template mapping
   */
  private resolveTemplateMapping(
    mapping: TemplateMapping,
    context: { record: any; enrichments: Record<string, any> }
  ): any {
    return mapping.template.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      try {
        const result = JSONPath({ path: expr, json: context.record });
        return Array.isArray(result) && result.length > 0 ? result[0] : "";
      } catch {
        return "";
      }
    });
  }

  /**
   * Resolve code mapping
   */
  private async resolveCodeMapping(
    mapping: CodeMapping,
    context: { record: any; enrichments: Record<string, any> }
  ): Promise<any> {
    return executeSandboxCode(mapping.code, context, this.source);
  }

  /**
   * Resolve processor mapping
   */
  private async resolveProcessorMapping(
    mapping: ProcessorMapping,
    context: { record: any; enrichments: Record<string, any> }
  ): Promise<any> {
    // Get input data via JSONPath
    const inputData = JSONPath({ path: mapping.input, json: context });
    const actualInput =
      Array.isArray(inputData) && inputData.length > 0
        ? inputData[0]
        : inputData;

    // Execute processor
    return executeProcessor(mapping.processor, actualInput, mapping.options);
  }

  /**
   * Generate record ID
   */
  private generateRecordId(sourceId: string): string {
    return `${this.source}_${this.config.name}_${sourceId}`;
  }

  /**
   * Parse date from various formats
   */
  private parseDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;

    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  /**
   * Compute checksum for change detection
   */
  private computeChecksum(record: any): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(record));
    return hash.digest("hex");
  }
}
