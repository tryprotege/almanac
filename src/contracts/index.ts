// contracts/index.ts

// ============================================
// Types
// ============================================

export type SourceType =
  | "notion"
  | "slack"
  | "calendar"
  | "fathom"
  | "whatsapp"
  | "codebase";

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

// ============================================
// CONTRACT 1: Indexing (B → A)
// ============================================

export interface IndexRequest {
  workspaceId: string;

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

// ============================================
// CONTRACT 2: Search Tool (A exposes)
// ============================================

export const SMART_SEARCH_TOOL: MCPToolDefinition = {
  name: "smart_search",
  description:
    "Search across all connected sources (Notion, Slack, Calendar, Fathom, etc.) using natural language. Returns semantically relevant results.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language search query",
      },
      sources: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "notion",
            "slack",
            "calendar",
            "fathom",
            "whatsapp",
            "codebase",
          ],
        },
        description: "Filter results to specific sources",
      },
      types: {
        type: "array",
        items: { type: "string" },
        description:
          "Filter by resource type (page, message, event, call, file)",
      },
      dateRange: {
        type: "object",
        properties: {
          start: { type: "string", description: "ISO date string" },
          end: { type: "string", description: "ISO date string" },
        },
      },
      limit: {
        type: "number",
        description: "Maximum results (default: 20)",
      },
    },
    required: ["query"],
  },
};

export interface SearchResult {
  id: string;
  externalId: string;
  source: SourceType;
  type: string;

  title: string;
  snippet: string;
  url?: string;

  score: number;
  date?: string;
  attributes: Record<string, any>;
}

export interface SearchResponse {
  results: SearchResult[];
  meta: {
    total: number;
    latencyMs: number;
  };
}

// ============================================
// CONTRACT 3: MCP Server Registration (B → A)
// ============================================

export interface MCPServerRegistration {
  workspaceId: string;
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

// ============================================
// Interfaces (How B calls A)
// ============================================

export interface IndexingQueue {
  add(request: IndexRequest): Promise<{ jobId: string }>;
  getStatus(jobId: string): Promise<IndexResponse>;
}

export interface MCPRegistry {
  register(registration: MCPServerRegistration): Promise<void>;
  unregister(workspaceId: string, serverId: string): Promise<void>;
  list(workspaceId: string): Promise<MCPServerRegistration[]>;
}

export interface SearchService {
  search(
    workspaceId: string,
    args: {
      query: string;
      sources?: SourceType[];
      types?: string[];
      dateRange?: { start: string; end: string };
      limit?: number;
    }
  ): Promise<SearchResponse>;
}
