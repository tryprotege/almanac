# eBee Dashboard UI Architecture Plan

## 📋 Overview

This document outlines the UI architecture for the eBee dashboard, focusing on the first priority: **Update Persona of the user**. The dashboard will provide a comprehensive interface for managing MCP servers, monitoring data indexing, and configuring the system.

---

## 🏗️ Current Server Architecture

### Data Stores

- **MongoDB**: Records, MCP configs, Graph schemas
- **Qdrant**: Vector embeddings for semantic search
- **Memgraph**: Knowledge graph with entities and relationships
- **Redis**: Caching layer

### Existing API Endpoints

```
GET    /health
GET    /api/mcp-servers
POST   /api/mcp-servers
GET    /api/mcp-servers/:name
PUT    /api/mcp-servers/:name
DELETE /api/mcp-servers/:name
POST   /api/mcp-servers/:name/connect
POST   /api/mcp-servers/:name/disconnect
GET    /api/mcp-servers/:name/status
POST   /mcp (JSON-RPC endpoint)
```

### Missing API Endpoints (Need to Create)

```
GET    /api/stats/overview
GET    /api/stats/records
GET    /api/stats/vectors
GET    /api/stats/graph
GET    /api/schema/persona
PUT    /api/schema/persona
DELETE /api/schema/persona
GET    /api/schema
GET    /api/sync/status
POST   /api/sync/start
GET    /api/indexing/status
POST   /api/indexing/start
```

---

## 🎯 Priority 1: Persona Management UI

### Component: PersonaEditor

**Purpose**: Allow users to define their persona/context for AI-powered schema learning and entity extraction.

**Location**: Settings page or dedicated Persona tab

**UI Design**:

```
┌─────────────────────────────────────────────────────────┐
│ 👤 User Persona                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Define your role and context to help eBee understand   │
│ your data better. This persona guides AI-powered       │
│ schema learning and entity extraction.                  │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ I am a [product manager] working on [SaaS products] │ │
│ │ at [TechCorp]. I collaborate with [engineering and  │ │
│ │ design teams] and track [feature requests, bugs,    │ │
│ │ and customer feedback] across [Notion, Slack, and   │ │
│ │ Jira].                                              │ │
│ │                                                     │ │
│ │ Key entities I care about:                         │ │
│ │ - Features, Bugs, Customers                        │ │
│ │ - Team members, Projects                           │ │
│ │                                                     │ │
│ │ [Character count: 245/1000]                        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ 💡 Tips:                                                │
│ • Describe your role and responsibilities              │
│ • Mention key entities and relationships you track     │
│ • Include tools and workflows you use                  │
│                                                         │
│ [Clear]  [Save Persona]                                │
│                                                         │
│ Last updated: 2 hours ago                              │
└─────────────────────────────────────────────────────────┘
```

**Features**:

- Multi-line textarea with character counter (max 1000 chars)
- Real-time save with debouncing
- Clear button with confirmation
- Last updated timestamp
- Helpful tips and examples
- Success/error toast notifications

**API Integration**:

```typescript
// GET /api/schema/persona
interface PersonaResponse {
  success: boolean;
  data: {
    persona: string;
    updatedAt: string;
  };
}

// PUT /api/schema/persona
interface UpdatePersonaRequest {
  persona: string;
}

// DELETE /api/schema/persona
interface DeletePersonaResponse {
  success: boolean;
  message: string;
}
```

**React Component Structure**:

```typescript
interface PersonaEditorProps {
  onSave?: (persona: string) => void;
}

const PersonaEditor: React.FC<PersonaEditorProps> = ({ onSave }) => {
  const [persona, setPersona] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load persona on mount
  // Auto-save with debouncing
  // Handle clear with confirmation

  return (/* UI */);
};
```

---

## 📊 Dashboard Layout

### Main Navigation

```
┌─────────────────────────────────────────────────────────┐
│ 🐝 eBee                                    [User] [⚙️]  │
├─────────────────────────────────────────────────────────┤
│ [📊 Dashboard] [🔌 Connections] [⚙️ Settings] [📈 Stats]│
└─────────────────────────────────────────────────────────┘
```

### Dashboard Page (Overview)

