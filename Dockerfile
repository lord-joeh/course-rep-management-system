FROM node:alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm
COPY . /app
WORKDIR /app

FROM base AS prod-deps
COPY package.json* pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile


FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps package.json* pnpm-lock.yaml* pnpm-workspace.yaml* /app/
COPY . /app/
EXPOSE 5000

CMD [ "pnpm", "start" ]