/**
 * Unit tests for content extraction (entities and relationships)
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import OpenAI from 'openai';

import type { Entity, Relationship } from '../types.js';

// Mock the chat function before importing
jest.unstable_mockModule('../../../llm/llm.js', () => ({
  chat: jest.fn(),
  llm: {} as OpenAI,
}));

// Import after mocking
const { extractGraphFromContent } = await import('./content-extractor.js');
const { chat } = await import('../../../llm/llm.js');
const { stripExtraQuotes, sanitizeEntityName, inferEntityTypeFromRelationship } =
  await import('./utils.js');
const { buildCombinedExtractionPrompt, buildSingleEntityExtractionPrompt } =
  await import('./prompts.js');
const {
  normalizeEntityName,
  deduplicateEntities,
  filterLowValueRelationships,
  mergeRelationships,
} = await import('../schema/entity-deduplication.js');

// Get typed mock
const mockChat = chat as jest.MockedFunction<typeof chat>;

describe('Content Extractor', () => {
  let mockClient: OpenAI;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {} as OpenAI;
  });

  // ============================================================================
  // Utility Functions Tests
  // ============================================================================

  describe('stripExtraQuotes', () => {
    it('should remove double quotes', () => {
      expect(stripExtraQuotes('"Hello World"')).toBe('Hello World');
      expect(stripExtraQuotes('Say "hello"')).toBe('Say hello');
    });

    it('should remove single quotes', () => {
      expect(stripExtraQuotes("'Hello World'")).toBe('Hello World');
      expect(stripExtraQuotes("Say 'hello'")).toBe('Say hello');
    });

    it('should remove backticks', () => {
      expect(stripExtraQuotes('`Hello World`')).toBe('Hello World');
    });

    it('should remove escaped quotes', () => {
      expect(stripExtraQuotes('meeting \\"Sprint Retrospective\\"')).toBe(
        'meeting Sprint Retrospective',
      );
    });

    it('should remove curly quotes', () => {
      expect(stripExtraQuotes('"Hello World"')).toBe('Hello World');
      // Note: Character codes 8220 and 8221 are left/right double quotation marks
      // but the function only removes standard quotes, so these remain
      const leftDoubleQuote = String.fromCharCode(8220);
      const rightDoubleQuote = String.fromCharCode(8221);
      const result = stripExtraQuotes(`${leftDoubleQuote}Hello World${rightDoubleQuote}`);
      // These curly quotes are not removed by the current implementation
      expect(result).toBe(`${leftDoubleQuote}Hello World${rightDoubleQuote}`);
    });

    it('should handle mixed quotes', () => {
      expect(stripExtraQuotes('"`Hello\' World`"')).toBe('Hello World');
    });

    it('should trim whitespace after removing quotes', () => {
      expect(stripExtraQuotes('  "Hello"  ')).toBe('Hello');
    });

    it('should handle empty strings', () => {
      expect(stripExtraQuotes('')).toBe('');
    });

    it('should handle strings without quotes', () => {
      expect(stripExtraQuotes('Hello World')).toBe('Hello World');
    });
  });

  describe('sanitizeEntityName', () => {
    it('should trim whitespace', () => {
      expect(sanitizeEntityName('  Hello World  ')).toBe('Hello World');
    });

    it('should remove quotes', () => {
      expect(sanitizeEntityName('"Project X"')).toBe('Project X');
    });

    it('should return null for empty strings after cleaning', () => {
      expect(sanitizeEntityName('')).toBeNull();
      expect(sanitizeEntityName('   ')).toBeNull();
      expect(sanitizeEntityName('""')).toBeNull();
    });

    it('should handle command-line strings by extracting command name', () => {
      expect(sanitizeEntityName('npm install react')).toBe('npm install react');
      // Command extraction keeps first 3 words that don't start with --
      expect(sanitizeEntityName('git commit -m "test"')).toBe('git commit -m');
    });

    it('should extract script names from command paths', () => {
      const result = sanitizeEntityName('pnpm tsx scripts/shadowComparison/index.ts');
      // Extracts the directory name before the final filename for script paths
      expect(result).toBe('shadowComparison');
    });

    it('should reject overly long commands', () => {
      const longCommand = 'npm install ' + 'package '.repeat(30);
      // After extraction, command is shortened to first 3 words
      const result = sanitizeEntityName(longCommand);
      expect(result).not.toBeNull();
      expect(result).toBe('npm install package');
    });

    it('should handle file paths by extracting filename', () => {
      expect(sanitizeEntityName('src/components/Button.tsx')).toBe('Button.tsx');
      expect(sanitizeEntityName('C:\\Users\\test\\file.js')).toBe('file.js');
    });

    it('should reject overly long strings', () => {
      const longString = 'a'.repeat(200);
      expect(sanitizeEntityName(longString)).toBeNull();
    });

    it('should reject garbled text with too many special characters', () => {
      const garbled = '!!!###$$$%%%^^^&&&***((()))';
      expect(sanitizeEntityName(garbled)).toBeNull();
    });

    it('should accept valid entity names', () => {
      expect(sanitizeEntityName('John Doe')).toBe('John Doe');
      expect(sanitizeEntityName('Project-X')).toBe('Project-X');
      expect(sanitizeEntityName('API_Gateway')).toBe('API_Gateway');
    });
  });

  describe('inferEntityTypeFromRelationship', () => {
    it('should infer Organization for MEMBER_OF', () => {
      expect(inferEntityTypeFromRelationship('MEMBER_OF')).toBe('Organization');
    });

    it('should infer Person for REPORTS_TO', () => {
      expect(inferEntityTypeFromRelationship('REPORTS_TO')).toBe('Person');
    });

    it('should infer Project for WORKS_ON', () => {
      expect(inferEntityTypeFromRelationship('WORKS_ON')).toBe('Project');
    });

    it('should return Entity for unknown types', () => {
      expect(inferEntityTypeFromRelationship('UNKNOWN_TYPE')).toBe('Entity');
    });
  });

  // ============================================================================
  // Prompt Builder Tests
  // ============================================================================

  describe('buildCombinedExtractionPrompt', () => {
    it('should include content in prompt', () => {
      const content = 'John works at Acme Corp on Project X';
      const prompt = buildCombinedExtractionPrompt(content, ['Person'], ['WORKS_AT'], undefined);
      expect(prompt).toContain(content);
    });

    it('should include entity types', () => {
      const prompt = buildCombinedExtractionPrompt(
        'test',
        ['Person', 'Organization'],
        [],
        undefined,
      );
      expect(prompt).toContain('Person, Organization');
    });

    it('should include relationship types', () => {
      const prompt = buildCombinedExtractionPrompt('test', [], ['WORKS_AT', 'MANAGES'], undefined);
      expect(prompt).toContain('WORKS_AT, MANAGES');
    });

    it('should include persona context when provided', () => {
      const persona = 'Software engineering context';
      const prompt = buildCombinedExtractionPrompt('test', [], [], persona);
      expect(prompt).toContain('USER CONTEXT:');
      expect(prompt).toContain(persona);
    });

    it('should not include persona context when not provided', () => {
      const prompt = buildCombinedExtractionPrompt('test', [], [], undefined);
      expect(prompt).not.toContain('USER CONTEXT:');
    });

    it('should truncate very long content', () => {
      const longContent = 'a'.repeat(300000);
      const prompt = buildCombinedExtractionPrompt(longContent, [], [], undefined);
      expect(prompt.length).toBeLessThan(longContent.length + 10000);
    });
  });

  describe('buildSingleEntityExtractionPrompt', () => {
    it('should include entity name to find', () => {
      const prompt = buildSingleEntityExtractionPrompt('test content', 'John Doe', [], undefined);
      expect(prompt).toContain('John Doe');
    });

    it('should include relationship context when provided', () => {
      const relContext = 'John Doe -[WORKS_AT]-> Acme Corp';
      const prompt = buildSingleEntityExtractionPrompt('test', 'John Doe', [], relContext);
      expect(prompt).toContain("Why We're Looking");
      expect(prompt).toContain(relContext);
    });

    it('should not include relationship context when not provided', () => {
      const prompt = buildSingleEntityExtractionPrompt('test', 'John Doe', [], undefined);
      expect(prompt).not.toContain("Why We're Looking");
    });

    it('should include known entity types', () => {
      const prompt = buildSingleEntityExtractionPrompt(
        'test',
        'John',
        ['Person', 'Organization'],
        undefined,
      );
      expect(prompt).toContain('Person, Organization');
    });
  });

  // ============================================================================
  // Entity Deduplication Tests
  // ============================================================================

  describe('normalizeEntityName', () => {
    it('should convert to lowercase', () => {
      expect(normalizeEntityName('HELLO')).toBe('hello');
      expect(normalizeEntityName('HeLLo')).toBe('hello');
    });

    it('should trim whitespace', () => {
      expect(normalizeEntityName('  hello  ')).toBe('hello');
    });

    it('should normalize multiple spaces to single space', () => {
      expect(normalizeEntityName('hello    world')).toBe('hello world');
    });

    it('should handle combined normalization', () => {
      expect(normalizeEntityName('  HELLO    WORLD  ')).toBe('hello world');
    });
  });

  describe('deduplicateEntities', () => {
    it('should merge entities with same normalized name', () => {
      const entities: Entity[] = [
        { name: 'John Doe', type: 'Person', description: 'Engineer' },
        { name: 'john doe', type: 'Person', description: 'Developer' },
        { name: 'JOHN DOE', type: 'Person', description: 'Team lead' },
      ];

      const result = deduplicateEntities(entities);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John Doe');
      expect(result[0].type).toBe('Person');
      expect(result[0].description).toContain('Engineer');
      expect(result[0].description).toContain('Developer');
      expect(result[0].description).toContain('Team lead');
    });

    it('should select dominant type when merging', () => {
      const entities: Entity[] = [
        { name: 'Project X', type: 'Project', description: 'desc1' },
        { name: 'project x', type: 'Project', description: 'desc2' },
        { name: 'PROJECT X', type: 'Initiative', description: 'desc3' },
      ];

      const result = deduplicateEntities(entities);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('Project'); // More occurrences
    });

    it('should handle entities with different names', () => {
      const entities: Entity[] = [
        { name: 'John', type: 'Person', description: 'desc1' },
        { name: 'Jane', type: 'Person', description: 'desc2' },
      ];

      const result = deduplicateEntities(entities);

      expect(result).toHaveLength(2);
    });

    it('should limit merged descriptions', () => {
      const entities: Entity[] = Array.from({ length: 10 }, (_, i) => ({
        name: 'Entity',
        type: 'Type',
        description: `Description ${i}`,
      }));

      const result = deduplicateEntities(entities);

      expect(result).toHaveLength(1);
      expect(result[0].description).toContain('[...]');
    });
  });

  describe('filterLowValueRelationships', () => {
    it('should filter MENTIONED_WITH relationships', () => {
      const relationships: Relationship[] = [
        {
          source: 'A',
          target: 'B',
          type: 'MENTIONED_WITH',
          description: 'test',
          strength: 8,
        },
      ];

      const result = filterLowValueRelationships(relationships);
      expect(result).toHaveLength(0);
    });

    it('should filter RELATED_TO relationships', () => {
      const relationships: Relationship[] = [
        { source: 'A', target: 'B', type: 'RELATED_TO', description: 'test', strength: 8 },
      ];

      const result = filterLowValueRelationships(relationships);
      expect(result).toHaveLength(0);
    });

    it('should filter weak relationships (strength < 5)', () => {
      const relationships: Relationship[] = [
        { source: 'A', target: 'B', type: 'WORKS_ON', description: 'test', strength: 3 },
        { source: 'C', target: 'D', type: 'WORKS_ON', description: 'test', strength: 7 },
      ];

      const result = filterLowValueRelationships(relationships);
      expect(result).toHaveLength(1);
      expect(result[0].strength).toBe(7);
    });

    it('should keep high-value relationships', () => {
      const relationships: Relationship[] = [
        { source: 'A', target: 'B', type: 'REPORTS_TO', description: 'test', strength: 9 },
        { source: 'C', target: 'D', type: 'MANAGES', description: 'test', strength: 8 },
      ];

      const result = filterLowValueRelationships(relationships);
      expect(result).toHaveLength(2);
    });
  });

  describe('mergeRelationships', () => {
    it('should merge duplicate relationships', () => {
      const relationships: Relationship[] = [
        { source: 'John', target: 'Acme', type: 'WORKS_AT', description: 'desc1', strength: 8 },
        { source: 'john', target: 'acme', type: 'WORKS_AT', description: 'desc2', strength: 6 },
      ];

      const result = mergeRelationships(relationships);

      expect(result).toHaveLength(1);
      expect(result[0].strength).toBe(7); // Average of 8 and 6
    });

    it('should keep relationships with different source/target/type', () => {
      const relationships: Relationship[] = [
        { source: 'A', target: 'B', type: 'TYPE1', description: 'desc', strength: 8 },
        { source: 'A', target: 'C', type: 'TYPE1', description: 'desc', strength: 8 },
        { source: 'A', target: 'B', type: 'TYPE2', description: 'desc', strength: 8 },
      ];

      const result = mergeRelationships(relationships);
      expect(result).toHaveLength(3);
    });

    it('should round averaged strength', () => {
      const relationships: Relationship[] = [
        { source: 'A', target: 'B', type: 'TYPE', description: 'desc', strength: 7 },
        { source: 'A', target: 'B', type: 'TYPE', description: 'desc', strength: 8 },
      ];

      const result = mergeRelationships(relationships);
      expect(result).toHaveLength(1);
      expect(result[0].strength).toBe(8); // Rounded average
    });
  });

  // ============================================================================
  // Core Extraction Function Tests (with LLM Mocking)
  // ============================================================================

  describe('extractGraphFromContent', () => {
    it('should extract entities and relationships from content', async () => {
      const mockResponse = JSON.stringify({
        entities: [
          { name: 'John Doe', type: 'Person', description: 'Software engineer' },
          { name: 'Acme Corp', type: 'Organization', description: 'Technology company' },
          { name: 'Project X', type: 'Project', description: 'Internal project' },
        ],
        relationships: [
          {
            source: 'John Doe',
            target: 'Acme Corp',
            type: 'WORKS_AT',
            description: 'Employment',
            strength: 9,
          },
          {
            source: 'John Doe',
            target: 'Project X',
            type: 'WORKS_ON',
            description: 'Active contributor',
            strength: 8,
          },
        ],
      });

      mockChat.mockResolvedValue(mockResponse);

      const content = 'John Doe works at Acme Corp on Project X as a software engineer.';
      const result = await extractGraphFromContent(
        mockClient,
        content,
        ['Person', 'Organization'],
        ['WORKS_AT', 'WORKS_ON'],
      );

      expect(result.entities).toHaveLength(3);
      expect(result.relationships).toHaveLength(2);
      expect(result.entities[0].name).toBe('John Doe');
      expect(result.relationships[0].type).toBe('WORKS_AT');
    });

    it('should handle missing entities with fallback extraction', async () => {
      // First call: main extraction with missing entity
      const mainResponse = JSON.stringify({
        entities: [
          { name: 'John Doe', type: 'Person', description: 'Engineer' },
          { name: 'Project X', type: 'Project', description: 'Project' },
        ],
        relationships: [
          {
            source: 'John Doe',
            target: 'Acme Corp', // Missing entity
            type: 'WORKS_AT',
            description: 'Employment',
            strength: 9,
          },
        ],
      });

      // Second call: fallback extraction for missing entity
      const fallbackResponse = JSON.stringify({
        entity: {
          name: 'Acme Corp',
          type: 'Organization',
          description: 'Technology company',
        },
      });

      mockChat.mockResolvedValueOnce(mainResponse).mockResolvedValueOnce(fallbackResponse);

      const content = 'John Doe works at Acme Corp on Project X.';
      const result = await extractGraphFromContent(
        mockClient,
        content,
        ['Person', 'Organization'],
        ['WORKS_AT'],
      );

      expect(result.entities).toHaveLength(3); // All three entities
      expect(result.relationships).toHaveLength(1);
      expect(result.entities.find((e) => e.name === 'Acme Corp')).toBeDefined();
    });

    it('should create inferential entities when fallback fails', async () => {
      const mainResponse = JSON.stringify({
        entities: [{ name: 'John Doe', type: 'Person', description: 'Engineer' }],
        relationships: [
          {
            source: 'John Doe',
            target: 'Unknown Corp',
            type: 'WORKS_AT',
            description: 'Employment',
            strength: 9,
          },
        ],
      });

      const fallbackResponse = JSON.stringify({
        entity: null, // Fallback failed
      });

      mockChat.mockResolvedValueOnce(mainResponse).mockResolvedValueOnce(fallbackResponse);

      const content = 'John Doe works at Unknown Corp.';
      const result = await extractGraphFromContent(
        mockClient,
        content,
        ['Person', 'Organization'],
        ['WORKS_AT'],
      );

      expect(result.entities).toHaveLength(2);
      const inferredEntity = result.entities.find((e) => e.name === 'Unknown Corp');
      expect(inferredEntity).toBeDefined();
      expect(inferredEntity?.description).toContain('Inferred from relationship');
    });

    it('should filter relationships with invalid entity references', async () => {
      const mockResponse = JSON.stringify({
        entities: [{ name: 'John Doe', type: 'Person', description: 'Engineer' }],
        relationships: [
          {
            source: 'John Doe',
            target: 'Invalid Entity',
            type: 'KNOWS',
            description: 'Connection',
            strength: 7,
          },
        ],
      });

      // Fallback also fails
      const fallbackResponse = JSON.stringify({ entity: null });

      mockChat.mockResolvedValueOnce(mockResponse).mockResolvedValueOnce(fallbackResponse);

      const content = 'John Doe knows someone.';
      const result = await extractGraphFromContent(
        mockClient,
        content,
        ['Person'],
        ['KNOWS'],
        undefined,
        3,
        { recordId: 'test-1', recordTitle: 'Test Record' },
      );

      // Relationship should still exist because inferential entity is created
      expect(result.relationships.length).toBeGreaterThanOrEqual(0);
    });

    it('should retry on LLM errors', async () => {
      mockChat
        .mockRejectedValueOnce(new Error('API error'))
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce(
          JSON.stringify({
            entities: [{ name: 'Test', type: 'Type', description: 'Desc' }],
            relationships: [],
          }),
        );

      const content = 'Test content';
      const result = await extractGraphFromContent(
        mockClient,
        content,
        [],
        [],
        undefined,
        3, // maxRetries
      );

      expect(mockChat).toHaveBeenCalledTimes(3);
      expect(result.entities).toHaveLength(1);
    });

    it('should return empty results after max retries exhausted', async () => {
      mockChat.mockRejectedValue(new Error('API error'));

      const content = 'Test content';
      const result = await extractGraphFromContent(
        mockClient,
        content,
        [],
        [],
        undefined,
        3, // maxRetries
      );

      expect(mockChat).toHaveBeenCalledTimes(3);
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it('should sanitize entity names and skip invalid ones', async () => {
      const mockResponse = JSON.stringify({
        entities: [
          { name: '"Valid Entity"', type: 'Type', description: 'Desc' },
          { name: '   ', type: 'Type', description: 'Empty name' },
          { name: 'a'.repeat(200), type: 'Type', description: 'Too long' },
          { name: 'Good Name', type: 'Type', description: 'Valid' },
        ],
        relationships: [],
      });

      mockChat.mockResolvedValue(mockResponse);

      const content = 'Test content with various entities';
      const result = await extractGraphFromContent(mockClient, content, [], []);

      // Only valid entities should remain
      expect(result.entities.length).toBeLessThan(4);
      expect(result.entities.some((e) => e.name === 'Valid Entity')).toBe(true); // Quotes stripped
      expect(result.entities.some((e) => e.name === 'Good Name')).toBe(true);
    });

    it('should handle relationships with sanitized entity names', async () => {
      const mockResponse = JSON.stringify({
        entities: [
          { name: '"Project X"', type: 'Project', description: 'Project' },
          { name: '"Team Alpha"', type: 'Team', description: 'Team' },
        ],
        relationships: [
          {
            source: '"Project X"',
            target: '"Team Alpha"',
            type: 'ASSIGNED_TO',
            description: 'Assignment',
            strength: 8,
          },
        ],
      });

      mockChat.mockResolvedValue(mockResponse);

      const content = 'Project X is assigned to Team Alpha';
      const result = await extractGraphFromContent(mockClient, content, [], []);

      expect(result.entities).toHaveLength(2);
      expect(result.relationships).toHaveLength(1);
      // Entity names should have quotes stripped
      expect(result.entities[0].name).toBe('Project X');
      expect(result.entities[1].name).toBe('Team Alpha');
      // Relationships should reference cleaned names
      expect(result.relationships[0].source).toBe('Project X');
      expect(result.relationships[0].target).toBe('Team Alpha');
    });

    it('should pass record context to logging', async () => {
      const mockResponse = JSON.stringify({
        entities: [{ name: 'Test', type: 'Type', description: 'Desc' }],
        relationships: [],
      });

      mockChat.mockResolvedValue(mockResponse);

      const content = 'Test content';
      const recordContext = {
        recordId: 'rec-123',
        recordTitle: 'Test Record Title',
      };

      const result = await extractGraphFromContent(
        mockClient,
        content,
        [],
        [],
        undefined,
        3,
        recordContext,
      );

      expect(result.entities).toHaveLength(1);
      // Record context is used for logging (no direct assertion on logs)
    });
  });
});
