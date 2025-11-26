/**
 * Indexing Types
 * Consolidated from contracts - single-tenant (no workspace)
 */

import type { SourceType } from "./index.js";

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

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

export interface IndexResponse {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  stats?: {
    resourcesProcessed: number;
    resourcesIndexed: number;
    resourcesFailed: number;
    durationMs: number;
  };
  error?: string;
}

export interface MCPServerRegistration {
  serverId: string;
  serverType: SourceType;
  serverName: string;
  tools: MCPToolDefinition[];
  connection: {
    connectedAt: string;
    connectedBy: string;
    status: "active" | "disconnected" | "error";
  };
}

// Service Interfaces
export interface IndexingQueue {
  add(request: IndexRequest): Promise<{ jobId: string }>;
  getStatus(jobId: string): Promise<IndexResponse>;
}

export interface MCPRegistry {
  register(registration: MCPServerRegistration): Promise<void>;
  unregister(serverId: string): Promise<void>;
  list(): Promise<MCPServerRegistration[]>;
}
