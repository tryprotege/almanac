import { BaseEntityAdapter } from "./base-adapter.js";
import { Record } from "../../../models/record.model.js";
import { NotionMCPClient } from "../../sources/notion/mcpClient.js";
import {
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionComment,
  NotionUser,
} from "../../sources/notion/types.js";
import { EntityRelationship, FetchOptions } from "../../../types/index.js";

type NotionEntity = NotionPage | NotionDatabase | NotionUser;

/**
 * Notion adapter for syncing Notion entities
 */
export class NotionAdapter extends BaseEntityAdapter<NotionEntity> {
  readonly source = "notion" as const;
  readonly supportedEntityTypes = [
    "page",
    "database",
    "user",
    "block",
    "comment",
  ];

  constructor(private client: NotionMCPClient) {
    super();
  }

  /**
   * Fetch all entities from Notion workspace
   */
  async *fetchAll(options?: FetchOptions): AsyncIterable<NotionEntity[]> {
    const batchSize = options?.batchSize || 100;

    // Fetch users
    const users = await this.client.getAllUsers();
    yield users as NotionEntity[];

    // Fetch databases
    const databases = await this.client.searchAllDatabases();
    for (let i = 0; i < databases.length; i += batchSize) {
      yield databases.slice(i, i + batchSize) as NotionEntity[];
    }

    // Fetch pages
    const pages = await this.client.searchAllPages();
    for (let i = 0; i < pages.length; i += batchSize) {
      yield pages.slice(i, i + batchSize) as NotionEntity[];
    }
  }

  /**
   * Fetch single entity by ID
   */
  async fetchById(id: string): Promise<NotionEntity | null> {
    try {
      // Try as page first
      const page = await this.client.getPage(id);
      return page as NotionEntity;
    } catch {
      try {
        // Try as database
        const database = await this.client.getDatabaseSchema(id);
        return database as NotionEntity;
      } catch {
        return null;
      }
    }
  }

