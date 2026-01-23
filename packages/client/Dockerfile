FROM node:24-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy workspace configuration (use Docker-specific workspace file)
COPY package.json pnpm-lock.yaml pnpm-workspace.docker.yaml ./
RUN mv pnpm-workspace.docker.yaml pnpm-workspace.yaml

# Development stage
FROM base AS development

# Copy all package.json files for workspace dependencies
COPY packages/client/package.json ./packages/client/
COPY packages/server/package.json ./packages/server/
COPY packages/shared-util/package.json ./packages/shared-util/
COPY packages/indexing-engine/package.json ./packages/indexing-engine/
COPY packages/fathom-mcp-server/package.json ./packages/fathom-mcp-server/
COPY packages/data-sources-config/ ./packages/data-sources-config/

# Install all dependencies with cache mount for speed
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy shared packages (needed for type definitions)
COPY packages/server ./packages/server
COPY packages/shared-util ./packages/shared-util
COPY packages/indexing-engine ./packages/indexing-engine

# Copy client source code
COPY packages/client ./packages/client

# Expose client port
EXPOSE 5173

# Start client with host flag for Docker
CMD ["pnpm", "--filter", "client", "run", "dev", "--", "--host", "0.0.0.0"]

# Production build stage
FROM base AS builder

# Copy lockfile for faster, deterministic installs
COPY pnpm-lock.yaml ./

# Copy all package.json files
COPY packages/client/package.json ./packages/client/
COPY packages/server/package.json ./packages/server/
COPY packages/shared-util/package.json ./packages/shared-util/
COPY packages/indexing-engine/package.json ./packages/indexing-engine/
COPY packages/fathom-mcp-server/package.json ./packages/fathom-mcp-server/
COPY packages/data-sources-config/ ./packages/data-sources-config/

# Install with cache mount for speed
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY packages/server ./packages/server
COPY packages/shared-util ./packages/shared-util
COPY packages/indexing-engine ./packages/indexing-engine
COPY packages/client ./packages/client

# Build the client
RUN pnpm --filter client run build

# Production stage - serve with nginx
FROM nginx:alpine AS production

# Copy built files from builder
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

# Copy nginx configuration
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
