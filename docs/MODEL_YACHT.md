# Model Yacht

Public name: **Model Yacht**. One research platform. Independent engines per sport. Never V5.

Not live. Not a soak change. V2 stays the production champion.

## Layout

```
src/lib/model-yacht/core/          sport-neutral primitives
  provenance.ts                    known_at, proven quotes, validateSnapshotProvenance
  snapshot.ts                      hashing takes { sport, modelVersion, gameId, predictionAt }
  evaluate.ts                      honest ROI (timestamped two-way only)
  leakage.ts                       priors + completion buffer (caller supplies duration)
  versioning.ts                    yachtVersion(sport)
  output.ts                        yachtPrediction() — never official, 0–1 checks

src/lib/model-yacht/engine/        point-in-time research warehouse
  clocks.ts                        sourceClock only — never now / predictionAt / sibling feed
  extract.ts                       per-source observations + quote-level books
  opener.ts                        true opener = earliest proven quote
  persist.ts                       INSERT ON CONFLICT DO NOTHING
  collect.ts                       isolated from V2 (Safe never rethrows)

src/lib/model-yacht/sports/mlb/    first deep specialization
src/lib/model-yacht/adapters.ts    NFL / NCAAF / NBA / WNBA / NHL / NCAAB / UFC contracts
```

Shared hashing/provenance import **zero** MLB constants.

## Provenance

Historical quotes need `openCapturedAt` / `closeCapturedAt`. Numeric openers without a timestamp stay audit-only: not features, not ROI, `provenanceOk = false`. Never stamp `predictionAt`.

Live features use only their source clock (`fetchedAt`, `weatherFetchedAt`, `injuriesFetchedAt`, `startersFetchedAt`, `odds.capturedAt`).

`validateSnapshotProvenance` is the single core rule every sport uses.

## Snapshots / shadow table

`yacht_feature_snapshots` are frozen by trigger. Persist snapshot first, then rows/predictions (FK).

`yacht_shadow_predictions`: probability/uncertainty/quality in 0–1, `official` must be false, version like `model-yacht-%`.

## Data Engine

Point-in-time warehouse for all eight sports. Observations and quotes are immutable.

- Source clocks only: board `fetchedAt`, weather `weatherFetchedAt`, injuries `injuriesFetchedAt`, starters `startersFetchedAt`, market `odds.capturedAt`.
- Missing / future / unparseable timestamps → unproven. No `predictionAt` / now / cross-feed fallback. Yacht does not use `packModelInputs().capturedAt`.
- True opener = first proven quote. Claimed ESPN open without a timestamp is audit-only.
- Close / scores / results / CLV live in `yacht_eval_facts` (or `role=close` evaluation-only quotes) and are never prediction features.
- Collection is isolated from V2: failure alerts `MODEL_DATA_FAILURE` and skips; soak/truth/freeze continue.

## Next

Training is a later PR. Do not promote from ROI.
