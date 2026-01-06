/**
 * Sandbox execution environment for user code and processors
 */

import { JSONPath } from "jsonpath-plus";
import type {
  SandboxContext,
  SandboxHelpers,
} from "../types/format-processors.js";
import { formatProcessors } from "./format-processors.js";

/**
 * Create sandbox helpers
 */
function createHelpers(source: string): SandboxHelpers {
  return {
    jsonPath: (obj: any, path: string) => {
      const result = JSONPath({ path, json: obj });
      return Array.isArray(result) ? result[0] : result;
    },

    extractRichText: (richText: any[]) => {
      if (!Array.isArray(richText)) return "";
      return richText
        .map((rt) => rt.text?.content || rt.plain_text || "")
        .join("");
    },

    formatDate: (date: string | Date) => {
      if (!date) return null;
      try {
        const d = new Date(date);
        return isNaN(d.getTime()) ? null : d;
      } catch {
        return null;
      }
    },

    generateId: (type: string, sourceId: string, sourceOverride?: string) => {
      return `${sourceOverride || source}_${type}_${sourceId}`;
    },
  };
}

/**
 * Execute user code in sandbox
 */
export async function executeSandboxCode(
  code: string,
  context: Omit<SandboxContext, "helpers" | "fetch" | "require">,
  source: string
): Promise<any> {
  const helpers = createHelpers(source);

  // Create full context
  const fullContext: SandboxContext = {
    ...context,
    helpers,
    fetch: globalThis.fetch,
    require: (module: string) => {
      // Only allow specific safe modules
      const allowedModules = ["crypto", "url", "querystring"];
      if (allowedModules.includes(module)) {
        return require(module);
      }
      throw new Error(`Module ${module} is not allowed in sandbox`);
    },
  };

  // Create async function with context variables
  const fn = new Function(
    "record",
    "enrichments",
    "helpers",
    "fetch",
    "require",
    `return (async () => { ${code} })()`
  );

  try {
    return await fn(
      fullContext.record,
      fullContext.enrichments,
      fullContext.helpers,
      fullContext.fetch,
      fullContext.require
    );
  } catch (error) {
    throw new Error(
      `Sandbox execution failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Execute format processor
 */
export async function executeProcessor(
  processorName: string,
  input: any,
  options?: any
): Promise<any> {
  const processor = formatProcessors[processorName];
  if (!processor) {
    throw new Error(`Unknown format processor: ${processorName}`);
  }

  try {
    return await processor.process(input, options);
  } catch (error) {
    throw new Error(
      `Processor '${processorName}' failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
