# Matanho Nexus web (Next.js standalone). Build context MUST be the repository root:
#   docker build -f apps/web/Dockerfile -t nexus-web .
FROM node:22-bookworm-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund --workspace=@nexus/shared --workspace=@nexus/web --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web

# NEXT_PUBLIC_* values are inlined at build time
ARG NEXT_PUBLIC_SHOW_DEMO_LOGINS=true
ARG NEXT_PUBLIC_DEMO_PASSWORD=
ENV NEXT_PUBLIC_SHOW_DEMO_LOGINS=$NEXT_PUBLIC_SHOW_DEMO_LOGINS \
    NEXT_PUBLIC_DEMO_PASSWORD=$NEXT_PUBLIC_DEMO_PASSWORD \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @nexus/shared && npm run build -w @nexus/web

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
# API_URL (server-side proxy target) is provided at runtime
CMD ["node", "apps/web/server.js"]
