import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PersonaData {
  persona: string;
  updatedAt: string;
}

export interface SchemaData {
  version: number;
  entityTypes: Array<{
    name: string;
    description: string;
    mcpSource?: string;
    properties: string[];
  }>;
  relationshipTypes: Array<{
    name: string;
    description: string;
    sourceTypes: string[];
    targetTypes: string[];
    bidirectional: boolean;
    mcpSource?: string;
  }>;
  extractionRules: {
    autoExtractEntities: boolean;
    autoExtractRelationships: boolean;
    confidenceThreshold: number;
  };
  lastLearnedAt?: string;
  learnedFromSampleSize?: number;
  persona?: string;
}

// Persona API
export const personaApi = {
  get: () => api.get<ApiResponse<PersonaData>>("/schema/persona"),
  update: (persona: string) =>
    api.put<ApiResponse<PersonaData>>("/schema/persona", { persona }),
  delete: () => api.delete<ApiResponse<void>>("/schema/persona"),
};

// Schema API
export const schemaApi = {
  get: () => api.get<ApiResponse<SchemaData>>("/schema"),
};

// MCP Servers API
export interface MCPServerConfig {
  name: string;
  type: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  isDisabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const mcpServersApi = {
  list: () => api.get<ApiResponse<MCPServerConfig[]>>("/mcp-servers"),
  get: (name: string) =>
    api.get<ApiResponse<MCPServerConfig>>(
      `/mcp-servers/${encodeURIComponent(name)}`
    ),
  create: (config: Omit<MCPServerConfig, "createdAt" | "updatedAt">) =>
    api.post<ApiResponse<MCPServerConfig>>("/mcp-servers", config),
  update: (name: string, config: Partial<MCPServerConfig>) =>
    api.put<ApiResponse<MCPServerConfig>>(
      `/mcp-servers/${encodeURIComponent(name)}`,
      config
    ),
  delete: (name: string) =>
    api.delete<ApiResponse<void>>(`/mcp-servers/${encodeURIComponent(name)}`),
  connect: (name: string) =>
    api.post<ApiResponse<void>>(
      `/mcp-servers/${encodeURIComponent(name)}/connect`
    ),
  disconnect: (name: string) =>
    api.post<ApiResponse<void>>(
      `/mcp-servers/${encodeURIComponent(name)}/disconnect`
    ),
  status: (name: string) =>
    api.get<ApiResponse<{ name: string; connected: boolean }>>(
      `/mcp-servers/${encodeURIComponent(name)}/status`
    ),
};

// Statistics API Types
export interface OverviewStats {
  totalRecords: number;
  totalVectors: number;
  totalGraphNodes: number;
  totalGraphRelationships: number;
  mcpServers: {
    total: number;
    connected: number;
    disconnected: number;
  };
  bySource: {
    [source: string]: {
      records: number;
      lastSync?: string;
    };
  };
}

export interface RecordStats {
  total: number;
  bySource: { [source: string]: number };
  byType: { [type: string]: number };
  recentlyUpdated: number;
  deleted: number;
}

export interface VectorStats {
  collectionName: string;
  totalPoints: number;
  indexedPoints: number;
  dimensions: number;
  model: string;
}

export interface GraphStats {
  totalNodes: number;
  totalRelationships: number;
  nodesByLabel: { [label: string]: number };
  relationshipsByType: { [type: string]: number };
}

// Statistics API
export const statsApi = {
  overview: () => api.get<ApiResponse<OverviewStats>>("/stats/overview"),
  records: () => api.get<ApiResponse<RecordStats>>("/stats/records"),
  vectors: () => api.get<ApiResponse<VectorStats>>("/stats/vectors"),
  graph: () => api.get<ApiResponse<GraphStats>>("/stats/graph"),
};

// Model Configuration API Types
export interface ModelConfigData {
  llmProvider: "openai" | "openrouter" | "azure" | "anthropic";
  llmApiKey?: string;
  llmBaseURL?: string;
  llmChatModel: string;
  llmEmbeddingModel: string;
  rerankerEnabled: boolean;
  rerankerApiKey?: string;
  rerankerBaseURL?: string;
  rerankerModel?: string;
  updatedAt?: string;
}

export interface TestConnectionRequest {
  llmProvider: string;
  llmApiKey: string;
  llmBaseURL?: string;
  llmChatModel: string;
}

export interface TestConnectionResponse {
  response: string;
  model: string;
  provider: string;
}

// Model Configuration API
export const modelConfigApi = {
  get: () => api.get<ApiResponse<ModelConfigData>>("/config/models"),
  update: (config: Partial<ModelConfigData>) =>
    api.put<ApiResponse<ModelConfigData>>("/config/models", config),
  test: (testConfig: TestConnectionRequest) =>
    api.post<ApiResponse<TestConnectionResponse>>(
      "/config/models/test",
      testConfig
    ),
};
