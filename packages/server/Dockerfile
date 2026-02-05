FROM node:24-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration (use Docker-specific workspace file)
COPY package.json pnpm-workspace.docker.yaml ./
RUN mv pnpm-workspace.docker.yaml pnpm-workspace.yaml

# Development stage
FROM base AS development

# Copy all package.json files for workspace dependencies
COPY packages/server/package.json ./packages/server/
COPY packages/shared-util/package.json ./packages/shared-util/
COPY packages/indexing-engine/package.json ./packages/indexing-engine/
COPY packages/fathom-mcp-server/package.json ./packages/fathom-mcp-server/
COPY packages/data-sources-config/ ./packages/data-sources-config/

# Install all dependencies (without frozen lockfile since we're using filtered workspace)
RUN pnpm install --no-frozen-lockfile

# Copy shared packages source code
COPY packages/shared-util ./packages/shared-util
COPY packages/indexing-engine ./packages/indexing-engine

# Copy server source code
COPY packages/server ./packages/server

# Expose server port
EXPOSE 3000

# Start server in development mode
CMD ["pnpm", "--filter", "server", "run", "dev"]

# Production build stage
FROM base AS builder

# Copy all package.json files
COPY packages/server/package.json ./packages/server/
COPY packages/shared-util/package.json ./packages/shared-util/
COPY packages/indexing-engine/package.json ./packages/indexing-engine/
COPY packages/fathom-mcp-server/package.json ./packages/fathom-mcp-server/
COPY packages/data-sources-config/ ./packages/data-sources-config/

# Install all dependencies (needed for TypeScript compilation)
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY packages/shared-util ./packages/shared-util
COPY packages/indexing-engine ./packages/indexing-engine
COPY packages/server ./packages/server

# Build the server and dependencies
RUN pnpm --filter shared-util run build || true
RUN pnpm --filter indexing-engine run build || true
# Skip type-check for production build, run tsc with --noCheck or use direct tsc
RUN cd packages/server && pnpm exec tsc --noCheck || pnpm exec tsc --skipLibCheck --noUnusedLocals false --noUnusedParameters false

# Production stage
FROM node:24-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.docker.yaml ./
RUN mv pnpm-workspace.docker.yaml pnpm-workspace.yaml
COPY packages/server/package.json ./packages/server/
COPY packages/shared-util/package.json ./packages/shared-util/
COPY packages/indexing-engine/package.json ./packages/indexing-engine/
COPY packages/fathom-mcp-server/package.json ./packages/fathom-mcp-server/
COPY packages/data-sources-config/ ./packages/data-sources-config/

# Install all dependencies (tsx is needed to run TypeScript imports)
RUN pnpm install --no-frozen-lockfile

# Copy source and built files from builder
COPY --from=builder /app/packages/shared-util ./packages/shared-util
COPY --from=builder /app/packages/indexing-engine ./packages/indexing-engine
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Copy data-sources-config if it exists
COPY packages/data-sources-config ./packages/data-sources-config

# Expose server port
EXPOSE 3000

# Start server with tsx to handle TypeScript imports
CMD ["pnpm", "--filter", "server", "exec", "tsx", "dist/server.js"]