  /**
   * Transform Notion entity to unified format
   */
  async transform(sourceEntity: NotionEntity): Promise<Record> {
    const recordType = this.getEntityType(sourceEntity);
    const sourceId = sourceEntity.id;
    const _id = this.generateEntityId(recordType, sourceId);

    // Get additional data for pages
    let blocks: NotionBlock[] = [];
    // let comments: NotionComment[] = [];

    if (recordType === "page") {
      try {
        blocks = await this.client.getAllBlocksRecursive(sourceId);
        // comments = await this.client.getPageComments(sourceId);
      } catch (error) {
        console.warn(`Failed to fetch blocks for page ${sourceId}:`, error);
      }
    }

    const title = this.extractTitle(sourceEntity);
    const content = this.extractTextContent(sourceEntity, blocks);
    const people = this.extractPeople(sourceEntity);
    const primaryDate = this.extractPrimaryDate(sourceEntity);
    const tags = this.extractTags(sourceEntity);

    return {
      _id,
      source: this.source,
      sourceId,
      recordType: recordType,
      title,
      content,
      people,
      primaryDate,
      tags,
      rawData: sourceEntity,
      checksum: this.computeChecksum(sourceEntity),
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: new Date(
        (sourceEntity as any).last_edited_time || new Date()
      ),
      isDeleted: (sourceEntity as any).archived || false,
      deletedAt: null as any,
      deletionStrategy: "soft",
      graphNodeId: _id,
      graphVersion: 1,
      vectorIds: [],
      embeddingVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Extract relationships from Notion entity
   */
  async extractRelationships(
    sourceEntity: NotionEntity
  ): Promise<EntityRelationship[]> {
    const relationships: EntityRelationship[] = [];
    const recordType = this.getEntityType(sourceEntity);

    // Extract parent relationship
    if ((sourceEntity as any).parent) {
      const parent = (sourceEntity as any).parent;
      let targetId: string | null = null;

      if (parent.type === "page_id") {
        targetId = this.generateEntityId("page", parent.page_id);
      } else if (parent.type === "database_id") {
        targetId = this.generateEntityId("database", parent.database_id);
      }

      if (targetId) {
        relationships.push({
          sourceId: this.generateEntityId(recordType, sourceEntity.id),
          targetId,
          type: "CHILD_OF",
          confidence: 1.0,
          extractedBy: "explicit",
        });
      }
    }

    // Extract database relationships for pages
    if (
      recordType === "page" &&
      (sourceEntity as NotionPage).parent.type === "database_id"
    ) {
      const databaseId = (sourceEntity as NotionPage).parent.database_id;
      relationships.push({
        sourceId: this.generateEntityId("page", sourceEntity.id),
        targetId: this.generateEntityId("database", databaseId),
        type: "ROW_OF",
        confidence: 1.0,
        extractedBy: "explicit",
      });
    }

    return relationships;
  }

  /**
   * Extract text content from entity
   */
  protected extractTextContent(
    sourceEntity: NotionEntity,
    blocks?: NotionBlock[]
  ): string {
    const recordType = this.getEntityType(sourceEntity);

    if (recordType === "page") {
      // Extract markdown content from blocks
      if (blocks && blocks.length > 0) {
        return this.blocksToMarkdown(blocks);
      }
      return "";
    }

    if (recordType === "database") {
      const db = sourceEntity as NotionDatabase;
      const description = this.extractRichText(db.description || []);
      return description;
    }

    if (recordType === "user") {
      const user = sourceEntity as NotionUser;
      return user.name || "";
    }

    return "";
  }

  /**
   * Extract title from entity
   */
  protected extractTitle(sourceEntity: NotionEntity): string {
    const recordType = this.getEntityType(sourceEntity);

    if (recordType === "page") {
      const page = sourceEntity as NotionPage;
      const titleProp = page.properties.title || page.properties.Name;
      if (titleProp && (titleProp as any).title) {
        return this.extractRichText((titleProp as any).title);
      }
      return "Untitled";
    }

    if (recordType === "database") {
      const db = sourceEntity as NotionDatabase;
      return this.extractRichText(db.title);
    }

    if (recordType === "user") {
      const user = sourceEntity as NotionUser;
      return user.name || "Unknown User";
    }

    return "";
  }

  /**
   * Extract people from entity
   */
  protected extractPeople(sourceEntity: NotionEntity): string[] {
    const people: string[] = [];

    if ((sourceEntity as any).created_by) {
      people.push((sourceEntity as any).created_by.id);
    }

    if ((sourceEntity as any).last_edited_by) {
      people.push((sourceEntity as any).last_edited_by.id);
    }

    // Extract from properties for pages
    if (this.getEntityType(sourceEntity) === "page") {
      const page = sourceEntity as NotionPage;
      for (const [key, value] of Object.entries(page.properties)) {
        if ((value as any).type === "people" && (value as any).people) {
          (value as any).people.forEach((person: any) => {
            if (person.id) people.push(person.id);
          });
        }
      }
    }

    return [...new Set(people)]; // Remove duplicates
  }

  /**
   * Extract primary date from entity
   */
  protected extractPrimaryDate(sourceEntity: NotionEntity): Date | null {
    // Use last_edited_time as primary date
    const lastEdited = (sourceEntity as any).last_edited_time;
    return lastEdited ? new Date(lastEdited) : null;
  }

  /**
   * Extract tags from entity
   */
  protected extractTags(sourceEntity: NotionEntity): string[] {
    const tags: string[] = [];

    if (this.getEntityType(sourceEntity) === "page") {
      const page = sourceEntity as NotionPage;
      for (const [key, value] of Object.entries(page.properties)) {
        if (
          (value as any).type === "multi_select" &&
          (value as any).multi_select
        ) {
          (value as any).multi_select.forEach((tag: any) => {
            if (tag.name) tags.push(tag.name);
          });
        }
        if ((value as any).type === "select" && (value as any).select) {
          if ((value as any).select.name) {
            tags.push((value as any).select.name);
          }
        }
      }
    }

    return tags;
  }

  /**
   * Helper: Get entity type
   */
  private getEntityType(entity: NotionEntity): string {
    return entity.object === "user" ? "user" : entity.object;
  }

  /**
   * Helper: Extract text from rich text array
   */
  private extractRichText(richText: any[]): string {
    if (!Array.isArray(richText)) return "";
    return richText.map((rt) => rt.text?.content || "").join("");
  }

  /**
   * Convert Notion blocks to markdown
   */
  private blocksToMarkdown(blocks: NotionBlock[]): string {
    const lines: string[] = [];

    for (const block of blocks) {
      const text = this.blockToMarkdown(block);
      if (text) {
        lines.push(text);
      }
    }

    return lines.join("\n\n").trim();
  }

  /**
   * Convert a single Notion block to markdown
   */
  private blockToMarkdown(block: NotionBlock): string {
    const type = block.type;
    const content = (block as any)[type];

    if (!content) return "";

    // Extract rich text if available
    const richText = content.rich_text || content.text || [];
    const text = this.extractRichText(richText);

    switch (type) {
      case "paragraph":
        return text;

      case "heading_1":
        return `# ${text}`;

      case "heading_2":
        return `## ${text}`;

      case "heading_3":
        return `### ${text}`;

      case "bulleted_list_item":
        return `- ${text}`;

      case "numbered_list_item":
        return `1. ${text}`;

      case "to_do":
        const checked = content.checked ? "x" : " ";
        return `- [${checked}] ${text}`;

      case "toggle":
        return `▶ ${text}`;

      case "quote":
        return `> ${text}`;

      case "code":
        const language = content.language || "";
        return `\`\`\`${language}\n${text}\n\`\`\``;

      case "callout":
        return `📌 ${text}`;

      case "divider":
        return "---";

      default:
        return text;
    }
  }
}
