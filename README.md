# ebee-oss

A lightning-fast data access platform for AI Agents built with a modern monorepo architecture.

## 📦 Monorepo Structure

This project uses pnpm workspaces to manage multiple packages:

```
ebee-oss/
├── packages/
│   ├── client/          # React + Vite frontend
│   └── server/          # Express.js backend
├── pnpm-workspace.yaml  # Workspace configuration
└── docker-compose.yml   # Docker services
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 24.0.0
- pnpm >= 8.0.0
- Docker Desktop or Docker Engine
- Docker Compose

### Installation

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Start development servers:**

   ```bash
   # Start all services (client + server)
   pnpm dev

   # Or start individually
   pnpm dev:client  # Client on http://localhost:5173
   pnpm dev:server  # Server on http://localhost:3000
   ```

### Docker Development

1. **Start all services (databases + application):**

   ```bash
   docker compose up -d
   ```

2. **Stop all services:**

   ```bash
   docker compose down
   ```

## 📚 Available Scripts

### Root Level

- `pnpm dev` - Start both client and server in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run tests across all packages
- `pnpm type-check` - Type check all packages

### Client Package

```bash
cd packages/client
pnpm dev      # Start Vite dev server
pnpm build    # Build for production
pnpm preview  # Preview production build
```

### Server Package

```bash
cd packages/server
pnpm dev           # Start server with hot reload
pnpm build         # Build TypeScript
pnpm start         # Start production server
pnpm test          # Run tests
```

## 🗄️ Development Environment

This project uses Docker Compose to manage the following services:

- **MongoDB**: Document database
- **Qdrant**: Vector database
- **Memgraph**: Graph database
- **Redis**: In-memory data store
- **Server**: Express.js backend (when using Docker)
- **Client**: React frontend (when using Docker)

### Service Access

| Service  | Port(s)    | Connection Details                                |
| -------- | ---------- | ------------------------------------------------- |
| Client   | 5173       | `http://localhost:5173`                           |
| Server   | 3000       | `http://localhost:3000`                           |
| MongoDB  | 27017      | `mongodb://admin:admin123@localhost:27017`        |
| Qdrant   | 6333, 6334 | HTTP: `http://localhost:6333`, gRPC: `6334`       |
| Memgraph | 7687, 7444 | Bolt: `bolt://localhost:7687`, Monitoring: `7444` |
| Redis    | 6379       | `redis://localhost:6379`                          |

### Database Applications to Inspect the Data

**Memgraph:**

- Download [Memgraph Lab](https://memgraph.com/download) for visual graph database management
- Connect using Bolt protocol: `bolt://localhost:7687`

**Qdrant:**

- Built-in web dashboard: [http://localhost:6333/dashboard](http://localhost:6333/dashboard)

**MongoDB:**

- [MongoDB Compass](https://www.mongodb.com/products/compass) - official GUI client

## 🏗️ Architecture

### Client (packages/client)

- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: CSS

### Server (packages/server)

- **Framework**: Express.js
- **Language**: TypeScript
- **Databases**: MongoDB, Qdrant, Memgraph, Redis
- **Features**: Vector search, graph indexing, schema learning

## 📝 Environment Variables

Copy `.env.example` to `.env` in the server package and configure:

```bash
cp packages/server/.env.example packages/server/.env
```

## 📄 License

This project is licensed under the terms specified in the LICENSE file.