```
┌─────────────────────────────────────────────────────────┐
│ 📊 Dashboard                                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│ │ 📄 Records   │ │ 🔍 Vectors   │ │ 🕸️ Graph     │    │
│ │              │ │              │ │              │    │
│ │   12,450     │ │   45,230     │ │   8,920      │    │
│ │   documents  │ │   embeddings │ │   nodes      │    │
│ │              │ │              │ │   15,340 rels│    │
│ └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🔌 Connected Services                               │ │
│ │                                                     │ │
│ │ ✅ Notion      [Synced 5m ago]  [View] [Sync Now]  │ │
│ │ ✅ Slack       [Synced 10m ago] [View] [Sync Now]  │ │
│ │ ⚠️  Fathom     [Not connected]  [Connect]          │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📈 Recent Activity                                  │ │
│ │                                                     │ │
│ │ • Indexed 234 new records from Notion               │ │
│ │ • Schema learning completed (v3)                    │ │
│ │ • Added 12 new entity types                         │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Connections Page (MCP Servers)

```
┌─────────────────────────────────────────────────────────┐
│ 🔌 MCP Server Connections              [+ Add Server]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📝 Notion                                    [Edit] │ │
│ │ Status: ✅ Connected                                │ │
│ │ Type: stdio                                         │ │
│ │ Last sync: 5 minutes ago                            │ │
│ │ Records: 8,450                                      │ │
│ │                                                     │ │
│ │ [Disconnect] [Sync Now] [View Credentials]         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 💬 Slack                                     [Edit] │ │
│ │ Status: ✅ Connected                                │ │
│ │ Type: stdio                                         │ │
│ │ Last sync: 10 minutes ago                           │ │
│ │ Records: 3,200                                      │ │
│ │                                                     │ │
│ │ [Disconnect] [Sync Now] [View Credentials]         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📊 Fathom                                    [Edit] │ │
│ │ Status: ⚠️ Not Connected                            │ │
│ │ Type: sse                                           │ │
│ │                                                     │ │
│ │ [Connect] [Configure]                               │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Add/Edit MCP Server Modal

```
┌─────────────────────────────────────────────────────────┐
│ Add MCP Server                                    [✕]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Server Name *                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ notion                                              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Connection Type *                                       │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ◉ stdio    ○ sse                                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Command (for stdio) *                                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ npx                                                 │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Arguments                                               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ -y @modelcontextprotocol/server-notion              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Environment Variables                                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Key                    Value                        │ │
│ │ NOTION_API_KEY        [••••••••••••]    [Show]     │ │
│ │                       [+ Add Variable]              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ URL (for sse)                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ https://api.example.com/mcp                         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [Test Connection]                    [Cancel] [Save]    │
└─────────────────────────────────────────────────────────┘
```

---

## 📈 Statistics & Monitoring

### Stats Page

```
┌─────────────────────────────────────────────────────────┐
│ 📈 Statistics & Monitoring                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📊 Data Overview                                    │ │
│ │                                                     │ │
│ │ Total Records:        12,450                        │ │
│ │ Vector Embeddings:    45,230                        │ │
│ │ Graph Nodes:          8,920                         │ │
│ │ Graph Relationships:  15,340                        │ │
│ │                                                     │ │
│ │ By Source:                                          │ │
│ │ • Notion:  8,450 records                            │ │
│ │ • Slack:   3,200 records                            │ │
│ │ • Fathom:  800 records                              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🧠 Schema Information                               │ │
│ │                                                     │ │
│ │ Version: 3                                          │ │
│ │ Entity Types: 24                                    │ │
│ │ Relationship Types: 18                              │ │
│ │ Last Learning: 2 hours ago                          │ │
│ │ Sample Size: 100 records                            │ │
│ │                                                     │ │
│ │ [View Schema] [Trigger Learning]                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🔄 Sync Status                                      │ │
│ │                                                     │ │
│ │ Last Sync: 5 minutes ago                            │ │
│ │ Status: ✅ Completed                                │ │
│ │                                                     │ │
│ │ Progress:                                           │ │
│ │ [████████████████████████████] 100%                 │ │
│ │                                                     │ │
│ │ [Sync All Now]                                      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ⚡ Indexing Status                                  │ │
│ │                                                     │ │
│ │ Last Indexing: 10 minutes ago                       │ │
│ │ Status: ✅ Completed                                │ │
│ │                                                     │ │
│ │ Progress:                                           │ │
│ │ • MongoDB:   [████████████] 100%                    │ │
│ │ • Qdrant:    [████████████] 100%                    │ │
│ │ • Memgraph:  [████████████] 100%                    │ │
│ │                                                     │ │
│ │ [Index All Now]                                     │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## ⚙️ Settings Page

### Settings Tabs

```
┌─────────────────────────────────────────────────────────┐
│ ⚙️ Settings                                             │
├─────────────────────────────────────────────────────────┤
│ [👤 Persona] [🤖 Models] [🔧 Advanced]                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ (Persona tab content - see PersonaEditor above)        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Models Tab

