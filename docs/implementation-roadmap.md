# eBee Dashboard Implementation Roadmap

## 🎯 Tech Stack Decisions

Based on your requirements, here are the recommended technologies:

### Frontend

- **Framework**: React 18+ with TypeScript
- **Styling**: Tailwind CSS (utility-first CSS framework)
- **State Management**:
  - TanStack Query (React Query) for server state
  - Zustand for client state (if needed)
- **Forms**: React Hook Form + Zod validation
- **Real-time Updates**: Polling (every 3-5 seconds) for progress tracking
- **Graph Visualization**: React Flow (interactive, drag, zoom, filter)
- **Charts**: Recharts
- **Icons**: Lucide React or Heroicons
- **Notifications**: React Hot Toast or Sonner
- **HTTP Client**: Axios

### Backend (Existing)

- **Server**: Express.js + TypeScript
- **Databases**: MongoDB, Qdrant, Memgraph, Redis
- **MCP**: Model Context Protocol integration

### Authentication

- **MVP**: No authentication (single-user)
- **Future**: Add JWT-based auth or OAuth

---

## 📋 Implementation Phases

### Phase 1: Foundation & Persona Management (Priority 1)

**Goal**: Get the persona editor working end-to-end

#### Backend Tasks

1. Create persona API endpoints in [`server.ts`](../packages/server/src/server.ts)

   - `GET /api/schema/persona` - Get current persona
   - `PUT /api/schema/persona` - Update persona
   - `DELETE /api/schema/persona` - Clear persona

2. Create schema API endpoint
   - `GET /api/schema` - Get full schema with entity/relationship types

#### Frontend Tasks

3. Set up React project structure

   ```
   packages/client/src/
   ├── components/
   │   ├── PersonaEditor.tsx
   │   ├── Button.tsx
   │   ├── Card.tsx
   │   ├── Modal.tsx
   │   └── Layout.tsx
   ├── lib/
   │   ├── api.ts           # API client
   │   └── utils.ts
   ├── hooks/
   │   └── usePersona.ts    # React Query hook
   ├── pages/
   │   ├── Dashboard.tsx
   │   └── Settings.tsx
   └── App.tsx
   ```

4. Install dependencies

   ```bash
   cd packages/client
   npm install @tanstack/react-query axios
   npm install react-hot-toast lucide-react
   npm install react-hook-form @hookform/resolvers zod
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   ```

5. Configure Tailwind CSS

   ```js
   // tailwind.config.js
   module.exports = {
     content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
     theme: {
       extend: {
         colors: {
           primary: {
             50: "#eff6ff",
             100: "#dbeafe",
             500: "#3b82f6",
             600: "#2563eb",
             700: "#1d4ed8",
           },
         },
       },
     },
     plugins: [],
   };
   ```

6. Build PersonaEditor component

   - Multi-line textarea with character counter
   - Auto-save with debouncing (2 seconds)
   - Clear button with confirmation dialog
   - Success/error toast notifications
   - Last updated timestamp

7. Create Settings page with Persona tab

**Deliverables**:

- ✅ Persona CRUD API endpoints
- ✅ PersonaEditor component
- ✅ Settings page with working persona management

**Testing**:

- User can view existing persona
- User can update persona (auto-saves)
- User can clear persona (with confirmation)
- Toast notifications work correctly

---

### Phase 2: Dashboard Overview & Statistics

**Goal**: Display system statistics and connected services

#### Backend Tasks

1. Create statistics API endpoints
   - `GET /api/stats/overview` - Overall system stats
   - `GET /api/stats/records` - Record statistics by source/type
   - `GET /api/stats/vectors` - Vector DB statistics
   - `GET /api/stats/graph` - Graph DB statistics

#### Frontend Tasks

2. Build Dashboard page components

   - StatsCard component (reusable)
   - ConnectedServices component
   - RecentActivity component

3. Create API hooks

   - `useStats()` - Fetch all statistics
   - `useMCPServers()` - Fetch MCP server list

4. Implement polling for real-time updates
   - Poll every 5 seconds when on dashboard
   - Stop polling when user navigates away

**Deliverables**:

- ✅ Statistics API endpoints
- ✅ Dashboard overview page
- ✅ Real-time statistics updates

**Testing**:

