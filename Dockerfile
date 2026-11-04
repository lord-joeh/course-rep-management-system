# ==========================================
# Stage 1: Build Application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm package manager
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./

# Install all dependencies including devDependencies for build
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy configuration and source code
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

ENV NODE_OPTIONS="--max-old-space-size=4096"

# Compile NestJS TypeScript application to JavaScript
RUN pnpm run build

# Prune development dependencies for minimal production footprint
RUN pnpm prune --prod --ignore-scripts

# ==========================================
# Stage 2: Hardened Production Runtime
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install wget for Docker healthcheck
RUN apk add --no-cache wget

# Create application directory with node ownership
RUN chown -R node:node /app

# Copy production artifacts from builder stage with unprivileged user ownership
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

# Run as non-root user (Principle of Least Privilege)
USER node

# Expose HTTP port
EXPOSE 5000

# Container healthcheck querying NestJS health module
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

# Start enterprise production server
CMD ["node", "dist/main.js"]

