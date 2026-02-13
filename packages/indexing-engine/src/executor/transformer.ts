/**
 * Record transformation engine
 *
 * This module transforms raw data from MCP servers into a unified record format.
 *
 * Key concepts:
 * - **Raw Record**: The original data object returned by an MCP tool after arrayPath extraction.
 *   This is a single item (e.g., one meeting, one document, one user) with its native structure.
 *
 * - **Enriched Record**: A raw record plus additional data fetched via enrichment tools.
 *   Enrichments add context like transcripts, summaries, or related data.
 *
 * - **Transformed Record**: The final unified format with standardized fields (title, content, etc.)
 *   and a computed ID. This is what gets stored in the database.
 *
 * Example flow:
 * 1. MCP tool returns: `{ content: [{ text: '{"items":[{meeting1}, {meeting2}]}' }] }`
 * 2. resultPath extracts: `'{"items":[...]}'` and parses it
 * 3. arrayPath extracts: individual meetings → Raw Records
 * 4. Enrichments fetch additional data → Enriched Records
 * 5. Transform maps fields → Transformed Records
 */

import { JSONPath } from 'jsonpath-plus';
import type {
  RecordTypeConfig,
  FieldMapping,
  PathMapping,
  PathsMapping,
  TemplateMapping,
  CodeMapping,
  ProcessorMapping,
} from '../types/config.js';
import type { TransformedRecord, EnrichedRecord } from '../types/execution.js';
import { executeSandboxCode, executeProcessor } from './sandbox.js';
import { createHash } from 'crypto';

/**
 * Transform a single enriched record to unified format
 *
 * @param enrichedRecord - The raw record plus any enrichment data
 * @param config - Record type configuration defining how to map fields
 * @param source - The source system name (e.g., "fathom", "notion")
 * @returns The transformed record in unified format
 * @throws Error if record is invalid or missing required ID field
 */
export async function transformRecord(
  enrichedRecord: EnrichedRecord,
  config: RecordTypeConfig,
  source: string,
): Promise<TransformedRecord> {
  const { record, enrichments } = enrichedRecord;

  // Validate input record
  if (!record || typeof record !== 'object') {
    throw new Error(`Invalid record: expected object, got ${typeof record}`);
  }

  // Skip wrapper objects that look like pagination responses
  // These should have been extracted via arrayPath before reaching this function
  if (record.pageInfo && (record.content || record.results)) {
    throw new Error(
      `Invalid record: appears to be a pagination wrapper object, not an individual record. ` +
        `Ensure arrayPath is configured correctly to extract individual items.`,
    );
  }

  const context = {
    record,
    enrichments,
  };

  // Generate record ID - use configured idField or fallback to common patterns
  let sourceId: string | undefined;

  // First try configured idField if specified
  if (config.idField) {
    try {
      const extractedId = JSONPath({
        path: config.idField,
        json: record,
        wrap: false,
      });
      sourceId = extractedId;
    } catch (err) {
      console.warn(`Failed to extract ID using configured idField "${config.idField}":`, err);
    }
  }

  // Fallback to common ID patterns if not found
  if (!sourceId) {
    sourceId = record.id || record._id || record.sourceId;
    if (!sourceId) {
      // Check for other common ID patterns
      const idKey = Object.keys(record).find((k) => k.endsWith('_id') || k.endsWith('Id'));
      const potentialId =
        record.recordId ||
        record.uuid ||
        record.guid ||
        record.gid ||
        (idKey ? record[idKey] : undefined) ||
        record.url ||
        record.uri;

      if (!potentialId) {
        throw new Error(
          `Record missing ID field: ${JSON.stringify(record).substring(0, 100)}. ` +
            `Expected one of: id, _id, sourceId, recordId, uuid, guid, *_id, url, uri. ` +
            `Available fields: ${Object.keys(record).join(', ')}` +
            (config.idField ? `. Configured idField "${config.idField}" also failed.` : ''),
        );
      }

      sourceId = potentialId;
    }
  }

  // Ensure sourceId is defined (TypeScript type guard)
  if (!sourceId) {
    throw new Error(
      `Failed to extract sourceId from record: ${JSON.stringify(record).substring(0, 100)}`,
    );
  }

  const _id = generateRecordId(sourceId, config.name, source);

  // Resolve all fields using field mappings
  const title = await resolveField(config.fields.title, context, source);
  const content = await resolveField(config.fields.content, context, source);
  const people = await resolveField(config.fields.people, context, source);
  const sourceCreatedAt = await resolveField(config.fields.sourceCreatedAt, context, source);
  const sourceUpdatedAt = await resolveField(config.fields.sourceUpdatedAt, context, source);
  const tags = await resolveField(config.fields.tags, context, source);
  const parentId = await resolveField(config.fields.parentId, context, source);

  // Compute checksum for change detection
  const checksum = computeChecksum(record);

  return {
    _id,
    source,
    sourceId,
    recordType: config.name,

    title: title || 'Untitled',
    content: content || '',
    people: Array.isArray(people) ? people : people ? [people] : undefined,
    sourceCreatedAt: sourceCreatedAt ? parseDate(sourceCreatedAt) : null,
    sourceUpdatedAt: sourceUpdatedAt ? parseDate(sourceUpdatedAt) : null,
    tags: Array.isArray(tags) ? tags : tags ? [tags] : undefined,
    parentId,

    rawData: record,
    enrichments,
    checksum,
    version: 1,
  };
}

