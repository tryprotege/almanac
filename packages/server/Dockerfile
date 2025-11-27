FROM node:24-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package files
COPY packages/server/package.json ./packages/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy server source code
COPY packages/server ./packages/server

# Expose server port
EXPOSE 3000

# Start server
CMD ["pnpm", "--filter", "server", "run", "dev"]