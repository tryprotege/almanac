import {
  EntityRelationship,
  FetchOptions,
  SourceType,
} from "../../../types/index.js";
import { Record } from "../../../models/record.model.js";
import { computeChecksum } from "../../../utils/checksum.js";

/**
 * Base entity adapter interface
 * All source-specific adapters must implement this interface
 */
export abstract class BaseEntityAdapter<TSource = any> {
  abstract readonly source: SourceType;
  abstract readonly supportedEntityTypes: string[];

  /**
   * Fetch all entities from source
   * Returns an async iterator for memory-efficient streaming
   */
  abstract fetchAll(options?: FetchOptions): AsyncIterable<TSource[]>;

  /**
   * Fetch single entity by ID
   */
  abstract fetchById(id: string): Promise<TSource | null>;

  /**
   * Transform source entity to unified format
   */
  abstract transform(sourceEntity: TSource): Promise<Record>;

  /**
   * Extract relationships from entity
   */
  abstract extractRelationships(
    sourceEntity: TSource
  ): Promise<EntityRelationship[]>;

  /**
   * Compute checksum for change detection
   * Can be overridden for source-specific logic
   */
  computeChecksum(sourceEntity: TSource): string {
    return computeChecksum(sourceEntity);
  }

  /**
   * Check if entity has changed
   */
  hasChanged(sourceEntity: TSource, existingChecksum: string): boolean {
    return this.computeChecksum(sourceEntity) !== existingChecksum;
  }

  /**
   * Generate entity ID in standard format
   */
  protected generateEntityId(recordType: string, sourceId: string): string {
    return `${this.source}_${recordType}_${sourceId}`;
  }

  /**
   * Extract text content from entity (helper method)
   */
  protected abstract extractTextContent(sourceEntity: TSource): string;

  /**
   * Extract title from entity (helper method)
   */
  protected abstract extractTitle(sourceEntity: TSource): string;

  /**
   * Extract people from entity (helper method)
   */
  protected abstract extractPeople(sourceEntity: TSource): string[];

  /**
   * Extract primary date from entity (helper method)
   */
  protected abstract extractPrimaryDate(sourceEntity: TSource): Date | null;

  /**
   * Extract tags from entity (helper method)
   */
  protected abstract extractTags(sourceEntity: TSource): string[];
}
