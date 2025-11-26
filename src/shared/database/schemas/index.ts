/**
 * Database Schema Definitions
 * Simplified single-tenant architecture without workspaces
 */

export const MONGODB_SCHEMAS = {
  // Main content storage (renamed from resources)
  documents: {
    collectionName: "documents",
    indexes: [
      { key: { _id: 1 }, unique: true },
      { key: { source: 1, type: 1 } },
      { key: { type: 1 } },
      { key: { indexedAt: -1 } },
      { key: { "metadata.tags": 1 } },
      { key: { "content.text": "text" } }, // Full text search
    ],
  },

  // Graph extraction configuration
  graph_schema: {
    collectionName: "graph_schema",
    indexes: [{ key: { _id: 1 }, unique: true }],
  },

  // MCP server configurations
  mcp_server_configs: {
    collectionName: "mcp_server_configs",
    indexes: [{ key: { name: 1 }, unique: true }, { key: { type: 1 } }],
  },

  // Embedding model metadata
  embedding_metadata: {
    collectionName: "embedding_metadata",
    indexes: [
      { key: { _id: 1 }, unique: true }, // Collection name
      { key: { active: 1 } }, // Which collection is active
      { key: { model: 1 } },
    ],
  },
} as const;

export const QDRANT_SCHEMAS = {
  // Collection naming pattern: embeddings_<model>_<dimensions>
  getCollectionName: (model: string, dimensions: number): string => {
    const cleanModel = model.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    return `embeddings_${cleanModel}_${dimensions}`;
  },

  // Model dimension mappings
  MODEL_DIMENSIONS: {
    "qwen/qwen-3-embedding-0.6b": 1024,
    "text-embedding-ada-002": 1536,
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "all-minilm-l6-v2": 384,
  } as Record<string, number>,

  defaultConfig: {
    distance: "Cosine" as const,
    onDiskPayload: true,
  },
} as const;

export const MEMGRAPH_SCHEMAS = {
  // Node constraints
  constraints: ["CREATE CONSTRAINT ON (n:Resource) ASSERT n.id IS UNIQUE"],

  // Indexes for efficient queries
  indexes: [
    "CREATE INDEX ON :Resource(id)",
    "CREATE INDEX ON :Resource(type)",
    "CREATE INDEX ON :Resource(source)",
  ],
} as const;
