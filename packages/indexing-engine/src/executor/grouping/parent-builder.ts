import { createHash } from "crypto";
import { JSONPath } from "jsonpath-plus";
import { RecordGroup, TransformedRecord, ParentRecordConfig } from "./types";
import { extractValue } from "./engine";

/**
 * Builds parent records from grouped child records
 */
export class ParentRecordBuilder {
  /**
   * Build parent records and update children with references
   */
  async build(
    groups: RecordGroup[],
    config: ParentRecordConfig
  ): Promise<TransformedRecord[]> {
    const allRecords: TransformedRecord[] = [];

    for (const group of groups) {
      // Generate parent sourceId
      const parentSourceId = this.generateParentSourceId(group, config);

      // Build parent record
      const parentRecord = await this.buildParentRecord(
        group,
        parentSourceId,
        config
      );

      // Update children with groupId and parentId
      const children = group.records.map((child) => ({
        ...child,
        groupId: group.groupId,
        parentId: parentRecord._id,
      }));

      allRecords.push(parentRecord, ...children);
    }

    return allRecords;
  }

  /**
   * Build a single parent record
   */
  private async buildParentRecord(
    group: RecordGroup,
    sourceId: string,
    config: ParentRecordConfig
  ): Promise<TransformedRecord> {
    const firstChild = group.records[0];
    const lastChild = group.records[group.records.length - 1];

    // Build field values using aggregate mappings
    const fields = {
      title: await this.buildField(
        config.fields.title,
        group.records,
        firstChild,
        lastChild,
        group.groupId
      ),
      content: await this.buildField(
        config.fields.content,
        group.records,
        firstChild,
        lastChild,
        group.groupId
      ),
      people: config.fields.people
        ? await this.buildField(
            config.fields.people,
            group.records,
            firstChild,
            lastChild,
            group.groupId
          )
        : undefined,
      primaryDate: config.fields.primaryDate
        ? await this.buildField(
            config.fields.primaryDate,
            group.records,
            firstChild,
            lastChild,
            group.groupId
          )
        : undefined,
      tags: config.fields.tags
        ? await this.buildField(
            config.fields.tags,
            group.records,
            firstChild,
            lastChild,
            group.groupId
          )
        : undefined,
    };

    // Build raw data with child IDs
    const rawData: any = {
      ...(group.metadata || {}),
      groupId: group.groupId,
    };

    if (config.storeChildIds !== false) {
      const childIdsField = config.childIdsField || "childIds";
      rawData[childIdsField] = group.records.map((r) => r.sourceId);
    }

    // Create parent record
    const _id = `${firstChild.source}_${config.recordType}_${sourceId}`;

    return {
      _id,
      source: firstChild.source,
      sourceId,
      recordType: config.recordType,
      title: String(fields.title || ""),
      content: String(fields.content || ""),
      people: fields.people as string[] | undefined,
      primaryDate: fields.primaryDate as Date | null | undefined,
      tags: fields.tags as string[] | undefined,
      parentId: null,
      rawData,
      isParentRecord: true,
      groupId: group.groupId,
      childIds: group.records.map((r) => r._id),
    };
  }

  /**
   * Build a field value using the appropriate mapping
   */
  private async buildField(
    mapping: any,
    children: TransformedRecord[],
    firstChild: TransformedRecord,
    lastChild: TransformedRecord,
    groupId: string
  ): Promise<any> {
    switch (mapping.type) {
      case "path":
        // Extract from first child
        return extractValue(firstChild, mapping.path);

      case "aggregate":
        return this.aggregateField(mapping, children);

      case "template":
        return this.evaluateTemplate(mapping.template, {
          firstChild,
          lastChild,
          children,
          groupId,
          childCount: children.length,
        });

      case "code":
        // Execute custom code (similar to field mapping code)
        return this.executeCode(mapping.code, {
          firstChild,
          lastChild,
          children,
          groupId,
        });

      default:
        return undefined;
    }
  }

  /**
   * Aggregate field values from children
   */
  private aggregateField(mapping: any, children: TransformedRecord[]): any {
    const values = children
      .map((child) => extractValue(child, mapping.path))
      .filter((v) => v != null);

    switch (mapping.function) {
      case "concat":
        if (mapping.itemTemplate) {
          // Apply template to each item
          const formatted = children
            .map((child) => {
              const value = extractValue(child, mapping.path);
              if (!value) return null;
              return this.evaluateTemplate(mapping.itemTemplate, {
                child,
                value,
              });
            })
            .filter((v) => v != null);
          return formatted.join(mapping.separator || "\n");
        } else {
          return values.join(mapping.separator || "\n");
        }

      case "merge":
        // Merge arrays or objects
        if (Array.isArray(values[0])) {
          return values.flat();
        } else if (typeof values[0] === "object") {
          return Object.assign({}, ...values);
        }
        return values;

      case "first":
        return values[0];

      case "last":
        return values[values.length - 1];

      case "unique":
        return Array.from(new Set(values.flat()));

      default:
        return values;
    }
  }

  /**
   * Evaluate a template string
   */
  private evaluateTemplate(template: string, context: any): string {
    return template.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      try {
        // Simple property access evaluation
        const value = expr.split(".").reduce((obj: any, key: string) => {
          return obj?.[key];
        }, context);
        return value != null ? String(value) : "";
      } catch {
        return "";
      }
    });
  }

  /**
   * Execute custom TypeScript code
   */
  private executeCode(code: string, context: any): any {
    try {
      const func = new Function(...Object.keys(context), `return (${code});`);
      return func(...Object.values(context));
    } catch (error) {
      console.error("Error executing code:", error);
      return undefined;
    }
  }

  /**
   * Generate parent sourceId based on strategy
   */
  private generateParentSourceId(
    group: RecordGroup,
    config: ParentRecordConfig
  ): string {
    const firstChild = group.records[0];

    switch (config.sourceIdStrategy) {
      case "first_child":
        const template =
          config.sourceIdTemplate || "parent-${firstChild.sourceId}";
        return this.evaluateTemplate(template, {
          firstChild,
          groupId: group.groupId,
        });

      case "concatenate":
        const ids = group.records.map((r) => r.sourceId);
        return ids.join("-");

      case "hash":
        const ids2 = group.records.map((r) => r.sourceId).join(",");
        return createHash("sha256").update(ids2).digest("hex").substring(0, 16);

      case "template":
        if (!config.sourceIdTemplate) {
          throw new Error("sourceIdTemplate required for template strategy");
        }
        return this.evaluateTemplate(config.sourceIdTemplate, {
          firstChild,
          lastChild: group.records[group.records.length - 1],
          groupId: group.groupId,
          childCount: group.records.length,
        });

      default:
        throw new Error(`Unknown sourceIdStrategy: ${config.sourceIdStrategy}`);
    }
  }
}