- Statistics display correctly
- Polling works and stops appropriately
- Loading states handled gracefully

---

### Phase 3: MCP Server Management

**Goal**: Full CRUD for MCP server configurations

#### Backend Tasks

1. Enhance existing MCP server endpoints (already exist)
   - Ensure proper error handling
   - Add validation for credentials

#### Frontend Tasks

2. Build MCP server management UI

   - MCPServerCard component
   - MCPServerForm component (modal)
   - Connection status indicators
   - Credential management (masked display)

3. Create API hooks

   - `useMCPServers()` - List servers
   - `useCreateMCPServer()` - Create server
   - `useUpdateMCPServer()` - Update server
   - `useDeleteMCPServer()` - Delete server
   - `useConnectMCPServer()` - Connect to server
   - `useDisconnectMCPServer()` - Disconnect from server

4. Build Connections page
   - List all MCP servers
   - Add/Edit/Delete functionality
   - Connect/Disconnect actions
   - Test connection feature

**Deliverables**:

- ✅ MCP server management UI
- ✅ Connections page
- ✅ Full CRUD operations

**Testing**:

- Can add new MCP server
- Can edit existing server
- Can delete server (with confirmation)
- Can connect/disconnect servers
- Credentials are properly masked
- Test connection works

---

### Phase 4: Sync & Indexing Progress

**Goal**: Real-time progress tracking for data operations

#### Backend Tasks

1. Create sync/indexing status endpoints

   - `GET /api/sync/status` - Current sync status
   - `POST /api/sync/start` - Start sync operation
   - `GET /api/indexing/status` - Current indexing status
   - `POST /api/indexing/start` - Start indexing operation

2. Implement progress tracking
   - Store progress in Redis
   - Update progress during sync/indexing
   - Clean up after completion

#### Frontend Tasks

3. Build progress components

   - ProgressBar component
   - SyncProgress component
   - IndexingProgress component

4. Create API hooks with polling

   - `useSyncStatus()` - Poll sync status
   - `useIndexingStatus()` - Poll indexing status
   - Poll every 2 seconds during active operations

5. Add to Dashboard and Stats pages
   - Show current sync/indexing status
   - Display progress bars
   - Estimated time remaining

**Deliverables**:

- ✅ Sync/indexing API endpoints
- ✅ Progress tracking components
- ✅ Real-time progress updates

**Testing**:

- Progress updates in real-time
- Can start sync/indexing from UI
- Can pause/cancel operations
- Progress persists across page refreshes

---

### Phase 5: Graph Schema Visualization

**Goal**: Interactive visualization of entity types and relationships

#### Backend Tasks

1. Enhance schema endpoint (already exists)
   - Ensure it returns all entity and relationship types
   - Include metadata for visualization

#### Frontend Tasks

2. Install React Flow

   ```bash
   npm install reactflow
   ```

3. Build SchemaVisualization component

   - Convert schema data to React Flow nodes/edges
   - Interactive graph (drag, zoom, pan)
   - Node styling by entity type
   - Edge styling by relationship type
   - Tooltips with descriptions

4. Build SchemaViewer page

   - Graph visualization
   - Entity types list
   - Relationship types list
   - Export functionality (JSON, PNG)

5. Add to Settings or create dedicated Schema page

**Deliverables**:

- ✅ Interactive graph visualization
- ✅ Schema viewer page
- ✅ Export functionality

**Testing**:

- Graph renders correctly
- Can drag nodes
- Can zoom and pan
- Tooltips show correct information
- Export works

---

### Phase 6: Model Configuration

**Goal**: UI for configuring LLM and embedding models

#### Backend Tasks

1. Create model configuration endpoints

   - `GET /api/config/models` - Get current model config
   - `PUT /api/config/models` - Update model config
   - `POST /api/config/models/test` - Test model connection

2. Store model config in MongoDB or environment

#### Frontend Tasks

3. Build ModelConfiguration component

   - Provider selection (OpenAI, Anthropic, etc.)
   - Model selection dropdown
   - API key input (masked)
   - Base URL input
   - Test connection button

4. Add to Settings page (Models tab)

**Deliverables**:

- ✅ Model configuration API
- ✅ Model configuration UI
- ✅ Test connection feature

**Testing**:

