FROM node:alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm --ignore-scripts 
WORKDIR /app

# Installs ALL deps (including devDeps)
FROM base AS dev-deps
COPY package.json* pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts  

# Installs only prod deps
FROM base AS prod-deps
COPY package.json* pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --ignore-scripts 

# Production image
FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY package.json* pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY . .
EXPOSE 5000
CMD ["pnpm", "start"]