```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Model Configuration                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Entity Extraction Model                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Provider: [OpenAI ▼]                                │ │
│ │ Model: [gpt-4o ▼]                                   │ │
│ │ API Key: [••••••••••••] [Show]                      │ │
│ │ Base URL: [https://api.openai.com/v1]              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Embedding Model                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Provider: [OpenAI ▼]                                │ │
│ │ Model: [text-embedding-3-small ▼]                   │ │
│ │ Dimensions: [1536]                                  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [Test Connection]                    [Cancel] [Save]    │
└─────────────────────────────────────────────────────────┘
```

---

## 🕸️ Graph Schema Visualization

### Schema Viewer Component

```
┌─────────────────────────────────────────────────────────┐
│ 🕸️ Graph Schema                          [Export] [Edit]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │                                                     │ │
│ │         [Person]                                    │ │
│ │            │                                        │ │
│ │            │ WORKS_ON                               │ │
│ │            ↓                                        │ │
│ │         [Project] ←──CONTAINS──── [Task]           │ │
│ │            │                         │              │ │
│ │            │ RELATED_TO              │ ASSIGNED_TO  │ │
│ │            ↓                         ↓              │ │
│ │         [Document]                [Person]          │ │
│ │                                                     │ │
│ │ [Interactive D3.js or React Flow visualization]    │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Entity Types (24)                                       │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ • Person (from: notion, slack)                      │ │
│ │ • Project (from: notion)                            │ │
│ │ • Task (from: notion)                               │ │
│ │ • Document (from: notion)                           │ │
│ │ • Message (from: slack)                             │ │
│ │ ... [Show all]                                      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Relationship Types (18)                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ • WORKS_ON: Person → Project                        │ │
│ │ • CONTAINS: Project → Task                          │ │
│ │ • ASSIGNED_TO: Task → Person                        │ │
│ │ • RELATED_TO: Project → Document                    │ │
│ │ ... [Show all]                                      │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 Sync & Indexing Progress

### Real-time Progress Component

```
┌─────────────────────────────────────────────────────────┐
│ 🔄 Data Synchronization                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Status: In Progress                                     │
│                                                         │
│ Notion                                                  │
│ [████████████████░░░░] 80% (8,000/10,000 records)      │
│                                                         │
│ Slack                                                   │
│ [████████████████████] 100% (3,200/3,200 records)      │
│                                                         │
│ Fathom                                                  │
│ [░░░░░░░░░░░░░░░░░░░░] 0% (Waiting...)                 │
│                                                         │
│ Overall Progress: 75%                                   │
│ Estimated time remaining: 2 minutes                     │
│                                                         │
│ [Pause] [Cancel]                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ⚡ Indexing Progress                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ MongoDB (Document Store)                                │
│ [████████████████████] 100% (12,450 records)           │
│                                                         │
│ Qdrant (Vector Store)                                   │
│ [████████████████░░░░] 85% (38,445/45,230 embeddings)  │
│                                                         │
│ Memgraph (Graph Store)                                  │
│ [██████████░░░░░░░░░░] 50% (4,460/8,920 nodes)         │
│                                                         │
│ Overall Progress: 78%                                   │
│ Estimated time remaining: 5 minutes                     │
│                                                         │
│ [Pause] [Cancel]                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ Required API Endpoints (To Be Created)

### 1. Statistics Endpoints

```typescript
// GET /api/stats/overview
interface StatsOverview {
  success: boolean;
  data: {
    totalRecords: number;
    totalVectors: number;
    totalGraphNodes: number;
    totalGraphRelationships: number;
    bySource: {
      [source: string]: {
        records: number;
        lastSync: string;
      };
    };
  };
}

// GET /api/stats/records
interface RecordStats {
  success: boolean;
  data: {
    total: number;
    bySource: { [source: string]: number };
    byType: { [type: string]: number };
    recentlyUpdated: number;
    deleted: number;
  };
}

// GET /api/stats/vectors
interface VectorStats {
  success: boolean;
  data: {
    totalPoints: number;
    collectionName: string;
    dimensions: number;
    model: string;
  };
}

// GET /api/stats/graph
interface GraphStats {
  success: boolean;
  data: {
    totalNodes: number;
    totalRelationships: number;
    nodesByType: { [type: string]: number };
    relationshipsByType: { [type: string]: number };
  };
}
```

