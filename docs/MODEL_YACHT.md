# Model Yacht

Public name: **Model Yacht**. Internal candidate: `model-yacht-mlb-2026.09.1`.

Not V5. Not live. Not a soak change. V2 stays the production champion.

This PR is contract + evaluation integrity + dataset schema only. No training. No promotion. No Discord.

## Evaluation bugs found

| Bug | Where | Fix |
|---|---|---|
| Closing odds substituted for opening/stake | `train.ts` / `mlb/train.ts` `toEval`: `homeOpen ?? homeClose` | `sideEvalFromMarket` — opener only; missing opener drops the bet from ROI |
| One-sided helper staked away bets at the home price | unused `backtest()` (`price = sideHome ? stakePrice : stakePrice`) | **Removed**. Zero callsites. |
| Undifferentiated ESPN `moneyLine` treated as both open and close | `parseCoreOdds` | Open and close read only from nested `open` / `close`. Bare `moneyLine` is not a proven pregame price. |
| Close fell back to open in the close field | `features.ts` `homeClose ?? homeOpen` | Close stays null if missing. Open is not a closer. |
| Live V3 row dropped the opposite opening side | `live-features.ts` `awayOpen: null` | Copies `openAwayMl` + both current prices when the two-way quote exists |
| `knownBeforeStart: true` hardcoded | `live-features.ts` | Now derived from snapshot timestamp vs start |

Legacy `backtest()` was **not used** anywhere (`train.ts` called `backtestSides` + `honestBacktest` only). The close-as-stake leak **was** used via `toEval`.

Honest rule: a historical bet is evaluated only at a price that existed at or before prediction time. Close is CLV / comparison only. Never a training feature, never a stake.

## Leakage protections

- `known_at <= prediction_at` or the feature is unusable
- Yacht priors require the previous game to have started ≥ 3.5h before prediction (no same-day unfinished leak)
- No future games in the dataset (`now` cut)
- Scores / close / result cannot live in the feature bag
- Starter ERA from historical scoreboard dumps is **unproven** — stored missing, not invented
- FIP / xFIP / wRC+ / handedness / bullpen / lineup / park factor / structured weather: missing

## Data we have vs data we still need

See `src/lib/model-yacht/data-matrix.ts` (source of truth).

**Have (usable with provenance):** team form last 5/10, run diff, restDays from priors, venue name, live DK two-way current, live DK first-seen open (home+away), ESPN BET nested open/close when present, injury board, weather string, consensus/dispersion when Odds API returns extra books.

**Partial:** starter name/ERA/WHIP (live timestamped; historical dump unproven), FanDuel/BetMGM/Caesars (live scan consensus only, not historical), line move (needs proven open+current).

**Do not have — do not invent:** FIP, xFIP, SIERA, K%, BB%, K-BB%, HR/9, wRC+, handedness, bullpen IP 1/3/7, high-leverage usage, confirmed lineup, OPS/OBP/SLG, numeric park factor, structured temp/wind/humidity, travel miles, Odds API historical DK (stub, disabled).

## Dataset

`Model Yacht MLB Dataset v1` — each kept row has game identity, `prediction_at`, feature snapshot, target, two-sided pregame market, closing market separately, missingness, quality, provenance.

SQL: `migrations/0030_model_yacht.sql` (`yacht_feature_snapshots`, `yacht_dataset_rows`). Unused by the production tick.

## Safety

`canQueueOfficial("model-yacht-mlb-2026.09.1") === false`

Yacht cannot queue, freeze, post official Discord, post free Discord, write public record, or auto-promote.

## Next PR (training — not this one)

Walk-forward Model Yacht MLB Candidate vs V2 / V3 / no-vig market / V4. Metrics: Brier, log loss, calibration, then CLV / ROI / accuracy. ROI is not enough to promote.
