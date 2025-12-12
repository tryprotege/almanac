/**
 * Global type declarations
 */

declare const console: {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  debug: (...args: any[]) => void;
};

declare const process: {
  argv: string[];
  exit: (code: number) => never;
  cwd: () => string;
  env: Record<string, string | undefined>;
};

declare const fetch: (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  statusText: string;
  json: () => Promise<any>;
}>;

declare const AbortSignal: {
  timeout: (ms: number) => AbortSignal;
};

declare module "fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean }
  ): void;
}

declare module "yaml" {
  export function parse(str: string): any;
  export function stringify(obj: any): string;
}

declare module "crypto" {
  export function randomUUID(): string;
}
