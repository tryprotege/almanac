# Installation with Docker (Recommended)

The fastest way to get eBee running locally.

## Step 1: Clone Repository

```bash
git clone https://github.com/[org]/ebee-oss.git
cd ebee-oss
```

## Step 2: Install Dependencies

```bash
pnpm install
```

## Step 3: Configure Environment

```bash
# Copy example environment file
cp packages/server/.env.example packages/server/.env

# Edit .env and add your API keys
# Required: OPENAI_API_KEY or ANTHROPIC_API_KEY
# Optional: Other configuration (see Configuration guide)
```

## Step 4: Start Services

```bash
# Start all services (databases + application)
pnpm docker:all

# OR start only infrastructure (for local development)
pnpm docker:infra
pnpm dev
```

## Step 5: Verify Installation

1. Open http://localhost:5173 (Dashboard)
2. Check http://localhost:3000/health (API health)
3. Verify all services are running:
   ```bash
   docker compose ps
   ```

## Troubleshooting

- **Port conflicts**: See [Common Issues](../troubleshooting#port-conflicts)
- **Docker errors**: See [Docker Troubleshooting](../troubleshooting#docker)
- **Connection issues**: See [Network Issues](../troubleshooting#network)

**Next:** [First Steps →](./first-steps)
