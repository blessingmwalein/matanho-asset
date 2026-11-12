# Matanho Nexus API (NestJS + Prisma). Build context MUST be the repository root:
#   docker build -f apps/api/Dockerfile -t nexus-api .
FROM node:22-bookworm-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# install dependencies first (cached layer); all workspace manifests are required for a consistent lockfile
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund --workspace=@nexus/shared --workspace=@nexus/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api
# Placeholders so `prisma generate` can parse the schema during the image build. They are never used at runtime
# (real values come from the host's environment variables).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    DIRECT_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build -w @nexus/shared && npm run build -w @nexus/api

FROM node:22-bookworm-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# the runtime stage starts from a clean environment: DATABASE_URL / DIRECT_URL are NOT inherited from the build stage
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 4000

# Apply migrations, optionally seed (idempotent: skips if data exists), then start.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_ON_BOOT\" = \"true\" ]; then node dist/seed/index.js; fi && node dist/main.js"]
