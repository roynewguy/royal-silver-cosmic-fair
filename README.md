# Picks Boat Boyz

Official desk for **#1 Picks Boat Boyz Picks**.

**GitHub:** [roynewguy/royal-silver-cosmic-fair](https://github.com/roynewguy/royal-silver-cosmic-fair)

## Loop (unattended)

Official card is **today in PT**, **DraftKings only** (The Odds API). No DK line → PASS. Soccer stays dark.

**Model V2** (not one formula in four jerseys):

| Sport | Brain |
| --- | --- |
| NBA | Home/road splits + structured injuries + spread-first |
| MLB | Starter ERA/WHIP first, team W% second, ML-first |
| NFL | Home/road splits, QB OUT, weather totals, spread cap 7.5 |
| NHL | Splits + goalie save%, ML-first |

Each posted ticket freezes `model_version`, `model_probability`, `model_edge`, and a `freeze_json` snapshot. Manual post sends **that pick only**, not the whole queue. A queued sport is not swapped onto a different game.

Every ~10 minutes the worker:

1. Refresh slate (ESPN schedule/scores; DraftKings via The Odds API when `ODDS_API_KEY` is set)
2. Rank today's PT card only
3. Research top candidates (Grok + injuries/notes)
4. Queue one official play per sport, or skip
5. ~2.5h pre-kick: refresh line, recompute edge, **send Discord**, then mark posted
6. Grade finals, void postponed/cancelled, post recaps

MLS/EPL stay dark until 3-way soccer markets exist.

## 24/7 on Vercel

Vercel **Hobby** cron can only run **once per day**. A `*/10 * * * *` expression fails the deploy.

| Host | What actually ticks the desk |
| --- | --- |
| Vercel Hobby | Daily Vercel cron at 16:00 UTC (backup) **plus** GitHub Action every 10 minutes |
| Vercel Pro | You can change `vercel.json` to `*/10 * * * *` |
| GitHub Action | `.github/workflows/boatboyz-tick.yml` POSTs `/api/cron/tick` |

Set GitHub repo secrets: `APP_URL` (your Vercel URL) and `CRON_SECRET` (same value as Vercel env).

## Secrets (never GitHub files)

Set these on the host, not in the repo:

| Var | Purpose |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | Auto-post + recaps |
| `BOATBOYZ_PIN` | **Required.** Operator secret, 8+ characters. No default. Unlock is rate-limited. |
| `CRON_SECRET` | Required. Tick endpoint only accepts `Authorization: Bearer $CRON_SECRET` |
| `ODDS_API_KEY` | The Odds API, `bookmakers=draftkings` |
| `XAI_API_KEY` | Injected by Grok for research |

`/api/cron/tick` does **not** trust `x-vercel-cron` alone. If `CRON_SECRET` is missing, the tick returns 401.
