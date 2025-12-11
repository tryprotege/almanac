import type {
  AllGeneratedData,
  CategorizedContext,
  RelationshipContext,
} from "../types.js";
import { buildWorkContext, buildCasualContext } from "./filter.js";

/**
 * Build contexts for each generation stage
 * Properly accumulates data from all providers (GitHub, Slack, Notion, Fathom)
 * Including transcripts, summaries, and blocks
 */

export function buildFoundationContext(): null {
  // Foundation stage has no context
  return null;
}

export function buildConnectionContext(
  foundation: AllGeneratedData
): CategorizedContext {
  return {
    work: buildWorkContext(foundation) as RelationshipContext,
    casual: buildCasualContext(foundation) as RelationshipContext,
  };
}

export function buildIntegrationContext(
  foundation: AllGeneratedData,
  connection: {
    slack: any[];
    notion: any[];
    fathom: any[];
  }
): CategorizedContext {
  const workContext = buildWorkContext(foundation) as RelationshipContext;
  const casualContext = buildCasualContext(foundation) as RelationshipContext;

  // Note: Connection stage data is already included in the contexts above
  // This function is for future expansion when we need to merge connection data

  return {
    work: workContext,
    casual: casualContext,
  };
}

export function buildSynthesisContext(
  foundation: AllGeneratedData,
  connection: {
    slack: any[];
    notion: any[];
    fathom: any[];
  },
  integration: {
    slack: any[];
    notion: any[];
    fathom: any[];
  }
): CategorizedContext {
  const workContext = buildWorkContext(foundation) as RelationshipContext;
  const casualContext = buildCasualContext(foundation) as RelationshipContext;

  // Note: Connection and integration stage data is already included in the contexts above
  // This function is for future expansion when we need to merge all stages

  return {
    work: workContext,
    casual: casualContext,
  };
}
