# Picks Boat Boyz

Official desk for **#1 Picks Boat Boyz Picks**.

**GitHub:** [roynewguy/royal-silver-cosmic-fair](https://github.com/roynewguy/royal-silver-cosmic-fair)

## Loop (unattended)

Every ~10 minutes the worker:

1. Refresh slate (ESPN schedule/scores; DraftKings via The Odds API when `ODDS_API_KEY` is set)
2. Rank today's PT card only
3. Research top candidates (Grok + injuries/notes)
4. Queue one official play per sport, or skip
5. ~2.5h pre-kick: refresh line, recompute edge, **send Discord**, then mark posted
6. Grade finals, void postponed/cancelled, post recaps

MLS/EPL stay dark until 3-way soccer markets exist.

## Secrets (never GitHub)

Set these on the host, not in the repo:

| Var | Purpose |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | Auto-post + recaps |
| `BOATBOYZ_PIN` | Operator PIN (preview default `boatboyz` if unset) |
| `CRON_SECRET` | Protect `/api/cron/tick` |
| `ODDS_API_KEY` | The Odds API, `bookmakers=draftkings` |
| `XAI_API_KEY` | Injected by Grok for research |

Vercel cron hits `/api/cron/tick` every 10 minutes (`vercel.json`).
