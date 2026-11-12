# Matanho Nexus

Institutional asset management MVP: five connected portals (internal workspace, public investor onboarding, investor, custodian, portfolio company) on one NestJS API and one PostgreSQL (Neon) database.

> **Status:** demonstration MVP. Not production-ready. No automated tests were written or run for this build. See [MVP_SCOPE.md](MVP_SCOPE.md), [FUTURE_SCOPE.md](FUTURE_SCOPE.md) and [UAT_COVERAGE.md](UAT_COVERAGE.md).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · TanStack Query/Table · React Hook Form + Zod · Recharts · NestJS 11 · Prisma 6 · PostgreSQL (Neon) · JWT · Swagger.

```
apps/api         NestJS API (+ Prisma schema, migrations, seed)
apps/web         Next.js portals
packages/shared  zod schemas, enums, permissions, formatters (consumed by both)
docs/CONVENTIONS.md  module and page patterns
*.html           the four reference designs (visual source of truth)
```

## Run locally

1. `npm install`
2. Create `apps/api/.env` (see `.env.example`): your Neon `DATABASE_URL` (pooled) and `DIRECT_URL` (direct), a `JWT_SECRET`, `STORAGE_DRIVER` (`db` recommended; `local` also works), `SEED_DEMO_USERS=true`.
3. Create `apps/web/.env.local`: `API_URL=http://localhost:4000`.
4. `npm run build:shared`
5. `npm run db:generate` then `npm run db:migrate` (applies `apps/api/prisma/migrations`)
6. `npm run db:seed` (builds the API and loads synthetic demo data; `npm run db:reset-demo` wipes demo data and reseeds)
7. `npm run dev`, then open http://localhost:3000 (API on :4000, docs at http://localhost:4000/docs)

Demo logins: [DEMO_CREDENTIALS.md](DEMO_CREDENTIALS.md).

## Demonstration flows

1. **Onboarding:** `/apply` → submit → internal Onboarding & KYC → review → approve → investor appears in the register.
2. **Portfolio → investor portal:** Asset Manager opens a portfolio, records an investment activity entry, then the investor sees the same portfolio.
3. **Custodian → reconciliation:** custodian submits an execution and a day-end pack → Operations runs reconciliation → resolves an exception with a note.
4. **Company reporting:** company completes and submits the pack → internal review → question or accept.
5. **Investor reporting:** generate a statement → independent approval → publish → investor opens and downloads it.

## Security notes

- Secrets live only in environment variables. `.env` files are gitignored; never commit them.
- The browser holds an httpOnly session cookie, never a token in localStorage. The Next.js proxy attaches it; **the API is the only place access is decided**.
- Every investor/custodian/company query is scoped to the caller's organisation on the server.
- Documents are never publicly addressable; every download is permission-checked and audited.

## Deployment

`render.yaml` and the two Dockerfiles are prepared for Render (two web services + Neon). **They have not been deployed or verified.**

- Recommended (API + web both on Render): [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md)
- Web on Vercel + API on Render (has upload-size limits): [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md)
# matanho-asset