- Can update model configuration
- API keys are masked
- Test connection works
- Changes persist

---

### Phase 7: Polish & Optimization

**Goal**: Improve UX, performance, and error handling

#### Tasks

1. Error handling improvements

   - Better error messages
   - Retry logic for failed requests
   - Offline detection

2. Loading states

   - Skeleton loaders
   - Optimistic updates
   - Loading indicators

3. Responsive design

   - Mobile-friendly layout
   - Tablet optimization
   - Touch-friendly interactions

4. Performance optimization

   - Code splitting
   - Lazy loading
   - Memoization
   - Query caching

5. Accessibility

   - Keyboard navigation
   - ARIA labels
   - Focus management
   - Screen reader support

6. Documentation
   - Component documentation
   - API documentation
   - User guide

**Deliverables**:

- ✅ Improved error handling
- ✅ Better loading states
- ✅ Responsive design
- ✅ Performance optimizations
- ✅ Accessibility improvements
- ✅ Documentation

---

## 🗓️ Timeline Estimate

| Phase                          | Duration | Cumulative |
| ------------------------------ | -------- | ---------- |
| Phase 1: Persona Management    | 2-3 days | 3 days     |
| Phase 2: Dashboard & Stats     | 2-3 days | 6 days     |
| Phase 3: MCP Management        | 3-4 days | 10 days    |
| Phase 4: Sync & Indexing       | 3-4 days | 14 days    |
| Phase 5: Graph Visualization   | 3-4 days | 18 days    |
| Phase 6: Model Configuration   | 2-3 days | 21 days    |
| Phase 7: Polish & Optimization | 4-5 days | 26 days    |

**Total Estimated Time**: ~4-5 weeks (1 developer, full-time)

---

## 🚀 Quick Start Guide

### 1. Set Up Frontend Project

```bash
cd packages/client

# Install dependencies
npm install

# Install Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Install additional dependencies
npm install @tanstack/react-query axios
npm install react-hot-toast lucide-react
npm install reactflow recharts
npm install react-hook-form @hookform/resolvers zod
```

### 2. Configure Tailwind CSS

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        success: {
          500: "#10b981",
          600: "#059669",
        },
        warning: {
          500: "#f59e0b",
          600: "#d97706",
        },
        error: {
          500: "#ef4444",
          600: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};
```

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-50 text-gray-900;
  }
}

@layer components {
  .btn {
    @apply px-4 py-2 rounded-lg font-medium transition-colors;
  }

  .btn-primary {
    @apply bg-primary-600 text-white hover:bg-primary-700;
  }

  .btn-secondary {
    @apply bg-gray-200 text-gray-900 hover:bg-gray-300;
  }

  .card {
    @apply bg-white rounded-lg shadow-sm border border-gray-200 p-6;
  }

  .input {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500;
  }
}
```

### 3. Create API Client

```typescript
// packages/client/src/lib/api.ts
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Persona API
export const personaApi = {
  get: () => api.get("/api/schema/persona"),
  update: (persona: string) => api.put("/api/schema/persona", { persona }),
  delete: () => api.delete("/api/schema/persona"),
};

// Stats API
export const statsApi = {
  overview: () => api.get("/api/stats/overview"),
  records: () => api.get("/api/stats/records"),
  vectors: () => api.get("/api/stats/vectors"),
  graph: () => api.get("/api/stats/graph"),
};

// MCP Servers API
export const mcpServersApi = {
  list: () => api.get("/api/mcp-servers"),
  get: (name: string) => api.get(`/api/mcp-servers/${name}`),
  create: (config: any) => api.post("/api/mcp-servers", config),
  update: (name: string, config: any) =>
    api.put(`/api/mcp-servers/${name}`, config),
  delete: (name: string) => api.delete(`/api/mcp-servers/${name}`),
  connect: (name: string) => api.post(`/api/mcp-servers/${name}/connect`),
  disconnect: (name: string) => api.post(`/api/mcp-servers/${name}/disconnect`),
  status: (name: string) => api.get(`/api/mcp-servers/${name}/status`),
};
```

### 4. Set Up React Query

```typescript
// packages/client/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>
);
```

### 5. Create First Hook

