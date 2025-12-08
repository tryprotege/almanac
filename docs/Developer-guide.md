# Developer Guide

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

### 🗄️ Development Environment

(@TODO Link to adds)

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
