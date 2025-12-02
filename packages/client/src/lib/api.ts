import axios, { AxiosError, AxiosResponse } from "axios";

// Error response type
interface ErrorResponseData {
  error?: string;
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 seconds
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error("[API Request Error]", error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError<ErrorResponseData>) => {
    const originalRequest = error.config as any;

    // Handle network errors
    if (!error.response) {
      console.error("[API Network Error]", error.message);
      return Promise.reject({
        message: "Network error. Please check your connection.",
        originalError: error,
      });
    }

    // Retry logic for 5xx errors (max 2 retries)
    if (
      error.response.status >= 500 &&
      originalRequest &&
      !originalRequest._retry &&
      (!originalRequest._retryCount || originalRequest._retryCount < 2)
    ) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      console.log(
        `[API Retry] Attempt ${originalRequest._retryCount} for ${originalRequest.url}`
      );

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * originalRequest._retryCount)
      );

      return api(originalRequest);
    }

    // Handle specific error codes
    const errorMessage =
      error.response.data?.error || error.response.data?.message;

    switch (error.response.status) {
      case 400:
        console.error("[API Bad Request]", errorMessage);
        break;
      case 401:
        console.error("[API Unauthorized]", errorMessage);
        break;
      case 403:
        console.error("[API Forbidden]", errorMessage);
        break;
      case 404:
        console.error("[API Not Found]", errorMessage);
        break;
      case 429:
        console.error("[API Rate Limit]", errorMessage);
        break;
      default:
        console.error(
          `[API Error ${error.response.status}]`,
          errorMessage || "Unknown error"
        );
    }

    return Promise.reject(error);
  }
);

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

// Graph Data Types
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  title: string;
}

export interface GraphRelationship {
  sourceId: string;
  targetId: string;
  type: string;
  confidence: number;
  extractedBy: "explicit" | "llm" | "heuristic";
}

export interface GraphDataResponse {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  stats: {
    totalNodes: number;
    totalRelationships: number;
    hasMore: boolean;
  };
}

// Graph Data API
export const graphApi = {
  getData: (params?: {
    limit?: number;
    offset?: number;
    nodeTypes?: string[];
    relationshipTypes?: string[];
  }) =>
    api.get<ApiResponse<GraphDataResponse>>("/graph/data", {
      params: params
        ? {
            ...params,
            nodeTypes: params.nodeTypes?.join(","),
            relationshipTypes: params.relationshipTypes?.join(","),
          }
        : undefined,
    }),
};

// MCP Servers API
export interface MCPServerConfig {
  _id: string;
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
  sync: (configId: string) =>
    api.post<ApiResponse<void>>(`/sync`, { configId }),
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
