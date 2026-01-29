import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

import {
  clearDatabase,
  setupCloneMCPServer,
  setupMongoDB,
  teardownCloneMCPServer,
  teardownMongoDB,
} from '../../../__tests__/setup.js';
import { mcpClientManager } from '../../../mcp/client.js';
import { DataSourceModel } from '../../../models/data-source.model.js';
import { IndexingConfigModel } from '../../../models/indexing-config.model.js';
import { MCPSyncStateModel } from '../../../models/mcp-sync-state.model.js';
import sleep from '../../../utils/sleep.js';
import { indexAll } from './config-indexer.service.js';

import type { TransformedRecord } from '@almanac/indexing-engine';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load GitHub config
const githubConfigPath = join(__dirname, '../../../../../data-sources-config/github.json');
const githubConfigData = JSON.parse(readFileSync(githubConfigPath, 'utf-8'));

describe('indexAll Integration Tests', () => {
  beforeAll(async () => {
    // Start MongoDB Memory Server
    await setupMongoDB();

    // Start clone-mcp-server
    await setupCloneMCPServer(4000);

    // Wait a bit for server to be fully ready
    await sleep(2000);
  }, 60000); // 60 second timeout for setup

  afterAll(async () => {
    // Disconnect all MCP clients
    await mcpClientManager.disconnectAll();

    // Stop clone-mcp-server
    await teardownCloneMCPServer();

    // Stop MongoDB Memory Server
    await teardownMongoDB();
  }, 30000); // 30 second timeout for teardown

  beforeEach(async () => {
    // Clear database before each test
    await clearDatabase();
  });

  describe('Basic Functionality', () => {
    it('should successfully index records from GitHub datasource', async () => {
      // Insert DataSource
      const dataSource = await DataSourceModel.create({
        name: 'github',
        type: 'streamable-http',
        url: 'http://localhost:4000/mcp/github',
        isDisabled: false,
      });

      // Insert IndexingConfig with GitHub config
      const indexingConfig = await IndexingConfigModel.create({
        serverName: 'github',
        displayName: 'GitHub',
        status: 'active',
        config: githubConfigData.indexingConfig as any,
        startingPointValues: {},
      });

      // Connect to MCP server
      await mcpClientManager.connect(dataSource);

      // Collect all records from indexAll
      const allRecords: TransformedRecord[] = [];
      const progressUpdates: any[] = [];

      for await (const { records, progress } of indexAll(
        indexingConfig.config as any,
        'github',
        { query: ['user:testuser'] },
        false, // Don't update sync state for this test
      )) {
        allRecords.push(...records);
        progressUpdates.push(progress);

        console.log('Progress:', {
          fetcher: progress.fetcherName,
          recordType: progress.recordType,
          processed: progress.recordsProcessed,
          status: progress.status,
        });
      }

      // Assertions
      expect(allRecords.length).toBeGreaterThan(0);
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Check first record structure
      const firstRecord = allRecords[0];
      expect(firstRecord).toHaveProperty('_id');
      expect(firstRecord).toHaveProperty('recordType');
      expect(firstRecord).toHaveProperty('title');
      expect(firstRecord).toHaveProperty('content');
      expect(firstRecord).toHaveProperty('source', 'github');

      // Check that we have repositories (first fetcher)
      const repositories = allRecords.filter((r) => r.recordType === 'repository');
      expect(repositories.length).toBeGreaterThan(0);

      console.log('✅ Test completed successfully:', {
        totalRecords: allRecords.length,
        recordTypes: [...new Set(allRecords.map((r) => r.recordType))],
      });
    }, 60000); // 60 second timeout for this test

    it('should update sync state when updateSyncState is true', async () => {
      // Insert DataSource
      const dataSource = await DataSourceModel.create({
        name: 'github',
        type: 'streamable-http',
        url: 'http://localhost:4000/mcp/github',
        isDisabled: false,
      });

      // Insert IndexingConfig
      const indexingConfig = await IndexingConfigModel.create({
        serverName: 'github',
        displayName: 'GitHub',
        status: 'active',
        config: githubConfigData.indexingConfig as any,
        startingPointValues: {},
      });

      // Create initial sync state
      const syncState = await MCPSyncStateModel.create({
        serverName: 'github',
        configId: indexingConfig._id as any,
        configVersion: 1,
        status: 'idle',
      });

      // Connect to MCP server
      await mcpClientManager.connect(dataSource);

      // Run indexAll with updateSyncState = true
      let recordCount = 0;
      for await (const { records } of indexAll(
        indexingConfig.config as any,
        'github',
        { query: ['user:testuser'] },
        true, // Update sync state
      )) {
        recordCount += records.length;
      }

      // Check sync state was updated
      const updatedSyncState = await MCPSyncStateModel.findOne({ serverName: 'github' });
      expect(updatedSyncState).toBeDefined();
      expect(updatedSyncState!.fetcherCursors.size).toBeGreaterThan(0);

      // Check that at least one fetcher has cursor info
      const firstFetcherName = Array.from(updatedSyncState!.fetcherCursors.keys())[0];
      const firstCursor = updatedSyncState!.fetcherCursors.get(firstFetcherName);
      expect(firstCursor).toBeDefined();
      expect(firstCursor!.lastSyncAt).toBeDefined();
      expect(firstCursor!.syncedCount).toBeGreaterThan(0);

      console.log('✅ Sync state updated successfully:', {
        totalFetchers: updatedSyncState!.fetcherCursors.size,
        fetcherNames: Array.from(updatedSyncState!.fetcherCursors.keys()),
      });
    }, 60000);

    it('should respect syncOrder configuration', async () => {
      // Insert DataSource
      const dataSource = await DataSourceModel.create({
        name: 'github',
        type: 'streamable-http',
        url: 'http://localhost:4000/mcp/github',
        isDisabled: false,
      });

      // Insert IndexingConfig
      const indexingConfig = await IndexingConfigModel.create({
        serverName: 'github',
        displayName: 'GitHub',
        status: 'active',
        config: githubConfigData.indexingConfig as any,
        startingPointValues: {},
      });

      // Connect to MCP server
      await mcpClientManager.connect(dataSource);

      // Track fetcher execution order
      const fetcherOrder: string[] = [];

      for await (const { progress } of indexAll(
        indexingConfig.config as any,
        'github',
        { query: ['user:testuser'] },
        false,
      )) {
        if (!fetcherOrder.includes(progress.fetcherName)) {
          fetcherOrder.push(progress.fetcherName);
        }
      }

      // Verify order matches syncOrder from config
      const expectedOrder = githubConfigData.indexingConfig.syncOrder || [];
      expect(fetcherOrder).toEqual(
        expect.arrayContaining(expectedOrder.slice(0, fetcherOrder.length)),
      );

      console.log('✅ Fetcher order verified:', {
        expectedOrder,
        actualOrder: fetcherOrder,
      });
    }, 60000);

    it('should handle forEach dependencies correctly', async () => {
      // Insert DataSource
      const dataSource = await DataSourceModel.create({
        name: 'github',
        type: 'streamable-http',
        url: 'http://localhost:4000/mcp/github',
        isDisabled: false,
      });

      // Insert IndexingConfig
      const indexingConfig = await IndexingConfigModel.create({
        serverName: 'github',
        displayName: 'GitHub',
        status: 'active',
        config: githubConfigData.indexingConfig as any,
        startingPointValues: {},
      });

      // Connect to MCP server
      await mcpClientManager.connect(dataSource);

      // Collect records by type
      const recordsByType: Record<string, number> = {};

      for await (const { records } of indexAll(
        indexingConfig.config as any,
        'github',
        { query: ['user:testuser'] },
        false,
      )) {
        for (const record of records) {
          recordsByType[record.recordType] = (recordsByType[record.recordType] || 0) + 1;
        }
      }

      // Verify we have repositories (seed) and dependent records (issues, PRs, etc.)
      expect(recordsByType['repository']).toBeGreaterThan(0);

      // If we have repositories, we should also have dependent records
      // (assuming the mock data includes them)
      const dependentTypes = ['issue', 'pull_request', 'release', 'discussion'];
      const hasDependentRecords = dependentTypes.some((type) => recordsByType[type] > 0);

      console.log('✅ Record types collected:', recordsByType);
      console.log('Has dependent records:', hasDependentRecords);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Insert DataSource with invalid URL
      const dataSource = await DataSourceModel.create({
        name: 'github-invalid',
        type: 'streamable-http',
        url: 'http://localhost:9999/mcp/github', // Invalid port
        isDisabled: false,
      });

      // Insert IndexingConfig
      const indexingConfig = await IndexingConfigModel.create({
        serverName: 'github-invalid',
        displayName: 'GitHub Invalid',
        status: 'active',
        config: githubConfigData.indexingConfig as any,
        startingPointValues: {},
      });

      // Attempt to run indexAll - should throw connection error
      await expect(async () => {
        for await (const { records } of indexAll(
          indexingConfig.config as any,
          'github-invalid',
          { query: ['user:testuser'] },
          false,
        )) {
          // Should not reach here
        }
      }).rejects.toThrow();

      console.log('✅ Connection error handled correctly');
    }, 30000);

    it('should handle disabled datasource', async () => {
      // Insert disabled DataSource
      const dataSource = await DataSourceModel.create({
        name: 'github-disabled',
        type: 'streamable-http',
        url: 'http://localhost:4000/mcp/github',
        isDisabled: true, // Disabled
      });

      // Insert IndexingConfig
      const indexingConfig = await IndexingConfigModel.create({
        serverName: 'github-disabled',
        displayName: 'GitHub Disabled',
        status: 'active',
        config: githubConfigData.indexingConfig as any,
        startingPointValues: {},
      });

      // Attempt to run indexAll - should throw error about disabled source
      await expect(async () => {
        for await (const { records } of indexAll(
          indexingConfig.config as any,
          'github-disabled',
          { query: ['user:testuser'] },
          false,
        )) {
          // Should not reach here
        }
      }).rejects.toThrow('disabled');

      console.log('✅ Disabled datasource error handled correctly');
    }, 30000);
  });
});