### 2. Schema Endpoints

```typescript
// GET /api/schema
interface SchemaResponse {
  success: boolean;
  data: {
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
  };
}

// GET /api/schema/persona
interface PersonaResponse {
  success: boolean;
  data: {
    persona: string;
    updatedAt: string;
  };
}

// PUT /api/schema/persona
interface UpdatePersonaRequest {
  persona: string;
}

// DELETE /api/schema/persona
interface DeletePersonaResponse {
  success: boolean;
  message: string;
}
```

### 3. Sync & Indexing Endpoints

```typescript
// GET /api/sync/status
interface SyncStatus {
  success: boolean;
  data: {
    isRunning: boolean;
    lastSync?: string;
    progress?: {
      [source: string]: {
        total: number;
        processed: number;
        percentage: number;
      };
    };
  };
}

// POST /api/sync/start
interface StartSyncRequest {
  sources?: string[]; // If empty, sync all
}

// GET /api/indexing/status
interface IndexingStatus {
  success: boolean;
  data: {
    isRunning: boolean;
    lastIndexing?: string;
    progress?: {
      mongodb: { total: number; processed: number; percentage: number };
      qdrant: { total: number; processed: number; percentage: number };
      memgraph: { total: number; processed: number; percentage: number };
    };
  };
}

// POST /api/indexing/start
interface StartIndexingRequest {
  sources?: string[];
}
```

---

## 🎨 UI Component Library

### Recommended Stack

- **Framework**: React 18+ with TypeScript
- **Styling**: Tailwind CSS or shadcn/ui
- **State Management**: React Query (TanStack Query) for server state
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts or Chart.js
- **Graph Visualization**: React Flow or D3.js
- **Icons**: Lucide React or Heroicons
- **Notifications**: React Hot Toast or Sonner

### Key Components to Build

1. **PersonaEditor** - Multi-line text editor with auto-save
2. **MCPServerCard** - Display MCP server status and actions
3. **MCPServerForm** - Add/edit MCP server configuration
4. **StatsCard** - Display statistics with icons
5. **ProgressBar** - Show sync/indexing progress
6. **SchemaVisualization** - Interactive graph visualization
7. **DataTable** - Display records with sorting/filtering
8. **StatusBadge** - Show connection/sync status
9. **ConfirmDialog** - Confirmation modals
10. **Toast** - Success/error notifications

---

## 🔐 Security Considerations

1. **API Keys**: Never expose in client-side code
2. **Environment Variables**: Store securely, show masked in UI
3. **CORS**: Already configured in server
4. **Authentication**: Consider adding user authentication
5. **Rate Limiting**: Add to prevent API abuse
6. **Input Validation**: Validate all user inputs
7. **XSS Protection**: Sanitize user-generated content

---

## 📱 Responsive Design

- **Desktop**: Full dashboard with sidebar navigation
- **Tablet**: Collapsible sidebar, stacked cards
- **Mobile**: Bottom navigation, single column layout

---

## 🚀 Implementation Priority

### Phase 1: Core Dashboard (Week 1)

1. ✅ Persona Editor component
2. Dashboard overview page
3. Basic statistics display
4. MCP server list view

### Phase 2: Server Management (Week 2)

5. Add/Edit MCP server form
6. Connection status indicators
7. Sync trigger functionality
8. Credential management

### Phase 3: Advanced Features (Week 3)

9. Graph schema visualization
10. Real-time progress tracking
11. Model configuration UI
12. Advanced statistics

### Phase 4: Polish & Optimization (Week 4)

13. Responsive design refinement
14. Performance optimization
15. Error handling improvements
16. Documentation

---

## 📝 Next Steps

1. **Create missing API endpoints** in the server
2. **Set up React project** with recommended stack
3. **Build PersonaEditor component** (Priority 1)
4. **Implement dashboard layout** and navigation
5. **Add MCP server management** UI
6. **Create statistics displays**
7. **Build graph visualization**
8. **Add real-time updates** with WebSockets or polling

---

## 🤔 Questions for Clarification

1. Do you want real-time updates (WebSockets) or polling for sync/indexing progress?
2. Should we add user authentication or keep it single-user for now?
3. Do you prefer a specific UI library (shadcn/ui, Material-UI, Ant Design)?
4. Should the graph visualization be interactive (drag nodes, zoom, etc.)?
5. Do you want to export data (CSV, JSON) from the dashboard?
