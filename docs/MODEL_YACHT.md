# Model Yacht

Public name: **Model Yacht**. One research platform. Independent engines per sport later. Never V5.

Not live. Not a soak change. V2 stays the production champion. BET/PASS, truth gate, freeze, Discord stay outside the model.

This PR is contract + evaluation integrity + dataset schema only. No training. No promotion. No Discord.

## Layout

```
src/lib/model-yacht/core/          sport-neutral primitives
  provenance.ts                    known_at, proven quotes, snapshotProvenanceOk
  snapshot.ts                      hashing + snapshot builder (version is an argument)
  evaluate.ts                      honest ROI (timestamped two-way only)
  leakage.ts                       priors + completion buffer (caller supplies duration)
  versioning.ts                    yachtVersion(sport)

src/lib/model-yacht/sports/mlb/    first specialization
  dataset.ts                       Model Yacht MLB Dataset v1
  data-matrix.ts
  live-snapshot.ts
```

Shared hashing/provenance do **not** bake in `model-yacht-mlb-…`. NFL/NBA/… folders are not built in this PR.

## Historical market provenance

`HistoricalOdds.openCapturedAt` / `closeCapturedAt` are real quote timestamps or null.

If the source does not prove the quote existed at or before `predictionAt`:

- keep the numbers for audit
- mark the opener unusable
- `provenanceOk = false`
- drop from honest ROI
- **never** stamp `predictionAt` onto `capturedAt`

## Live timestamps

Each feature uses only its source clock (`weatherFetchedAt`, `injuriesFetchedAt`, `startersFetchedAt`, `odds.capturedAt`, `fetchedAt` for board fields). `now` / `predictionAt` is not a substitute.

`provenanceOk` requires:

1. `predictionAt < startAt`
2. a proven two-way quote (`openCapturedAt` or current `capturedAt` ≤ predictionAt)
3. every usable feature has `knownAt <= predictionAt`

## Snapshots

`yacht_feature_snapshots` are frozen by a Postgres trigger (no UPDATE/DELETE). Persist snapshot first, then `yacht_dataset_rows.snapshot_id` FK. In-memory datasets do not require DB.

## Evaluation bugs found (kept)

| Bug | Where | Fix |
|---|---|---|
| Closing odds substituted for opening/stake | `train.ts` / `mlb/train.ts` `toEval`: `homeOpen ?? homeClose` | `sideEvalFromMarket` — opener only; missing opener drops the bet from ROI |
| One-sided helper staked away bets at the home price | unused `backtest()` | **Removed**. Zero callsites. |
| Undifferentiated ESPN `moneyLine` treated as both open and close | `parseCoreOdds` | Open and close read only from nested `open` / `close`. ESPN dumps do not provide quote timestamps (`openCapturedAt` stays null). |
| Close fell back to open in the close field | `features.ts` `homeClose ?? homeOpen` | Close stays null if missing. |
| Live V3 row dropped the opposite opening side | `live-features.ts` `awayOpen: null` | Copies `openAwayMl` + both current prices when the two-way quote exists |
| `knownBeforeStart: true` hardcoded | `live-features.ts` | Now derived from snapshot timestamp vs start |

Honest rule: a historical bet is evaluated only at a price that existed at or before prediction time. Close is CLV / comparison only. Never a training feature, never a stake.

## Safety

`canQueueOfficial("model-yacht-mlb-2026.09.1") === false`

Yacht cannot queue, freeze, post official Discord, post free Discord, write public record, or auto-promote.

## Next PR (training — not this one)

Walk-forward Model Yacht MLB Candidate vs V2 / V3 / no-vig market / V4. Only after this contract is accepted. ROI is not enough to promote.