```typescript
// packages/client/src/hooks/usePersona.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { personaApi } from "../lib/api";
import toast from "react-hot-toast";

export function usePersona() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["persona"],
    queryFn: async () => {
      const response = await personaApi.get();
      return response.data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (persona: string) => personaApi.update(persona),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persona"] });
      toast.success("Persona updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to update persona");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => personaApi.delete(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persona"] });
      toast.success("Persona cleared");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to clear persona");
    },
  });

  return {
    persona: data?.persona || "",
    updatedAt: data?.updatedAt,
    isLoading,
    error,
    updatePersona: updateMutation.mutate,
    deletePersona: deleteMutation.mutate,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
```

### 6. Create Reusable Components

```typescript
// packages/client/src/components/Button.tsx
import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  loading,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = "btn";
  const variantClasses = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "bg-error-600 text-white hover:bg-error-700",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />}
      {children}
    </button>
  );
}
```

```typescript
// packages/client/src/components/Card.tsx
import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function Card({ children, className = "", title }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      {children}
    </div>
  );
}
```

---

## 📦 File Structure

```
packages/client/
├── src/
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Input.tsx
│   │   ├── Textarea.tsx
│   │   ├── layout/
│   │   │   ├── Layout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── dashboard/
│   │   │   ├── StatsCard.tsx
│   │   │   ├── ConnectedServices.tsx
│   │   │   └── RecentActivity.tsx
│   │   ├── persona/
│   │   │   └── PersonaEditor.tsx
│   │   ├── mcp/
│   │   │   ├── MCPServerCard.tsx
│   │   │   ├── MCPServerForm.tsx
│   │   │   └── ConnectionStatus.tsx
│   │   ├── progress/
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── SyncProgress.tsx
│   │   │   └── IndexingProgress.tsx
│   │   └── schema/
│   │       ├── SchemaVisualization.tsx
│   │       └── SchemaViewer.tsx
│   ├── hooks/
│   │   ├── usePersona.ts
│   │   ├── useStats.ts
│   │   ├── useMCPServers.ts
│   │   ├── useSyncStatus.ts
│   │   └── useIndexingStatus.ts
│   ├── lib/
│   │   ├── api.ts
│   │   └── utils.ts
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Connections.tsx
│   │   ├── Settings.tsx
│   │   ├── Stats.tsx
│   │   └── Schema.tsx
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

---

## 🎨 Tailwind Design Tokens

### Color Palette

```js
colors: {
  primary: '#3b82f6',    // Blue
  secondary: '#8b5cf6',  // Purple
  success: '#10b981',    // Green
  warning: '#f59e0b',    // Orange
  error: '#ef4444',      // Red
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
}
```

### Common Utility Classes

```css
/* Buttons */
.btn-primary: bg-primary-600 text-white hover:bg-primary-700
.btn-secondary: bg-gray-200 text-gray-900 hover:bg-gray-300
.btn-danger: bg-error-600 text-white hover:bg-error-700

/* Cards */
.card: bg-white rounded-lg shadow-sm border border-gray-200 p-6

/* Inputs */
.input: w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500

/* Status Badges */
.badge-success: bg-success-100 text-success-800 px-2 py-1 rounded-full text-sm
.badge-warning: bg-warning-100 text-warning-800 px-2 py-1 rounded-full text-sm
.badge-error: bg-error-100 text-error-800 px-2 py-1 rounded-full text-sm
```

---

## 🧪 Testing Strategy

### Unit Tests

- Test individual components
- Test hooks
- Test utility functions

### Integration Tests

- Test API integration
- Test user flows
- Test error handling

### E2E Tests (Optional)

- Test critical user journeys
- Use Playwright or Cypress

---

## 📚 Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [React Flow Documentation](https://reactflow.dev/)
- [Recharts Documentation](https://recharts.org/)
- [React Hot Toast Documentation](https://react-hot-toast.com/)
- [Lucide Icons](https://lucide.dev/)

---

## ✅ Next Steps

1. **Review this roadmap** and confirm the approach
2. **Start with Phase 1**: Create persona API endpoints
3. **Build PersonaEditor component** with Tailwind CSS
4. **Test end-to-end** persona management
5. **Move to Phase 2**: Dashboard and statistics

Would you like me to switch to Code mode and start implementing Phase 1?
Yes
