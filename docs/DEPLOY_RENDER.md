# Deploy to Render (API + web): recommended

Both services run as Docker web services on Render, backed by Neon PostgreSQL. This is the path the repository is configured for (`render.yaml` + two Dockerfiles).

> **Status:** prepared but not yet verified. The Dockerfiles were reviewed and the lockfile checked (`npm ci` sync), but no Docker image has been built and nothing has been deployed. If a build fails, copy the build log and fix from there (see Troubleshooting).

## Why Render for both

| Concern | Render | Vercel |
|---|---|---|
| NestJS API (long-running server, Prisma, 15 MB uploads) | Native fit (Docker web service) | Poor fit: serverless functions, 4.5 MB request body limit, cold starts |
| Next.js app + proxy route (`/api/*`) | Works (standalone Docker image) | Works, but file uploads through the proxy are capped at 4.5 MB |
| One platform, one config file | `render.yaml` Blueprint creates both | Needs a second platform for the API |

If you want the web on Vercel anyway, see [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).

## What you need
- A GitHub account (the repository will be **private**) and a Render account (https://render.com).
- Your Neon project. Recommended: create a **separate branch for the hosted demo** (Neon console → Branches → Create branch, name it e.g. `hosted-demo`) so local testing and the hosted demo don't share data.
- About 30 minutes, mostly waiting for builds.

---

## Step 1: Get the Neon connection strings
In the Neon console, select the branch you'll use, click **Connect**, and copy **two** strings:

| Variable | Which string | Looks like |
|---|---|---|
| `DATABASE_URL` | **Pooled** connection (host contains `-pooler`) | `postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `DIRECT_URL` | **Direct** connection (same host without `-pooler`) | `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require` |

Both are needed: the app uses the pooled string; migrations use the direct one.

## Step 2: Push the code to a private GitHub repository
1. On GitHub: **New repository** → name `matanho-nexus` → **Private** → don't add a README/gitignore → Create.
2. In PowerShell, from the project folder:

```powershell
cd C:\Users\bless\Documents\me\matanho-nexus-asset
git config user.name "Your Name"            # only if git asks who you are
git config user.email "you@example.com"
git status                                  # CHECK: no .env, .env.local, node_modules or .storage in the list
git add .
git commit -m "Matanho Nexus MVP"
git branch -M main
git remote add origin https://github.com/<your-username>/matanho-nexus.git
git push -u origin main
```

> Never commit `.env` files. They are in `.gitignore`; the `git status` check above is your safety net. `DEMO_CREDENTIALS.md` contains the (synthetic) demo password, which is another reason to keep the repo private.

## Step 3: Create the services from the Blueprint
1. Render dashboard → **New +** → **Blueprint**.
2. **Connect** your GitHub account if asked, then pick the `matanho-nexus` repository.
3. Render reads `render.yaml` and shows two services: `nexus-api` and `nexus-web`. It will ask for the variables marked `sync: false`. Fill them like this (use placeholders for the two cross-service URLs for now):

**`nexus-api`**

| Variable | Value |
|---|---|
| `DATABASE_URL` | pooled string from Step 1 |
| `DIRECT_URL` | direct string from Step 1 |
| `CORS_ORIGIN` | `https://nexus-web.onrender.com` (placeholder, fixed in Step 5) |
| `DEMO_PASSWORD` | `Matanho#Demo2026` (or your own; must match `NEXT_PUBLIC_DEMO_PASSWORD` below) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | leave **blank** (documents are stored in PostgreSQL: `STORAGE_DRIVER=db`) |

**`nexus-web`**

| Variable | Value |
|---|---|
| `API_URL` | `https://nexus-api.onrender.com` (placeholder, fixed in Step 5) |
| `NEXT_PUBLIC_DEMO_PASSWORD` | same as `DEMO_PASSWORD` above |

`JWT_SECRET` is generated automatically. `SEED_DEMO_USERS=true` and `SEED_ON_BOOT=true` are already set, so the **first start seeds the demo data into an empty database** (skipped automatically if data already exists).

4. Click **Apply**. Render builds both images. Expect **5–10 minutes each** on the free plan. The API's first start also applies migrations and seeds, so give it another 1–3 minutes.

## Step 4: Find the real URLs
When a service is live, its URL is at the top of its page, e.g. `https://nexus-api-xxxx.onrender.com`. If the name `nexus-api` was free it won't have a suffix; otherwise Render adds one. **Use exactly what Render shows.**

## Step 5: Point the services at each other
1. Open **nexus-web → Environment** → set `API_URL` to the API's real URL (no trailing slash) → **Save**.
2. Open **nexus-api → Environment** → set `CORS_ORIGIN` to the web's real URL → **Save**.
3. Each save triggers a redeploy. Wait until both show **Live**.

## Step 6: Check it works
1. `https://<api-url>/health` should return `{"status":"ok","database":"up","storage":"db",…}`.
2. `https://<api-url>/docs` shows the Swagger documentation.
3. Open `https://<web-url>/login`, click one of the demo accounts, and confirm you land in the right portal.
4. Then run the test flows from the team's test script (onboarding, portfolio, custodian, company, statement).

## Step 7: Demo-day routine (free plan)
Free web services **go to sleep after a period of inactivity** and take about a minute to wake. (Check Render's current pricing page for the exact limits.) About 5–10 minutes before a demo:
1. Open `https://<api-url>/health` and wait for `ok`.
2. Open `https://<web-url>/login` and sign in once.
A paid instance type (set `plan: starter` in `render.yaml`) removes the sleeping.

## Re-seeding the hosted database (fresh demo data)
Seed dates are relative to the day the seed runs, so re-seed on or just before the demo day. Run this **from your computer**, pointed at the hosted branch:

```powershell
cd C:\Users\bless\Documents\me\matanho-nexus-asset
$env:DATABASE_URL = "<hosted pooled string>"
$env:DIRECT_URL   = "<hosted direct string>"
$env:STORAGE_DRIVER = "db"
npm run db:reset-demo
```
This wipes the demo data in that database (the append-only audit table is kept) and loads fresh data. Close the PowerShell window afterwards so those variables don't linger.

## Updating the app later
`git push` to `main` redeploys both services automatically (`autoDeploy: true`). Set it to `false` in `render.yaml` if you want manual deploys. Database changes: add a new Prisma migration; it is applied automatically on API start (`prisma migrate deploy`).

## Before showing this to anyone outside a demo
- Set `SEED_DEMO_USERS=false` and `SEED_ON_BOOT=false` on the API, and `NEXT_PUBLIC_SHOW_DEMO_LOGINS=false` on the web (this one is baked at build time, so redeploy the web afterwards).
- Remove or change the demo users (Administration → Users).
- Use object storage (S3-compatible) instead of `STORAGE_DRIVER=db` for real documents.
- This is an MVP: no automated tests were written or run, and it has not had a security review.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Build fails with `npm ci` lockfile error | Run `npm install` locally, commit `package-lock.json`, push |
| API logs `Invalid environment configuration` | A required variable is missing (`DATABASE_URL`, `JWT_SECRET`). Open the log: it lists which |
| API logs `Environment variable not found: DIRECT_URL` | Add `DIRECT_URL` (the non-pooled Neon string) to `nexus-api` |
| `P1001: Can't reach database server` | Wrong host or missing `?sslmode=require`; copy the string again from Neon. Neon may also be waking from idle: retry |
| Migration error about locks or prepared statements | `DIRECT_URL` points at the pooled host. It must be the direct one (no `-pooler`) |
| Login page says the API is unreachable (502) | `API_URL` is wrong, or the API is still waking up. Check `/health`, wait a minute, retry |
| Login works but you're sent back to `/login` | The web must be served over `https` (Render does this). Clear cookies for the site and retry |
| One-click demo logins fail with "Invalid email or password" | `NEXT_PUBLIC_DEMO_PASSWORD` doesn't match `DEMO_PASSWORD`. Fix it and redeploy the web |
| Dashboard empty / no users | Seeding didn't run. Check the API log for the seed output, or run the re-seed command above |
| Uploads fail | File over 15 MB or an unsupported type (PDF, image, CSV, Excel, Word, text are accepted) |
