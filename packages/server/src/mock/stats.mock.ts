export const mockOverviewStats = {
  totalRecords: 1247,
  totalVectors: 1189,
  totalGraphNodes: 856,
  totalGraphRelationships: 2341,
  mcpServers: {
    total: 3,
    connected: 2,
    disconnected: 1,
  },
  bySource: {
    notion: {
      records: 524,
      lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    },
    slack: {
      records: 398,
      lastSync: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    },
    calendar: {
      records: 325,
      lastSync: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    },
  },
};

export const mockRecordStats = {
  total: 1247,
  bySource: {
    notion: 524,
    slack: 398,
    calendar: 325,
  },
  byType: {
    "notion:page": 312,
    "notion:database": 212,
    "slack:message": 398,
    "calendar:event": 325,
  },
  recentlyUpdated: 47,
  deleted: 12,
};

export const mockVectorStats = {
  collectionName: "ebee_embeddings",
  totalPoints: 1189,
  indexedPoints: 1189,
  dimensions: 2560,
  model: "qwen/qwen-3-embedding-0.6b",
};

export const mockGraphStats = {
  totalNodes: 856,
  totalRelationships: 2341,
  nodesByLabel: {
    Person: 124,
    Project: 89,
    Task: 234,
    Document: 187,
    Meeting: 98,
    Feature: 67,
    Bug: 57,
  },
  relationshipsByType: {
    ASSIGNED_TO: 456,
    MENTIONS: 678,
    PART_OF: 389,
    DEPENDS_ON: 234,
    BLOCKS: 156,
    RELATED_TO: 428,
  },
};
