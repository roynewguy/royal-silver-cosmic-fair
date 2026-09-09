# BoatBoyz production ops

Operator-only. Do not paste secrets into Discord, tickets, or this repo.

## Live vs paper vs soak

| Mode | Env | Official Discord | Ledger |
|---|---|---|---|
| Paper (default) | `PAPER_MODE=true`, `BOATBOYZ_LIVE_POSTING=false` | Off | `paper` |
| Shadow soak | `SHADOW_SOAK=true` | Off (wins over LIVE) | `paper` |
| Live | `BOATBOYZ_LIVE_POSTING=true` and soak/paper off | On | `official` |

LIVE cannot be enabled from the operator UI. Only host env. Missing `BOATBOYZ_LIVE_POSTING` is OFF.

`SHADOW_SOAK=true` runs the real scan → model → qualify → freeze-sim → close → grade path on the paper ledger and writes `soak_tickets` (`would_have_posted`). It never posts official / free / no-play Discord.

## Env inventory

**Required for live**

- `DATABASE_URL` — Neon Postgres
- `CRON_SECRET` — Vercel cron bearer (also GitHub Actions OIDC on `main`)
- `ODDS_API_KEY` — The Odds API (DraftKings official)
- `DISCORD_PICKS_WEBHOOK` — official locks only
- `DISCORD_RESULTS_WEBHOOK` — results
- `DISCORD_ALERT_WEBHOOK` — private operator alerts (must not equal picks)

**Safe defaults (keep until soak is done)**

- `BOATBOYZ_LIVE_POSTING=false`
- `PAPER_MODE=true`
- `FREE_BETA_MODE=true`
- `SHADOW_SOAK=true` during certification

**Optional**

- `BOATBOYZ_PIN` — operator unlock
- `DAILY_PICK_TARGET` — max official locks per PT day (cap, not a floor). 0 qualifying LOCKs = 0 official.
- `DAILY_FREE_PICK_TARGET` — max 0/1 free LOCK copy. 0 LOCK days = 0 free.
- `DISCORD_FREE_PICKS_WEBHOOK` — isolated #free-picks
- `DISCORD_TEST_WEBHOOK`, `DISCORD_MANUAL_WEBHOOK`, `DISCORD_RECORD_WEBHOOK`, `DISCORD_WEEKLY_WEBHOOK`
- `DISCORD_MODEL_LAB_WEBHOOK` — shadow research; must not equal picks
- `DISCORD_NO_PLAY_ENABLED` — optional "no qualifying plays" on picks (still requires LIVE)

Never commit real values. Never put Discord tokens in the database when env is set.

## Discord isolation

Alerts, free, weekly, test, and model-lab webhooks fail closed if they share the official picks webhook id. Owner alerts are private-only and never a customer pick.

## Official pick contract

- V2 is the only live champion. V3/V4 never queue or freeze official tickets.
- Official BET requires both sides of a verified DraftKings no-vig market, opposing price, sportsbook, and fresh timestamp. Missing any → `PASS_MARKET_INCOMPLETE` / `PASS_MARKET_STALE`.
- 0 qualifying LOCKs → 0 official picks, 0 free picks. DESK/soft-floor is research-only.
- Injuries, MLB starters, NHL goalies, started/postponed/cancelled, and identity mismatches fail closed.
- Unexpected ESPN / Odds API / injury schema → skip that payload, alert, never crash.

## CLV and grading

- Posted line, model prob, EV, quality, no-vig, and timestamp freeze at post. Never rewrite after the result.
- Missing close ≠ 0 CLV. Null stays null.
- Outcomes: WIN / LOSS / PUSH / VOID. POSTPONED and CANCELLED store VOID on the ledger with an explicit `grade_snapshot_json`. UNRESOLVED stays ungraded.
- After `graded`, result, profit, CLV, closing odds, and grade snapshot are immutable.

## Alerting (private channel only)

`DISCORD_401`, `DISCORD_403`, `DISCORD_DELIVERY_UNKNOWN`, `DATABASE_ERROR`, `ESPN_FAIL`, `ODDS_API_ERROR`, `ODDS_QUOTA_LOW`, `ODDS_QUOTA_EXHAUSTED`, `MARKET_FEED_STALE`, `INJURY_FEED_STALE`, `GRADING_BACKLOG`, `MIGRATION_ERROR`, `MODEL_DATA_FAILURE`, plus legacy codes. 30-minute cooldown.

## Health board

`/health` shows last/next tick, last ESPN, last sportsbook, odds quota, DB, Discord, last official post, last grade, pending grades, `delivery_unknown`, stale jobs, stale injury/market feeds, latest alert.

## Backup / restore

- Neon: use the project backup / PITR. Restore to a new branch before promoting.
- Confirm `protect_confirmed_ticket` still fires after restore (`posted`/`graded`/`delivery_unknown` rows cannot be deleted or rewritten).
- Do not restore over live while `BOATBOYZ_LIVE_POSTING=true`. Flip LIVE off, restore, grade-check, then re-enable.

## Branch protection

- `main` only. Tick workflow is OIDC from `roynewguy/royal-silver-cosmic-fair` on `refs/heads/main`.
- Require PR review before merge. Do not force-push `main`.
- Never enable LIVE from a feature branch UI — there is no such control.

## Accidental live enablement

There is no dashboard toggle for `BOATBOYZ_LIVE_POSTING`. `saveDeskSettings` writes edge / confidence / lead only. Promotion never sets `livePosting: true`. Soak and paper force Discord off.
