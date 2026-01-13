#!/usr/bin/env node
/**
 * Comprehensive test script for eBee search functionality
 * Tests all query modes, parameters, filters, and edge cases
 *
 * Prerequisites:
 * - eBee server must be running (default: http://localhost:3000)
 * - Data should be indexed for meaningful results
 *
 * Usage:
 *   pnpm tsx scripts/test-query.ts                    # Run default test
 *   pnpm tsx scripts/test-query.ts --all              # Run all tests
 *   pnpm tsx scripts/test-query.ts --modes            # Test all query modes
 *   pnpm tsx scripts/test-query.ts --params           # Test parameter variations
 *   pnpm tsx scripts/test-query.ts --filters          # Test filters
 *   pnpm tsx scripts/test-query.ts --edge-cases       # Test edge cases
 *   pnpm tsx scripts/test-query.ts --test naive-basic # Run specific test
 *   PORT=3001 pnpm tsx scripts/test-query.ts --all    # Custom port
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// ============================================================================
// Types
// ============================================================================

interface LightRAGChunk {
  id: string;
  chunk_index?: number;
  document_id: string;
  title: string;
  source: string;
  source_id: string;
  url?: string;
  date?: string;
  snippet: string;
  score: number;
  type?: string;
  people?: string[];
  full_content?: string;
  metadata?: any;
}

interface LightRAGResponse {
  query: string;
  mode: string;
  processing_time_ms: number;
  chunks: LightRAGChunk[];
  stats: {
    total_chunks: number;
    unique_documents: number;
    processing_time_ms: number;
    retrieval_breakdown?: {
      vector_matches: number;
      graph_expanded: number;
      reranked: boolean;
    };
  };
  metadata?: any;
}

interface TestCase {
  name: string;
  category: string;
  query: string;
  arguments: any;
  expected?: {
    minChunks?: number;
    maxChunks?: number;
    mode?: string;
    reranked?: boolean;
    graphExpanded?: boolean;
    minScore?: number;
    hasFullContent?: boolean;
  };
}

// ============================================================================
// Test Suite Definition
// ============================================================================

const TEST_SUITE: TestCase[] = [
  // ==========================================================================
  // 1. QUERY MODE TESTS
  // ==========================================================================
  {
    name: 'naive-basic',
    category: 'modes',
    query: 'protege bugs',
    arguments: {
      mode: 'naive',
    },
    expected: {
      mode: 'naive',
      graphExpanded: false,
      minChunks: 1,
    },
  },
  {
    name: 'naive-high-threshold',
    category: 'modes',
    query: 'protege customer requests',
    arguments: {
      mode: 'naive',
      score_threshold: 0.7,
      chunk_top_k: 15,
    },
    expected: {
      mode: 'naive',
      minScore: 0.7,
      maxChunks: 15,
    },
  },
  {
    name: 'local-basic',
    category: 'modes',
    query: 'stripe check in',
    arguments: {
      mode: 'local',
    },
    expected: {
      mode: 'local',
      graphExpanded: true,
    },
  },
  {
    name: 'local-custom-topk',
    category: 'modes',
    query: 'worldpay sales call',
    arguments: {
      mode: 'local',
      top_k: 40,
      chunk_top_k: 10,
    },
    expected: {
      mode: 'local',
      maxChunks: 10,
    },
  },
  {
    name: 'global-basic',
    category: 'modes',
    query: 'stripe feedback',
    arguments: {
      mode: 'global',
    },
    expected: {
      mode: 'global',
      graphExpanded: true,
    },
  },
  {
    name: 'global-workflows',
    category: 'modes',
    query: 'monitoring capabilities',
    arguments: {
      mode: 'global',
      top_k: 50,
      chunk_top_k: 15,
    },
    expected: {
      mode: 'global',
      maxChunks: 15,
    },
  },
  {
    name: 'hybrid-basic',
    category: 'modes',
    query: 'What are the main technical challenges?',
    arguments: {
      mode: 'hybrid',
    },
    expected: {
      mode: 'hybrid',
      graphExpanded: true,
    },
  },
  {
    name: 'mix-basic',
    category: 'modes',
    query: 'Explain the data pipeline architecture',
    arguments: {
      mode: 'mix',
    },
    expected: {
      mode: 'mix',
      reranked: true,
    },
  },
  {
    name: 'mix-no-rerank',
    category: 'modes',
    query: 'How do I set up the development environment?',
    arguments: {
      mode: 'mix',
      chunk_top_k: 15,
      enable_rerank: false,
    },
    expected: {
      mode: 'mix',
      reranked: false,
      maxChunks: 15,
    },
  },

  // ==========================================================================
  // 2. RESPONSE FORMAT TESTS
  // ==========================================================================
  {
    name: 'compact-response',
    category: 'formats',
    query: 'API documentation',
    arguments: {
      mode: 'mix',
      response_format: 'compact',
    },
    expected: {
      hasFullContent: false,
    },
  },
  {
    name: 'full-response',
    category: 'formats',
    query: 'technical specifications',
    arguments: {
      mode: 'mix',
      response_format: 'full',
      chunk_top_k: 5,
    },
    expected: {
      hasFullContent: true,
      maxChunks: 5,
    },
  },

  // ==========================================================================
  // 3. PARAMETER VARIATION TESTS
  // ==========================================================================
  {
    name: 'low-topk',
    category: 'params',
    query: 'user authentication',
    arguments: {
      mode: 'hybrid',
      top_k: 10,
      chunk_top_k: 5,
    },
    expected: {
      maxChunks: 5,
    },
  },
  {
    name: 'high-topk',
    category: 'params',
    query: 'system architecture',
    arguments: {
      mode: 'hybrid',
      top_k: 100,
      chunk_top_k: 50,
    },
    expected: {
      minChunks: 1,
    },
  },
  {
    name: 'low-threshold',
    category: 'params',
    query: 'documentation',
    arguments: {
      mode: 'naive',
      score_threshold: 0.3,
      chunk_top_k: 30,
    },
    expected: {
      minScore: 0.3,
    },
  },
  {
    name: 'high-threshold',
    category: 'params',
    query: 'critical security issues',
    arguments: {
      mode: 'mix',
      score_threshold: 0.8,
      chunk_top_k: 10,
      enable_rerank: true,
    },
    expected: {
      minScore: 0.8,
      maxChunks: 10,
    },
  },

  // ==========================================================================
  // 4. FILTER TESTS
  // ==========================================================================
  {
    name: 'filter-notion',
    category: 'filters',
    query: 'project roadmap',
    arguments: {
      mode: 'mix',
      filters: {
        sources: ['notion'],
      },
      chunk_top_k: 20,
    },
  },
  {
    name: 'filter-multiple-sources',
    category: 'filters',
    query: 'product updates',
    arguments: {
      mode: 'mix',
      filters: {
        sources: ['notion', 'slack'],
      },
    },
  },
  {
    name: 'filter-date-range',
    category: 'filters',
    query: 'recent updates',
    arguments: {
      mode: 'mix',
      filters: {
        dateRange: {
          start: '2024-11-01T00:00:00Z',
          end: '2024-11-30T23:59:59Z',
        },
      },
      chunk_top_k: 15,
    },
  },
  {
    name: 'filter-combined',
    category: 'filters',
    query: 'sprint planning',
    arguments: {
      mode: 'mix',
      filters: {
        sources: ['notion'],
        dateRange: {
          start: '2024-10-01T00:00:00Z',
          end: '2024-12-31T23:59:59Z',
        },
      },
    },
  },

  // ==========================================================================
  // 5. EDGE CASE TESTS
  // ==========================================================================
  {
    name: 'empty-results',
    category: 'edge-cases',
    query: 'xyzzytotallynonexistentquery12345',
    arguments: {
      mode: 'naive',
      score_threshold: 0.9,
    },
    expected: {
      maxChunks: 0,
    },
  },
  {
    name: 'very-short-query',
    category: 'edge-cases',
    query: 'API',
    arguments: {
      mode: 'naive',
      chunk_top_k: 10,
    },
  },
  {
    name: 'very-long-query',
    category: 'edge-cases',
    query:
      'Can you provide a comprehensive overview of the entire authentication and authorization system including OAuth2 implementation, JWT token handling, refresh token rotation, session management, role-based access control, and integration with third-party identity providers?',
    arguments: {
      mode: 'mix',
    },
  },
  {
    name: 'question-format',
    category: 'edge-cases',
    query: 'Who is working on the mobile app and what is their progress?',
    arguments: {
      mode: 'local',
    },
  },

  // ==========================================================================
  // 6. PERFORMANCE BENCHMARK TESTS
  // ==========================================================================
  {
    name: 'perf-naive-fastest',
    category: 'performance',
    query: 'quick search test',
    arguments: {
      mode: 'naive',
      chunk_top_k: 10,
    },
  },
  {
    name: 'perf-hybrid-balanced',
    category: 'performance',
    query: 'balanced search test',
    arguments: {
      mode: 'hybrid',
    },
  },
  {
    name: 'perf-mix-accurate',
    category: 'performance',
    query: 'comprehensive search test',
    arguments: {
      mode: 'mix',
      enable_rerank: true,
    },
  },
];

// ============================================================================
// Test Execution
// ============================================================================

class TestRunner {
  private client: Client | null = null;
  private url: string;
  private results: Array<{
    test: TestCase;
    passed: boolean;
    response?: LightRAGResponse;
    error?: string;
    duration?: number;
  }> = [];

  constructor(port: number) {
    this.url = `http://localhost:${port}/mcp`;
  }

  async connect(): Promise<void> {
    this.client = new Client(
      {
        name: 'ebee-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    const transport = new StreamableHTTPClientTransport(new URL(this.url));
    await this.client.connect(transport);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  async runTest(testCase: TestCase): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 Running Test: ${testCase.name}`);
    console.log(`   Category: ${testCase.category}`);
    console.log(`   Query: "${testCase.query}"`);
    console.log(`   Arguments:`, JSON.stringify(testCase.arguments, null, 2));

    const startTime = Date.now();

    try {
      const result = await this.client.callTool({
        name: 'ebee_search',
        arguments: {
          query: testCase.query,
          ...testCase.arguments,
        },
      });

      const duration = Date.now() - startTime;
      const resultText = (result.content as any)[0]?.text;

      if (!resultText) {
        this.results.push({
          test: testCase,
          passed: false,
          error: 'No content in response',
          duration,
        });
        console.log(`   ❌ FAILED: No content in response`);
        return;
      }

      const response: LightRAGResponse = JSON.parse(resultText);
      const passed = this.validateResponse(testCase, response);

      this.results.push({
        test: testCase,
        passed,
        response,
        duration,
      });

      if (passed) {
        console.log(`   ✅ PASSED`);
      } else {
        console.log(`   ⚠️  FAILED validation`);
      }

      this.displayResults(response, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.results.push({
        test: testCase,
        passed: false,
        error: errorMsg,
        duration,
      });
      console.log(`   ❌ ERROR: ${errorMsg}`);
    }
  }

  private validateResponse(testCase: TestCase, response: LightRAGResponse): boolean {
    if (!testCase.expected) return true;

    const { expected } = testCase;
    const issues: string[] = [];

    // Check mode
    if (expected.mode && response.mode !== expected.mode) {
      issues.push(`Expected mode "${expected.mode}", got "${response.mode}"`);
    }

    // Check chunk count
    if (expected.minChunks !== undefined && response.chunks.length < expected.minChunks) {
      issues.push(`Expected at least ${expected.minChunks} chunks, got ${response.chunks.length}`);
    }

    if (expected.maxChunks !== undefined && response.chunks.length > expected.maxChunks) {
      issues.push(`Expected at most ${expected.maxChunks} chunks, got ${response.chunks.length}`);
    }

    // Check reranking
    if (
      expected.reranked !== undefined &&
      response.stats.retrieval_breakdown?.reranked !== expected.reranked
    ) {
      issues.push(
        `Expected reranked=${expected.reranked}, got ${response.stats.retrieval_breakdown?.reranked}`,
      );
    }

    // Check graph expansion
    if (expected.graphExpanded === true) {
      const expanded = (response.stats.retrieval_breakdown?.graph_expanded || 0) > 0;
      if (!expanded) {
        issues.push(`Expected graph expansion, but graph_expanded = 0`);
      }
    } else if (expected.graphExpanded === false) {
      const expanded = (response.stats.retrieval_breakdown?.graph_expanded || 0) > 0;
      if (expanded) {
        issues.push(
          `Expected no graph expansion, but graph_expanded = ${response.stats.retrieval_breakdown?.graph_expanded}`,
        );
      }
    }

    // Check minimum score
    if (expected.minScore !== undefined) {
      const belowThreshold = response.chunks.filter((c) => c.score < expected.minScore!);
      if (belowThreshold.length > 0) {
        issues.push(
          `Found ${belowThreshold.length} chunks below score threshold ${expected.minScore}`,
        );
      }
    }

    // Check full content
    if (expected.hasFullContent === true) {
      const withoutFullContent = response.chunks.filter((c) => !c.full_content);
      if (withoutFullContent.length > 0) {
        issues.push(
          `Expected full_content in all chunks, but ${withoutFullContent.length} chunks missing it`,
        );
      }
    } else if (expected.hasFullContent === false) {
      const withFullContent = response.chunks.filter((c) => c.full_content);
      if (withFullContent.length > 0) {
        issues.push(`Expected no full_content, but ${withFullContent.length} chunks have it`);
      }
    }

    if (issues.length > 0) {
      console.log(`   Validation Issues:`);
      issues.forEach((issue) => console.log(`     - ${issue}`));
      return false;
    }

    return true;
  }

  private displayResults(response: LightRAGResponse, duration: number): void {
    console.log(`\n   📊 Results:`);
    console.log(`      Processing Time: ${response.processing_time_ms}ms`);
    console.log(`      Total Duration: ${duration}ms`);
    console.log(`      Total Chunks: ${response.stats.total_chunks}`);
    console.log(`      Unique Documents: ${response.stats.unique_documents}`);

    if (response.stats.retrieval_breakdown) {
      console.log(`      Vector Matches: ${response.stats.retrieval_breakdown.vector_matches}`);
      console.log(`      Graph Expanded: ${response.stats.retrieval_breakdown.graph_expanded}`);
      console.log(`      Reranked: ${response.stats.retrieval_breakdown.reranked}`);
    }

    if (response.chunks.length > 0) {
      console.log(`\n   📄 Sample Results (first 3):`);
      response.chunks.slice(0, 3).forEach((chunk, idx) => {
        console.log(`      ${idx + 1}. ${chunk.title}`);
        console.log(`         Source: ${chunk.source} | Score: ${chunk.score.toFixed(3)}`);
        console.log(`         Snippet: ${chunk.snippet.substring(0, 100)}...`);
      });
    }
  }

  printSummary(): void {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 TEST SUMMARY`);
    console.log(`${'='.repeat(80)}`);

    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;

    console.log(`\nTotal Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    // Group by category
    const categories = new Set(this.results.map((r) => r.test.category));
    console.log(`\n📂 By Category:`);
    categories.forEach((category) => {
      const categoryResults = this.results.filter((r) => r.test.category === category);
      const categoryPassed = categoryResults.filter((r) => r.passed).length;
      console.log(`   ${category}: ${categoryPassed}/${categoryResults.length} passed`);
    });

    // Performance stats
    console.log(`\n⚡ Performance:`);
    const withDuration = this.results.filter((r) => r.duration !== undefined);
    if (withDuration.length > 0) {
      const avgDuration =
        withDuration.reduce((sum, r) => sum + (r.duration || 0), 0) / withDuration.length;
      const minDuration = Math.min(...withDuration.map((r) => r.duration || Infinity));
      const maxDuration = Math.max(...withDuration.map((r) => r.duration || 0));

      console.log(`   Average: ${avgDuration.toFixed(0)}ms`);
      console.log(`   Min: ${minDuration}ms`);
      console.log(`   Max: ${maxDuration}ms`);
    }

    // Failed tests detail
    if (failed > 0) {
      console.log(`\n❌ Failed Tests:`);
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`   - ${r.test.name}: ${r.error || 'Validation failed'}`);
        });
    }

    console.log(`\n${'='.repeat(80)}`);
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Parse arguments
  let testsToRun: TestCase[] = [];

  if (args.includes('--all')) {
    testsToRun = TEST_SUITE;
  } else if (args.includes('--modes')) {
    testsToRun = TEST_SUITE.filter((t) => t.category === 'modes');
  } else if (args.includes('--formats')) {
    testsToRun = TEST_SUITE.filter((t) => t.category === 'formats');
  } else if (args.includes('--params')) {
    testsToRun = TEST_SUITE.filter((t) => t.category === 'params');
  } else if (args.includes('--filters')) {
    testsToRun = TEST_SUITE.filter((t) => t.category === 'filters');
  } else if (args.includes('--edge-cases')) {
    testsToRun = TEST_SUITE.filter((t) => t.category === 'edge-cases');
  } else if (args.includes('--performance')) {
    testsToRun = TEST_SUITE.filter((t) => t.category === 'performance');
  } else if (args.includes('--test')) {
    const testName = args[args.indexOf('--test') + 1];
    const test = TEST_SUITE.find((t) => t.name === testName);
    if (!test) {
      console.error(`❌ Test "${testName}" not found`);
      console.log(`\nAvailable tests:`);
      TEST_SUITE.forEach((t) => console.log(`  - ${t.name} (${t.category})`));
      process.exit(1);
    }
    testsToRun = [test];
  } else if (args.includes('--list')) {
    console.log(`\n📋 Available Tests:\n`);
    const categories = new Set(TEST_SUITE.map((t) => t.category));
    categories.forEach((category) => {
      console.log(`${category.toUpperCase()}:`);
      TEST_SUITE.filter((t) => t.category === category).forEach((t) => {
        console.log(`  - ${t.name}`);
      });
      console.log();
    });
    return;
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🐝 eBee Search Test Suite

Usage:
  pnpm tsx scripts/test-query.ts [options]

Options:
  --all              Run all tests
  --modes            Run query mode tests (naive, local, global, hybrid, mix)
  --formats          Run response format tests (compact, full)
  --params           Run parameter variation tests
  --filters          Run filter tests (source, date range)
  --edge-cases       Run edge case tests
  --performance      Run performance benchmark tests
  --test <name>      Run a specific test by name
  --list             List all available tests
  --help, -h         Show this help message

Environment Variables:
  PORT               Server port (default: 3000)

Examples:
  pnpm tsx scripts/test-query.ts --all
  pnpm tsx scripts/test-query.ts --modes
  pnpm tsx scripts/test-query.ts --test naive-basic
  PORT=3001 pnpm tsx scripts/test-query.ts --all
    `);
    return;
  } else {
    // Default: run mix-basic test
    const defaultTest = TEST_SUITE.find((t) => t.name === 'mix-basic');
    testsToRun = defaultTest ? [defaultTest] : [];
  }

  if (testsToRun.length === 0) {
    console.error('❌ No tests to run');
    process.exit(1);
  }

  console.log(`\n🐝 eBee Search Test Suite`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Server: http://localhost:${PORT}/mcp`);
  console.log(`Tests to run: ${testsToRun.length}`);
  console.log(`Categories: ${[...new Set(testsToRun.map((t) => t.category))].join(', ')}`);

  const runner = new TestRunner(PORT);

  try {
    console.log(`\n🔌 Connecting to eBee...`);
    await runner.connect();
    console.log(`✅ Connected!`);

    for (const test of testsToRun) {
      await runner.runTest(test);
    }

    runner.printSummary();
  } catch (error) {
    console.error('\n❌ Fatal Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await runner.disconnect();
  }
}

// Run
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
