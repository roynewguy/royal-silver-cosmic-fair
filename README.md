# Picks Boat Boyz

Official desk for **#1 Picks Boat Boyz Picks**.

**GitHub:** [roynewguy/royal-silver-cosmic-fair](https://github.com/roynewguy/royal-silver-cosmic-fair)

## Free beta (\$0/month)

Set `FREE_BETA_MODE=true` on the host.

* GitHub Action still ticks every 10 minutes (`APP_URL` + `CRON_SECRET`).
* ESPN handles schedules, scores, records, injuries, starters, weather, and ranking.
* The Odds API is **not** called on that 10-minute scan.
* DraftKings is fetched only for a candidate near post time, **one market** (`h2h` / `spreads` / `totals`).
* Official posts still require a verified DraftKings line. ESPN is never labeled DraftKings.
* Automatic Grok/xAI research is off. Reasons come from the model.
* Credits (`x-requests-remaining`) are stored. Under 150 → final-check only. Under 50 → one DK hit. At 0 → cached DK only, otherwise PASS.

## 24/7 tick (Hobby)

Vercel Hobby cron is **once per day**. The 10-minute loop is GitHub Action `.github/workflows/boatboyz-tick.yml`.

Set **GitHub repo secrets** (Settings → Secrets → Actions):

| Secret | Value |
| --- | --- |
| `APP_URL` | `https://your-app.vercel.app` (no trailing slash) |
| `CRON_SECRET` | random 16+ chars — **same value** as host `CRON_SECRET` |

The tick POST is `Authorization: Bearer $CRON_SECRET` only. Missing secrets skip the run (no red X) until you add them.

## Secrets on the host

| Var | Purpose |
| --- | --- |
| `FREE_BETA_MODE` | `true` for the \$0 24/7 path |
| `DISCORD_WEBHOOK_URL` | Auto-post + recaps |
| `BOATBOYZ_PIN` | Operator secret, 8+. Required. Rotate it in hosting, not in the app. |
| `CRON_SECRET` | Required for `/api/cron/tick` |
| `ODDS_API_KEY` | The Odds API, DraftKings only |
| `XAI_API_KEY` | Unused in free beta |

## Official card

Today in PT. DraftKings only on the freeze. Soccer dark. Queued tickets are operator-only.

Model V2 formulas are unchanged. Reliability (posting token, freeze, grading, calibration) is unchanged.
