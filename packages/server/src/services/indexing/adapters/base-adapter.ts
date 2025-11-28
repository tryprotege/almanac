import {
  EntityRelationship,
  FetchOptions,
  SourceType,
} from "../../../types/index.js";
import { Record } from "../../../models/record.model.js";
import { computeChecksum } from "../../../utils/checksum.js";

/**
 * Base record adapter interface
 * All source-specific adapters must implement this interface
 */
export abstract class BaseRecordAdapter<TSource = any> {
  abstract readonly source: SourceType;
  abstract readonly supportedRecordTypes: string[];

  /**
   * Fetch all records from source
   * Returns an async iterator for memory-efficient streaming
   */
  abstract fetchAll(options?: FetchOptions): AsyncIterable<TSource[]>;

  /**
   * Fetch records modified since timestamp (for incremental sync)
   */
  abstract fetchIncremental(
    since: Date,
    cursor?: string
  ): AsyncIterable<TSource[]>;

  /**
   * Fetch single record by ID
   */
  abstract fetchById(id: string): Promise<TSource | null>;

  /**
   * Transform source record to unified format
   */
  abstract transform(sourceRecord: TSource): Promise<Record>;

  /**
   * Extract relationships from record
   */
  abstract extractRelationships(
    sourceRecord: TSource
  ): Promise<EntityRelationship[]>;

  /**
   * Check if record is deleted in source
   */
  abstract isDeleted(sourceRecord: TSource): boolean;

  /**
   * Get list of deleted record IDs since timestamp
   */
  abstract getDeletedRecords(since: Date): AsyncIterable<string[]>;

  /**
   * Compute checksum for change detection
   * Can be overridden for source-specific logic
   */
  computeChecksum(sourceRecord: TSource): string {
    return computeChecksum(sourceRecord);
  }

  /**
   * Check if record has changed
   */
  hasChanged(sourceRecord: TSource, existingChecksum: string): boolean {
    return this.computeChecksum(sourceRecord) !== existingChecksum;
  }

  /**
   * Generate record ID in standard format
   */
  protected generateRecordId(recordType: string, sourceId: string): string {
    return `${this.source}_${recordType}_${sourceId}`;
  }

  /**
   * Extract text content from record (helper method)
   */
  protected abstract extractTextContent(sourceRecord: TSource): string;

  /**
   * Extract title from record (helper method)
   */
  protected abstract extractTitle(sourceRecord: TSource): string;

  /**
   * Extract people from record (helper method)
   */
  protected abstract extractPeople(sourceRecord: TSource): string[];

  /**
   * Extract primary date from record (helper method)
   */
  protected abstract extractPrimaryDate(sourceRecord: TSource): Date | null;

  /**
   * Extract tags from record (helper method)
   */
  protected abstract extractTags(sourceRecord: TSource): string[];
}
