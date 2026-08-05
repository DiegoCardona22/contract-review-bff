# syntax=docker/dockerfile:1

# Which workspace to run, e.g. services/documents or apps/bff
ARG WORKSPACE

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---- deps ----------------------------------------------------------------
# Manifests are copied before sources so a code change does not invalidate the
# dependency layer. This is the difference between a 2s and a 60s rebuild.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/service-kit/package.json packages/service-kit/
COPY services/documents/package.json services/documents/
COPY services/users/package.json services/users/
COPY services/analysis/package.json services/analysis/
COPY apps/bff/package.json apps/bff/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build ---------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json tsconfig.json ./
COPY packages packages
COPY services services
COPY apps/bff apps/bff
RUN pnpm build

# ---- runtime -------------------------------------------------------------
FROM base AS runtime
ARG WORKSPACE
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/${WORKSPACE}
# Non-root: a container that never needs to write to its own filesystem should
# not be able to.
USER node
# Each workspace declares its own `start`, so one CMD serves all of them
# regardless of whether the entrypoint is server.js or main.js.
CMD ["pnpm", "start"]
