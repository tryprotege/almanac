/**
 * LLM-based content extraction for entities and relationships
 */

import OpenAI from 'openai';
import { Entity, Relationship } from '../types.js';
import { normalizeEntityName } from '../schema/entity-deduplication.js';
import { chat } from '../../../llm/llm.js';
import logger from '../../../../utils/logger.js';
import sleep from '../../../../utils/sleep.js';
import { env } from '../../../../env.js';
import { buildCombinedExtractionPrompt, buildSingleEntityExtractionPrompt } from './prompts.js';
import { COMBINED_EXTRACTION_SCHEMA, SINGLE_ENTITY_EXTRACTION_SCHEMA } from './schemas.js';
import { stripExtraQuotes, sanitizeEntityName, inferEntityTypeFromRelationship } from './utils.js';

/**
 * Extract entities and relationships using single-pass extraction with fallback
 */
async function extractBothFromContent(
  client: OpenAI,
  content: string,
  existingEntityTypes: string[],
  existingRelationshipTypes: string[],
  persona?: string,
  maxRetries: number = 3,
  recordContext?: {
    recordId: string;
    recordTitle: string;
  },
): Promise<{
  entities: Entity[];
  relationships: Relationship[];
}> {
  let response = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = buildCombinedExtractionPrompt(
        content,
        existingEntityTypes,
        existingRelationshipTypes,
        persona,
      );

      response = await chat(
        client,
        [
          {
            role: 'system',
            content:
              'You are a knowledge graph extraction system. Extract entities and relationships from content. Always respond with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        {
          model: env.LLM_EXTRACTION_MODEL,
          temperature: 0,
          maxTokens: 10000,
          frequencyPenalty: 0.1,
          reasoning: {
            effort: 'none',
          },
          responseFormat: {
            type: 'json_schema',
            json_schema: {
              name: 'combined_extraction',
              schema: COMBINED_EXTRACTION_SCHEMA,
              strict: true,
            },
          },
        },
      );

      const extracted = JSON.parse(response);

      // Sanitize and filter entities
      const rawEntities = extracted.entities || [];
      const entities: Entity[] = [];
      let sanitizedCount = 0;
      let skippedCount = 0;

      for (const entity of rawEntities) {
        const cleanName = sanitizeEntityName(entity.name);

        if (!cleanName) {
          skippedCount++;
          logger.debug({
            msg: `⚠️ Skipped invalid entity`,
            original: entity.name,
            type: entity.type,
            reason: 'Failed sanitization',
          });
          continue;
        }

        if (cleanName !== entity.name) {
          sanitizedCount++;
          logger.debug({
            msg: `🧹 Sanitized entity name`,
            original: entity.name,
            cleaned: cleanName,
            type: entity.type,
          });
        }

        const type = stripExtraQuotes(entity.type);

        entities.push({
          description: `${type} ${cleanName}: ${entity.description}`,
          name: cleanName,
          type,
        });
      }

      // Strip extra quotes from relationship fields and sanitize entity references
      const relationships = (extracted.relationships || [])
        .map((rel: any) => {
          const cleanSource = sanitizeEntityName(rel.source);
          const cleanTarget = sanitizeEntityName(rel.target);

          // Skip relationship if either entity is invalid
          if (!cleanSource || !cleanTarget) {
            logger.debug({
              msg: `⚠️ Skipped relationship with invalid entity names`,
              source: rel.source,
              target: rel.target,
              type: rel.type,
            });
            return null;
          }

          return {
            source: cleanSource,
            target: cleanTarget,
            type: stripExtraQuotes(rel.type),
            description: rel.description,
            strength: rel.strength,
          } as Relationship;
        })
        .filter((rel: Relationship | null): rel is Relationship => rel !== null);

      // Log sanitization summary
      if (sanitizedCount > 0 || skippedCount > 0) {
        logger.info({
          msg: `🧹 Entity sanitization summary`,
          sanitized: sanitizedCount,
          skipped: skippedCount,
          total: rawEntities.length,
        });
      }

      // Log with record context
      const recordInfo = recordContext
        ? ` for "${recordContext.recordTitle}" (ID: ${recordContext.recordId})`
        : '';
      logger.info({
        msg: `📊 Combined Extraction Results`,
        recordInfo,
        contentLength: content.length,
        entitiesExtracted: entities.length,
        relationships: relationships.length,
      });

      if (attempt > 1) {
        logger.debug({
          msg: `✅ Combined extraction succeeded on retry attempt ${attempt}/${maxRetries}`,
        });
      }

      return { entities, relationships };
    } catch (err) {
      const recordInfo = recordContext
        ? ` for "${recordContext.recordTitle}" (ID: ${recordContext.recordId})`
        : '';

      logger.error(
        {
          err,
          recordId: recordContext?.recordId,
          recordTitle: recordContext?.recordTitle,
          attempt,
          maxRetries,
          rawResponse: response,
          responseLength: response?.length,
        },
        `❌ Failed to parse combined extraction response${recordInfo} (attempt ${attempt}/${maxRetries})`,
      );

      if (attempt === maxRetries) {
        logger.error(
          `❌ Combined extraction failed after ${maxRetries} attempts${recordInfo}. Returning empty results.`,
        );
        return { entities: [], relationships: [] };
      }

      const delayMs = 1000 * Math.pow(2, attempt - 1);
      logger.warn(`⚠️  Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delayMs);
    }
  }

  return { entities: [], relationships: [] };
}

/**
 * Extract a single missing entity using fallback prompt
 */
async function extractMissingEntity(
  client: OpenAI,
  content: string,
  entityName: string,
  existingEntityTypes: string[],
  relationshipContext?: string,
  recordContext?: {
    recordId: string;
    recordTitle: string;
  },
): Promise<Entity | null> {
  try {
    const prompt = buildSingleEntityExtractionPrompt(
      content,
      entityName,
      existingEntityTypes,
      relationshipContext,
    );

    logger.debug({
      msg: `📝 Fallback extraction prompt for "${entityName}"`,
      prompt,
    });

    const response = await chat(
      client,
      [
        {
          role: 'system',
          content:
            'You are a knowledge graph entity extraction system. Find the specific entity requested in the text. Always respond with valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      {
        model: env.LLM_EXTRACTION_MODEL,
        temperature: 0,
        maxTokens: 1000,
        frequencyPenalty: 0.2,
        reasoning: {
          effort: 'low',
        },
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'single_entity_extraction',
            schema: SINGLE_ENTITY_EXTRACTION_SCHEMA,
            strict: true,
          },
        },
      },
    );

    logger.debug({
      msg: `🤖 Fallback extraction response for "${entityName}"`,
      response,
    });

    let result;
    try {
      result = JSON.parse(response);
    } catch (parseErr) {
      const recordInfo = recordContext
        ? ` for "${recordContext.recordTitle}" (ID: ${recordContext.recordId})`
        : '';

      logger.error(
        {
          err: parseErr,
          recordId: recordContext?.recordId,
          recordTitle: recordContext?.recordTitle,
          entityName,
          rawResponse: response,
          responseLength: response?.length,
        },
        `❌ Failed to parse fallback extraction JSON response for "${entityName}"${recordInfo}`,
      );
      return null;
    }

    logger.debug({ msg: `📊 Parsed result for "${entityName}":`, result });

    if (result.entity !== null) {
      return {
        name: stripExtraQuotes(result.entity.name),
        type: stripExtraQuotes(result.entity.type),
        description: result.entity.description || 'No description',
      };
    }

    logger.warn({ msg: `⚠️  LLM returned entity=null for "${entityName}"` });
    return null;
  } catch (err) {
    logger.error({ err, entityName }, `❌ Failed to extract missing entity: "${entityName}"`);
    return null;
  }
}

/**
 * Create inferential entity when fallback extraction fails
 */
function createInferentialEntity(entityName: string, relationship: Relationship): Entity {
  // Determine if this is the source or target
  const isSource = relationship.source === entityName;
  const relType = relationship.type;

  // Infer entity type based on relationship
  const inferredType = isSource
    ? inferEntityTypeFromRelationship(relType)
    : inferEntityTypeFromRelationship(relType);

  return {
    name: entityName,
    type: inferredType,
    description: `Inferred from relationship: ${relationship.source} -[${relationship.type}]-> ${relationship.target}`,
  };
}

/**
 * Extract entities and relationships using single-pass extraction with fallback entity recovery
 */
export async function extractGraphFromContent(
  client: OpenAI,
  content: string,
  existingEntityTypes: string[],
  existingRelationshipTypes: string[],
  persona?: string,
  maxRetries: number = 3,
  recordContext?: {
    recordId: string;
    recordTitle: string;
  },
): Promise<{
  entities: Entity[];
  relationships: Relationship[];
}> {
  // Single-pass extraction (entities + relationships together)
  let { entities, relationships } = await extractBothFromContent(
    client,
    content,
    existingEntityTypes,
    existingRelationshipTypes,
    persona,
    maxRetries,
    recordContext,
  );

  // Build a set of valid entity names (normalized) for validation
  const validEntityNames = new Set(entities.map((e) => normalizeEntityName(e.name)));

  // Find missing entities referenced in relationships and group by relationship
  const missingEntitiesMap = new Map<string, Relationship[]>();
  for (const rel of relationships) {
    const normalizedSource = normalizeEntityName(rel.source);
    const normalizedTarget = normalizeEntityName(rel.target);

    if (!validEntityNames.has(normalizedSource)) {
      if (!missingEntitiesMap.has(rel.source)) {
        missingEntitiesMap.set(rel.source, []);
      }
      missingEntitiesMap.get(rel.source)!.push(rel);
    }
    if (!validEntityNames.has(normalizedTarget)) {
      if (!missingEntitiesMap.has(rel.target)) {
        missingEntitiesMap.set(rel.target, []);
      }
      missingEntitiesMap.get(rel.target)!.push(rel);
    }
  }

  // Fallback extraction for missing entities
  if (missingEntitiesMap.size > 0) {
    const missingEntityNames = Array.from(missingEntitiesMap.keys());
    const recordInfo = recordContext
      ? ` for "${recordContext.recordTitle}" (ID: ${recordContext.recordId})`
      : '';

    logger.warn(
      `⚠️  Found ${missingEntitiesMap.size} missing entities in relationships${recordInfo}`,
    );
    logger.warn(`   Missing entities: ${missingEntityNames.map((n) => `"${n}"`).join(', ')}`);

    const fallbackLimit = 10;
    let fallbackCount = 0;
    let extractedCount = 0;
    let inferredCount = 0;

    for (const [missingName, relContexts] of missingEntitiesMap) {
      if (fallbackCount >= fallbackLimit) {
        logger.warn(
          `⚠️  Reached fallback limit (${fallbackLimit}), skipping remaining missing entities`,
        );
        break;
      }

      const relContext = `${relContexts[0].source} -[${relContexts[0].type}]-> ${relContexts[0].target}`;

      logger.debug({
        msg: `Attempting fallback extraction for: "${missingName}"`,
        context: relContext,
      });

      const entity = await extractMissingEntity(
        client,
        content,
        missingName,
        existingEntityTypes,
        relContext,
        recordContext,
      );

      if (entity) {
        entities.push(entity);
        validEntityNames.add(normalizeEntityName(entity.name));
        logger.info(`   ✅ Fallback extracted: "${entity.name}" (${entity.type})`);
        extractedCount++;
      } else {
        const inferredEntity = createInferentialEntity(missingName, relContexts[0]);
        entities.push(inferredEntity);
        validEntityNames.add(normalizeEntityName(inferredEntity.name));
        logger.info(
          `   🔮 Inferential entity created: "${inferredEntity.name}" (${inferredEntity.type})`,
        );
        inferredCount++;
      }

      fallbackCount++;
    }
  }

  // Validate relationships after fallback - filter out those with missing entities
  const validatedRelationships = relationships.filter((rel: Relationship) => {
    const normalizedSource = normalizeEntityName(rel.source);
    const normalizedTarget = normalizeEntityName(rel.target);

    const hasValidSource = validEntityNames.has(normalizedSource);
    const hasValidTarget = validEntityNames.has(normalizedTarget);

    if (!hasValidSource || !hasValidTarget) {
      logger.warn(`⚠️  Filtered invalid relationship - entity not found even after fallback:`);
      if (recordContext) {
        logger.warn(`   Record ID: ${recordContext.recordId}`);
        logger.warn(`   Record: "${recordContext.recordTitle}"`);
      }
      logger.warn(`   Relationship: ${rel.source} -[${rel.type}]-> ${rel.target}`);
      if (!hasValidSource) {
        logger.warn(`   Missing source entity: "${rel.source}"`);
      }
      if (!hasValidTarget) {
        logger.warn(`   Missing target entity: "${rel.target}"`);
      }

      return false;
    }

    return true;
  });

  const filteredCount = relationships.length - validatedRelationships.length;

  // Summary logging
  const recordInfo = recordContext
    ? `"${recordContext.recordTitle}" (ID: ${recordContext.recordId})`
    : 'unknown record';
  logger.info({
    msg: `✅ Single-pass extraction complete`,
    recordInfo,
    entities: entities.length,
    relationships: relationships.length,
  });
  if (filteredCount > 0) {
    logger.warn({
      msg: `Filtered ${filteredCount} invalid relationships (entities not found)`,
    });
  }

  return {
    entities,
    relationships: validatedRelationships,
  };
}
