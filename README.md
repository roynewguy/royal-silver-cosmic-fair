# Picks Boat Boyz

Official desk for **#1 Picks Boat Boyz Picks**.

**GitHub:** [roynewguy/royal-silver-cosmic-fair](https://github.com/roynewguy/royal-silver-cosmic-fair)

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
| `DISCORD_WEBHOOK_URL` | Auto-post + recaps |
| `BOATBOYZ_PIN` | Operator secret, 8+. Required. Rotate it in hosting, not in the app. |
| `CRON_SECRET` | Required for `/api/cron/tick` |
| `ODDS_API_KEY` | The Odds API, DraftKings only |
| `XAI_API_KEY` | Injected by Grok for research |

## Official card

Today in PT. DraftKings only. Soccer dark. Queued tickets are operator-only. Public visitors see posted/graded history and the record.

Model V2: NBA / MLB / NFL / NHL / NCAAF / WNBA / UFC. Injuries are `{ team, player, status, position }`.

Posted tickets freeze model version, probability, edge, DK selected/posted/closing, and CLV when graded.
