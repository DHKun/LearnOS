# syntax=docker/dockerfile:1

# LearnOS production image. The `tools` stage is also used by the updater for
# read-only course preflight, `courses:sync` and snapshot generation.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.14.0 && pnpm --version
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS tools
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Strict manifest, path, export and validator checks. This runs before the
# Next.js build; a bad course never reaches a running container.
RUN pnpm courses:prepare && pnpm courses:validate

FROM tools AS builder
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ARG LEARNOS_BUILD_VERSION="dev"
ARG LEARNOS_BUILD_TIME="unknown"
    NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL}" \
    LEARNOS_BUILD_VERSION="${LEARNOS_BUILD_VERSION}" \
    LEARNOS_BUILD_TIME="${LEARNOS_BUILD_TIME}"
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone output already contains traced node_modules. Course MDX,
# quiz files and plugin components are copied explicitly because they are read
# from `content/courses` at request time.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/content ./content

ARG LEARNOS_BUILD_VERSION="dev"
ARG LEARNOS_BUILD_TIME="unknown"
ENV LEARNOS_BUILD_VERSION="${LEARNOS_BUILD_VERSION}" \
    LEARNOS_BUILD_TIME="${LEARNOS_BUILD_TIME}"

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
