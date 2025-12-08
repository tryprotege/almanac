# Getting Started

### Prerequisites

- Node.js >= 24.0.0
- pnpm >= 8.0.0
- Docker Desktop or Docker Engine
- Docker Compose

- 📝 Environment Variables

  - Copy `.env.example` to `.env` in the server package and configure:

    ```bash
    cp packages/server/.env.example packages/server/.env
    ```

### Installation

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Start services (Memgraph, Redis, Qdrant, MongoDB)**

   ```bash
   docker-compose up
   ```

3. **Start development servers:**

   ```bash
   # Start all services (client + server)
   pnpm dev

   # Or start individually
   pnpm dev:client  # Client on http://localhost:5173
   pnpm dev:server  # Server on http://localhost:3000
   ```

---

### Docker Development

1. **Start all services (databases + application):**

   ```bash
   pnpm docker:all
   ```

2. **Start only infra:**

   ```bash
   pnpm docker:infra
   ```

3. **Stop all services:**

   ```bash
   pnpm docker:down
   ```

### Platform

- Navigate to http://localhost:5173
