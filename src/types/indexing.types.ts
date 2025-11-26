/**
 * Indexing Types
 * Consolidated from contracts - single-tenant (no workspace)
 */

import type { SourceType } from "./index.js";

export interface MCPToolResult {
  content: Array<{
    type: "text" | "resource";
    text?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    };
  }>;
  isError?: boolean;
}

export interface IndexRequest {
  source: {
    type: SourceType;
    serverId: string;
  };

  toolCall: {
    name: string;
    arguments: Record<string, any>;
  };

  toolResult: MCPToolResult;

  options?: {
    priority?: "high" | "normal" | "low";
  };
}
