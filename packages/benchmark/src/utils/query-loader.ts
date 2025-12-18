/**
 * Query Loader - Load and filter generated queries
 * Loads queries from generated-queries.json and converts to MatrixScenario format
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type {
  GeneratedWorkflow,
  GeneratedTestCase,
  MatrixScenario,
  QuerySource,
} from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load generated queries from JSON file
 */
export function loadGeneratedQueries(filePath: string): GeneratedWorkflow[] {
  const resolvedPath = path.resolve(__dirname, filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Generated queries file not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  return JSON.parse(content) as GeneratedWorkflow[];
}

/**
 * Convert generated test case to matrix scenario
 */
function testCaseToScenario(
  testCase: GeneratedTestCase,
  workflowId: string,
  index: number
): MatrixScenario {
  return {
    id: `${workflowId}-${index}`,
    query: testCase.query,
    category: "entity_focused", // Default category for generated queries
    targetServers: ["fathom", "slack", "notion", "github"], // All servers
    evaluationCriteria: {
      mustInclude: [...testCase.evaluationCriteria.mustInclude],
    },
  };
}

/**
 * Load scenarios from query source configuration
 */
export function loadScenarios(
  queriesSource: QuerySource,
  hardcodedScenarios?: readonly MatrixScenario[]
): MatrixScenario[] {
  if (queriesSource.type === "hardcoded") {
    if (!hardcodedScenarios || hardcodedScenarios.length === 0) {
      throw new Error(
        "Hardcoded query source specified but no scenarios provided in config"
      );
    }
    return [...hardcodedScenarios];
  }

  // Load generated queries
  const workflows = loadGeneratedQueries(queriesSource.file);
  const skipWorkflows = new Set(queriesSource.skipWorkflows || []);

  // Filter out skipped workflows
  const filteredWorkflows = workflows.filter(
    (w) => !skipWorkflows.has(w.workflow.groupId)
  );

  if (filteredWorkflows.length === 0) {
    console.warn("⚠️  All workflows are skipped. No test cases to run.");
    return [];
  }

  // Convert to scenarios
  const scenarios: MatrixScenario[] = [];

  for (const workflow of filteredWorkflows) {
    workflow.testCases.forEach((testCase, index) => {
      scenarios.push(
        testCaseToScenario(testCase, workflow.workflow.groupId, index)
      );
    });
  }

  console.log(
    `\n📋 Loaded ${scenarios.length} test cases from generated queries`
  );
  console.log(`   Workflows included: ${filteredWorkflows.length}`);
  if (skipWorkflows.size > 0) {
    console.log(`   Workflows skipped: ${skipWorkflows.size}`);
  }

  return scenarios;
}

/**
 * Get scenario IDs by workflow
 */
export function groupScenariosByWorkflow(
  scenarios: readonly MatrixScenario[]
): Map<string, MatrixScenario[]> {
  const grouped = new Map<string, MatrixScenario[]>();

  for (const scenario of scenarios) {
    const workflowId = scenario.id.split("-").slice(0, -1).join("-");
    if (!grouped.has(workflowId)) {
      grouped.set(workflowId, []);
    }
    grouped.get(workflowId)!.push(scenario);
  }

  return grouped;
}
