# Zwift Workout Builder

Browser-based Zwift bike workout builder. Drag blocks onto a power profile, edit duration and power, save locally, and export workouts Zwift can import.

Hosting: **Cloudflare Pages** (React app) + **Cloudflare Worker** (OpenAI API proxy).

## Run locally

Terminal 1 — API worker (needs OpenAI key):

```bash
cp worker/.dev.vars.example worker/.dev.vars
# Edit worker/.dev.vars and set OPENAI_API_KEY
npm run dev:worker
```

Terminal 2 — frontend (proxies `/api` to the worker on port 8787):

```bash
npm install
npm run dev
```

Or both at once: `npm run dev:full`

Check the API: [http://127.0.0.1:8787/health](http://127.0.0.1:8787/health)

### Local secrets

| File | Purpose |
|------|---------|
| `worker/.dev.vars` | `OPENAI_API_KEY`, optional `ALLOWED_ORIGINS` for Wrangler dev (gitignored) |
| `.env.local` | Optional; not required if you use `.dev.vars` for the worker |

Never put `OPENAI_API_KEY` in `VITE_*` variables — those are embedded in the client bundle.

### Tip jar & optional ads

The sidebar **Buy me a coffee** link is configured in [`src/siteMeta.ts`](src/siteMeta.ts) (`SUPPORT_TIP_URL` / `SUPPORT_TIP_LABEL`).

**Non-intrusive ads (optional):**

Copy [`.env.example`](.env.example) to `.env.local` for local builds, or set the same `VITE_*` variables on **Cloudflare Pages → Settings → Environment variables** (Production) and rebuild.


1. **[EthicalAds](https://www.ethicalads.io/)** — common on open-source / dev tools; one small unit in the sidebar. Apply for a publisher account, then set:
   - `VITE_ADS=ethical`
   - `VITE_ETHICAL_ADS_PUBLISHER=<your-id>`
2. **Google AdSense** — add their script to `index.html` and a ad `<div>` in a component; requires site approval and a privacy/cookie notice. Heavier and more intrusive than EthicalAds.
3. **No ad network** — tip jar only keeps the UI cleanest for a workout editor.

Add ad vars to GitHub Actions **Build app** step env if you deploy via CI.

## Deploy to Cloudflare

### One-time setup

1. Create a [Cloudflare API token](https://dash.cloudflare.com/profile/api-tokens) with **Workers** and **Cloudflare Pages** edit permissions.
2. Note your **Account ID** from the Cloudflare dashboard.
3. Create a **Pages** project named `zwo-builder` (or change the name in `.github/workflows/deploy-cloudflare.yml`).
4. Deploy the worker once locally to get its URL:

   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put ALLOWED_ORIGINS
   # e.g. https://zwo-builder.pages.dev,http://localhost:5173
   npx wrangler deploy
   ```

   Copy the `*.workers.dev` URL (e.g. `https://zwo-builder-api.<account>.workers.dev`).

5. In GitHub repository **Settings → Secrets and variables → Actions**, add:

   | Secret | Value |
   |--------|--------|
   | `CLOUDFLARE_API_TOKEN` | API token |
   | `CLOUDFLARE_ACCOUNT_ID` | Account ID |
   | `VITE_API_BASE` | Worker URL (no trailing slash) |
   | `VITE_SITE_URL` | Public Pages URL or custom domain (no trailing slash; used for SEO canonical, sitemap, Open Graph) |

6. Push to `main` or `master` to run **Deploy to Cloudflare** (deploys both worker and Pages).

### Cloudflare dashboard: Pages (frontend) via Git

Use a **Pages** project for the React app only. The API is a **separate Worker** (step 4 above or a second Git-connected Worker project).

| Setting | Value |
|---------|--------|
| Framework preset | None |
| Root directory | `/` (repo root) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| **Deploy command** | **Leave empty** (default). Pages publishes `dist` automatically. |
| Environment variables (Build) | `VITE_API_BASE` = worker URL; `VITE_SITE_URL` = your Pages or custom domain (both without trailing slash) |

**Do not** set the deploy command to `npx wrangler deploy`. That command is for the **Worker** in `worker/`, not for Pages. The root `wrangler.toml` only declares `pages_build_output_dir`; it has no `main` script, so `wrangler deploy` fails with “Missing entry-point”.

If your UI forces a deploy command, use GitHub Actions instead (`.github/workflows/deploy-cloudflare.yml`), which runs `wrangler deploy` in `worker/` and `wrangler pages deploy dist` separately.

### Cloudflare dashboard: Worker (API) via Git (optional)

Second project, type **Worker** (not Pages):

| Setting | Value |
|---------|--------|
| Root directory | `/` |
| Build command | `npm ci` (installs Wrangler at repo root) |
| Deploy command | `npx wrangler deploy --config worker/wrangler.toml` |

Set secrets on that worker in the dashboard or with `wrangler secret put` (`OPENAI_API_KEY`, `ALLOWED_ORIGINS`).

### Architecture

```text
Browser (Pages)  --POST /api/generate-workout-->  Worker (zwo-builder-api)
                                                      OPENAI_API_KEY (Wrangler secret)
                                                           |
                                                           v
                                                      OpenAI API
```

The React app calls `VITE_API_BASE + '/api/generate-workout'` in production. In dev, `VITE_API_BASE` is unset and Vite proxies `/api` to `wrangler dev`.

Client helper: `src/lib/api.ts` (`generateWorkoutFromPrompt`).

## Using the workout in Zwift

Export the `.zwo` file, then copy it into your Zwift workouts folder (typically `Documents/Zwift/Workouts/<your Zwift user id>`) and restart Zwift. See [Zwift custom workouts](https://support.zwift.com/en_us/custom-workouts-ryGOTVEPs#Importing_Custom_Workouts_Today's_Plan_or_TrainingPeaks).
