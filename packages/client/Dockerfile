FROM node:24-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package files
COPY packages/client/package.json ./packages/client/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy client source code
COPY packages/client ./packages/client

# Expose client port
EXPOSE 5173

# Start client with host flag for Docker
CMD ["pnpm", "--filter", "client", "run", "dev", "--", "--host"]