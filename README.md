# Picks Boat Boyz

Official desk for **#1 Picks Boat Boyz Picks**.

**GitHub:** [roynewguy/royal-silver-cosmic-fair](https://github.com/roynewguy/royal-silver-cosmic-fair)

## Final Free 24/7 Setup

Goal: unattended ticks every 10 minutes on free tiers. You must paste values in **three places**: Neon, Vercel, and GitHub Actions. The Action cannot wake BoatBoyz until `APP_URL` and `CRON_SECRET` exist as GitHub secrets.

### 1. Free Neon database

1. Open [https://console.neon.tech](https://console.neon.tech) and create a free project.
2. Click **Connect**.
3. Choose the **pooled** connection (the host contains `-pooler`).
4. Copy the URI. It looks like:

```
postgresql://USER:PASSWORD@ep-xxxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

Use that **pooled** string as `DATABASE_URL` on the host. Do not use the direct (non-pooler) URL on Vercel serverless.

Vercel `npm run build` runs `db:migrate` against `DATABASE_URL`, so tables are created on deploy. PGLite is preview-only. Vercel **without** `DATABASE_URL` will refuse to use PGLite (it does not persist).

### 2. The Odds API (free)

1. Sign up at [https://the-odds-api.com](https://the-odds-api.com).
2. Copy the API key → Vercel `ODDS_API_KEY`.
3. In `FREE_BETA_MODE=true` this is only used near post time, one market at a time.

### 3. Discord webhook

1. Discord channel → **Edit channel** → **Integrations** → **Webhooks** → **New Webhook**.
2. Copy the URL → Vercel `DISCORD_WEBHOOK_URL`.

### 4. Operator PIN

Pick a secret **8+ characters** (not a 4-digit PIN). That is `BOATBOYZ_PIN` on Vercel.

### 5. Cron secret (one value, two places)

Generate a long random string, for example:

```
openssl rand -hex 24
```

Paste **the same value** as:

* Vercel env `CRON_SECRET`
* GitHub Actions secret `CRON_SECRET`

### 6. Vercel / host environment

Project → **Settings** → **Environment Variables** (Production):

| Name | Value |
| --- | --- |
| `FREE_BETA_MODE` | `true` |
| `DAILY_PICK_TARGET` | `3` — **initial default only** (1–6). After first unlock, the operator dashboard is the live target. |
| `CRON_SECRET` | the random string from step 5 |
| `ODDS_API_KEY` | Odds API key |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL |
| `DATABASE_URL` | Neon **pooled** URI from step 1 |
| `BOATBOYZ_PIN` | operator secret, 8+ chars |

Redeploy after saving so the new env is live.

### 7. GitHub Actions secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
| --- | --- |
| `APP_URL` | `https://YOUR-APP.vercel.app` — no trailing slash |
| `CRON_SECRET` | **same** string as Vercel `CRON_SECRET` |

If these are empty, the 10-minute job prints a setup notice and **does not call BoatBoyz**.

### 8. Prove it is alive

1. GitHub → **Actions** → **BoatBoyz tick** → **Run workflow**.
2. Open the log. Success looks like:

```
Contacting deployed BoatBoyz: https://YOUR-APP.vercel.app/api/cron/tick
HTTP 200
{"ok":true,"contacted":true,"db":"neon","freeBeta":true,...}
BoatBoyz tick succeeded — deployed endpoint was contacted.
```

After that, the schedule (`*/10 * * * *`) keeps POSTing:

`POST ${APP_URL}/api/cron/tick`  
`Authorization: Bearer ${CRON_SECRET}`

## Free beta behavior (unchanged)

* ESPN handles normal 10-minute scans (schedules, scores, records, injuries, starters, weather, ranking).
* No automatic Grok / xAI spend.
* DraftKings (Odds API) is rationed near post time, one market only.
* Official posts require a verified DraftKings line. ESPN is never labeled DraftKings.
* At 0 Odds API credits: cached DK (fresh within 20 minutes) or PASS.

Daily card: best N qualifying bets on today's PT slate (default 3, operator sets 1–6 on the desk). Queued tickets stay rotatable until posting starts — a stronger play (or a lower target) can rotate a weaker queued pick off. Posting, posted, and graded tickets never move. Graded/posted/posting still fill today's cap. Skipped/PASS do not. Yesterday does not take today's slots. Official posts never freeze a DraftKings line older than 20 minutes.


## What you still enter by hand

The code cannot log into Vercel, Neon, Discord, or The Odds API for you. Paste:

1. **Neon** → create project → copy pooled `DATABASE_URL`.
2. **The Odds API** → copy key.
3. **Discord** → copy webhook.
4. **Vercel** → six env vars in the table above, then redeploy.
5. **GitHub** → `APP_URL` + `CRON_SECRET`.
6. **Actions** → Run **BoatBoyz tick** once and confirm `contacted: true`.
