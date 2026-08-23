FROM node:22-bookworm-slim AS build

WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build:packages

FROM node:22-bookworm-slim

WORKDIR /workspace
RUN apt-get update && apt-get install --yes --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY --from=build /workspace /workspace
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "packages/github-app/dist/server.js"]
