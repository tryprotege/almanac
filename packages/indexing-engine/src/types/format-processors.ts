/**
 * Format processor types and interfaces
 */

/**
 * FormatProcessor - Handles specialized data transformations
 */
export interface FormatProcessor {
  name: string;
  description: string;
  process: (input: any, options?: any) => Promise<any>;
}

/**
 * SandboxContext - Context available to code/processors
 */
export interface SandboxContext {
  record: any;
  enrichments: Record<string, any>;

  // Helper functions
  helpers: SandboxHelpers;

  // Full access (as requested)
  fetch: (input: string | any, init?: any) => Promise<any>;
  require: (module: string) => any;
}

export interface SandboxHelpers {
  jsonPath: (obj: any, path: string) => any;
  extractRichText: (richText: any[]) => string;
  formatDate: (date: string | Date) => Date | null;
  generateId: (type: string, sourceId: string, source: string) => string;
}