/**
 * Resolve a field mapping to extract data from the record
 *
 * @param mapping - The field mapping configuration (path, code, template, etc.)
 * @param context - The record and enrichments data
 * @param source - The source system name
 * @returns The resolved field value
 */
async function resolveField(
  mapping: FieldMapping | undefined,
  context: { record: any; enrichments: Record<string, any> },
  source: string,
): Promise<any> {
  if (!mapping) return undefined;

  // Handle legacy format (without type field)
  if ('path' in mapping && !('type' in mapping)) {
    return resolvePathMapping({ type: 'path', path: (mapping as any).path }, context);
  }
  if ('paths' in mapping && !('type' in mapping)) {
    return resolvePathsMapping(
      {
        type: 'paths',
        paths: (mapping as any).paths,
        join: (mapping as any).join,
      },
      context,
    );
  }
  if ('template' in mapping && !('type' in mapping)) {
    return resolveTemplateMapping(
      { type: 'template', template: (mapping as any).template },
      context,
    );
  }
  if ('code' in mapping && !('type' in mapping)) {
    return resolveCodeMapping({ type: 'code', code: (mapping as any).code }, context, source);
  }
  if ('processor' in mapping && !('type' in mapping)) {
    return resolveProcessorMapping(
      {
        type: 'processor',
        processor: (mapping as any).processor,
        input: (mapping as any).input,
        options: (mapping as any).options,
      },
      context,
    );
  }

  // Handle typed format
  switch (mapping.type) {
    case 'path':
      return resolvePathMapping(mapping, context);

    case 'paths':
      return resolvePathsMapping(mapping, context);

    case 'template':
      return resolveTemplateMapping(mapping, context);

    case 'code':
      return resolveCodeMapping(mapping, context, source);

    case 'processor':
      return resolveProcessorMapping(mapping, context);

    default:
      throw new Error(`Unknown mapping type: ${(mapping as any).type}`);
  }
}

/**
 * Resolve JSONPath mapping
 */
function resolvePathMapping(
  mapping: PathMapping,
  context: { record: any; enrichments: Record<string, any> },
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
function resolvePathsMapping(
  mapping: PathsMapping,
  context: { record: any; enrichments: Record<string, any> },
): any {
  const values = mapping.paths
    .map((path) => {
      try {
        const result = JSONPath({ path, json: context.record });
        return Array.isArray(result) && result.length > 0 ? result[0] : undefined;
      } catch {
        return undefined;
      }
    })
    .filter((v) => v !== undefined && v !== null && v !== '');

  return values.length > 0 ? values.join(mapping.join || ' ') : undefined;
}

/**
 * Resolve template mapping
 */
function resolveTemplateMapping(
  mapping: TemplateMapping,
  context: { record: any; enrichments: Record<string, any> },
): any {
  return mapping.template.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    try {
      // Use full context to support both record.* and enrichments.* paths
      const result = JSONPath({ path: expr, json: context });
      return Array.isArray(result) && result.length > 0 ? result[0] : '';
    } catch {
      return '';
    }
  });
}

/**
 * Resolve code mapping
 */
async function resolveCodeMapping(
  mapping: CodeMapping,
  context: { record: any; enrichments: Record<string, any> },
  source: string,
): Promise<any> {
  return executeSandboxCode(mapping.code, context, source);
}

/**
 * Resolve processor mapping
 */
async function resolveProcessorMapping(
  mapping: ProcessorMapping,
  context: { record: any; enrichments: Record<string, any> },
): Promise<any> {
  // Get input data via JSONPath
  const inputData = JSONPath({ path: mapping.input, json: context.record });
  const actualInput = Array.isArray(inputData) && inputData.length > 0 ? inputData[0] : inputData;

  // Execute processor
  return executeProcessor(mapping.processor, actualInput, mapping.options);
}

/**
 * Generate a unique record ID
 *
 * @param sourceId - The ID from the source system
 * @param recordTypeName - The record type name
 * @param source - The source system name
 * @returns A unique ID in format: source_recordType_sourceId
 */
function generateRecordId(sourceId: string, recordTypeName: string, source: string): string {
  return `${source}_${recordTypeName}_${sourceId}`;
}

/**
 * Parse date from various formats
 *
 * @param value - The value to parse as a date
 * @returns A Date object or null if parsing fails
 */
function parseDate(value: any): Date | null {
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
 *
 * @param record - The raw record data
 * @returns A SHA-256 hash of the record
 */
function computeChecksum(record: any): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(record));
  return hash.digest('hex');
}
