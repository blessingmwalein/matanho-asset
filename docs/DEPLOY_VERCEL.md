# Deploy the web app on Vercel (API stays on Render)

The Next.js frontend can run on Vercel, but the **NestJS API cannot sensibly run on Vercel** (long-running server, Prisma, 15 MB uploads). So this option is: **API on Render + web on Vercel + database on Neon.**

> **Recommendation:** unless you specifically need Vercel, use [DEPLOY_RENDER.md](DEPLOY_RENDER.md) for both. It has fewer moving parts and none of the limits below.
>
> **Status:** prepared but not verified. Nothing has been deployed.

## Known limits of the Vercel option

| Limit | Effect | What to do |
|---|---|---|
| **4.5 MB request body limit** on Vercel Functions | The web app sends uploads through its `/api/*` proxy, so any upload over ~4.5 MB fails with HTTP 413 | Use small files (under 4 MB) in the demo, or host the web on Render instead |
| **Function time limit** | A sleeping Render free API takes up to a minute to wake; the proxy is set to `maxDuration = 60` (already in the code) | Warm the API before a demo (`/health`). Hobby plans cap functions at 60 s |
| **Latency** | Browser → Vercel → Render → Neon adds a hop | Choose a Vercel Functions region near the Render/Neon region (US East) |

---

## Part A: Deploy the API on Render (API only)

1. Do **Steps 1 and 2** of [DEPLOY_RENDER.md](DEPLOY_RENDER.md) (Neon strings, push to a private GitHub repo).
2. Render dashboard → **New +** → **Web Service** → pick your repository.
3. Settings:

| Field | Value |
|---|---|
| Name | `nexus-api` |
| Region | **Ohio** (matches Neon `us-east-2`; use the closest region otherwise) |
| Branch | `main` |
| Runtime / Language | **Docker** |
| Dockerfile Path | `./apps/api/Dockerfile` |
| Docker Build Context Directory | `.` (repository root) |
| Instance type | Free (or Starter to avoid sleeping) |
| Health Check Path | `/health` |

4. **Environment variables** (Advanced → Add Environment Variable):

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | Neon **pooled** string |
| `DIRECT_URL` | Neon **direct** string (no `-pooler`) |
| `JWT_SECRET` | a long random string (32+ chars). Don't use words like "secret", "change" or "example" |
| `JWT_EXPIRES_IN` | `8h` |
| `CORS_ORIGIN` | your Vercel URL (set after Part B; temporary value `https://example.vercel.app`) |
| `STORAGE_DRIVER` | `db` |
| `SEED_DEMO_USERS` | `true` |
| `SEED_ON_BOOT` | `true` (seeds an empty database on first start; skipped if data exists) |
| `DEMO_PASSWORD` | `Matanho#Demo2026` (or your own) |

5. **Create Web Service** and wait for the build (5–10 minutes) and first start (seeding adds 1–3 minutes).
6. Check `https://<api-url>/health` returns `{"status":"ok","database":"up",…}`. Copy the API URL.

## Part B: Deploy the web app on Vercel

1. https://vercel.com → **Add New… → Project** → import the same GitHub repository.
2. **Configure Project:**

| Field | Value |
|---|---|
| Framework Preset | **Next.js** (auto-detected) |
| **Root Directory** | `apps/web` |
| Include source files outside of the Root Directory | **Enabled** (required: the app uses the `packages/shared` workspace) |
| **Install Command** (override) | `cd ../.. && npm ci` |
| **Build Command** (override) | `cd ../.. && npm run build:shared && npm run build -w @nexus/web` |
| Output Directory | leave default |
| Node.js Version | **22.x** (Project Settings → General) |

3. **Environment Variables:**

| Key | Value |
|---|---|
| `API_URL` | the Render API URL from Part A (https, no trailing slash) |
| `NEXT_PUBLIC_SHOW_DEMO_LOGINS` | `true` |
| `NEXT_PUBLIC_DEMO_PASSWORD` | same as the API's `DEMO_PASSWORD` |

4. Click **Deploy**. When it finishes, copy the production URL (e.g. `https://matanho-nexus.vercel.app`).
5. Back in Render → `nexus-api` → Environment → set `CORS_ORIGIN` to that Vercel URL → Save (redeploys the API).
6. *(Optional)* Vercel → Project Settings → **Functions** → choose a region in **US East** to sit close to Render Ohio and Neon.

## Part C: Verify
1. `https://<vercel-url>/login` loads; click a demo account; you land in the right portal.
2. Test a small upload (a PDF under 4 MB) in the public onboarding flow.
3. If the first login after idle fails with a 502/504, wait a minute (API waking up) and retry.

## Updating
Pushing to `main` redeploys **both** the Render API and the Vercel web app automatically.

## Re-seeding, demo-day routine and hardening
Identical to the Render guide: see "Re-seeding the hosted database", "Demo-day routine" and "Before showing this to anyone outside a demo" in [DEPLOY_RENDER.md](DEPLOY_RENDER.md). For this option, "demo-day routine" means warming up the **Render API** (`/health`); Vercel doesn't sleep.

## Troubleshooting (Vercel-specific)

| Symptom | Likely cause and fix |
|---|---|
| Build: `Cannot find module '@nexus/shared'` | Build command doesn't build the shared package first. Use the exact Build Command above and enable "Include source files outside of the Root Directory" |
| Build: `npm ci` fails or can't find `package-lock.json` | Install command must run from the repo root: `cd ../.. && npm ci` |
| Upload returns 413 | File over ~4.5 MB (Vercel body limit). Use a smaller file, or host the web on Render |
| Login: "API is unreachable" | `API_URL` wrong (must be the Render URL, https, no trailing slash), or the API is asleep: check `/health` |
| Everything signs out immediately | Use the `https` Vercel URL (not a preview URL with a different origin than you started on); clear site cookies |
