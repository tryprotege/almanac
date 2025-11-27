import * as schemaStore from "../../stores/graph-schema.store.js";

/**
 * Determine if schema learning should be triggered
 * Used for hybrid schema update strategy
 */
export async function shouldRunSchemaLearning(): Promise<{
  shouldRun: boolean;
  reason: string;
}> {
  const schema = await schemaStore.getSchema();

  // No schema exists
  if (!schema) {
    return { shouldRun: true, reason: "no_schema" };
  }

  // Schema never learned from AI
  if (!schema.lastLearnedAt) {
    return { shouldRun: true, reason: "never_learned" };
  }

  // More than 7 days since last learning
  const daysSinceLastLearning =
    (Date.now() - schema.lastLearnedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLastLearning > 7) {
    return { shouldRun: true, reason: "stale_schema" };
  }

  return { shouldRun: false, reason: "recent" };
}
